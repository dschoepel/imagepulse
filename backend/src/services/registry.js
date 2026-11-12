// Registry digest → version tag lookup service.
// Resolves a `latest` digest to a semver tag by querying the registry's tag list.

import logger from '../logger.js';
import { listOciTags } from './registryTags.js';
import { parseTag, compareParsed } from './tagVersions.js';

const _cache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

function getCached(key) {
  const entry = _cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) { _cache.delete(key); return undefined; }
  return entry.value;
}

function setCached(key, value) {
  _cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL });
}

/**
 * Parse an image reference string into a structured object.
 * @param {string} image
 * @returns {{ type: 'hub'|'ghcr'|'oci', namespace?: string, name?: string, host?: string, path?: string }}
 */
export function parseImageRef(image) {
  // Strip docker.io/ prefix — Docker Hub images are often fully-qualified with it
  if (image.startsWith('docker.io/')) {
    image = image.slice('docker.io/'.length);
  }

  if (image.startsWith('ghcr.io/')) {
    const rest = image.slice('ghcr.io/'.length);
    const slash = rest.indexOf('/');
    if (slash === -1) return { type: 'ghcr', namespace: rest, name: '' };
    return { type: 'ghcr', namespace: rest.slice(0, slash), name: rest.slice(slash + 1) };
  }

  const firstSegment = image.split('/')[0];
  if (firstSegment.includes('.') && firstSegment !== 'docker.io') {
    // Generic OCI registry — host is first segment, path is the rest
    const slashIdx = image.indexOf('/');
    return { type: 'oci', host: firstSegment, path: image.slice(slashIdx + 1) };
  }

  // Docker Hub
  const slashCount = (image.match(/\//g) || []).length;
  if (slashCount === 0) {
    return { type: 'hub', namespace: 'library', name: image };
  }
  const slash = image.indexOf('/');
  return { type: 'hub', namespace: image.slice(0, slash), name: image.slice(slash + 1) };
}

/**
 * Best-effort guess at the GitHub owner/repo for an image, for pre-filling the
 * mapping create form. Pure/offline — no network calls; the actual GitHub
 * existence check happens client-side via GET /settings/validate-mapping.
 * @param {string} image
 * @returns {{ guessedRepo: string|null, guessConfidence: 'high'|'medium'|null }}
 */
export function guessRepoFromImage(image) {
  const ref = parseImageRef(image);
  // ghcr.io/<namespace>/<name> — namespace IS a GitHub org/user, so this is
  // usually correct.
  if (ref.type === 'ghcr' && ref.namespace && ref.name) {
    return { guessedRepo: `${ref.namespace}/${ref.name}`, guessConfidence: 'high' };
  }

  // LinuxServer.io images — via Docker Hub (docker.io/linuxserver/<name>) or
  // their own registry mirror (lscr.io/linuxserver/<name>, which parses as a
  // generic 'oci' host below) — are unusually consistent: every one of their
  // ~100+ images lives on GitHub as linuxserver/docker-<name>. Reliable
  // enough to rate 'high' rather than the generic Docker Hub 'medium' guess.
  const linuxserverName =
    ref.type === 'hub' && ref.namespace === 'linuxserver' && ref.name ? ref.name :
    ref.type === 'oci' && ref.host === 'lscr.io' && ref.path?.startsWith('linuxserver/') ? ref.path.slice('linuxserver/'.length) :
    null;
  if (linuxserverName) {
    return { guessedRepo: `linuxserver/docker-${linuxserverName}`, guessConfidence: 'high' };
  }

  // Docker Hub, non-official (namespace !== 'library') — a common convention
  // (Hub username == GitHub username) but not guaranteed.
  if (ref.type === 'hub' && ref.namespace && ref.namespace !== 'library' && ref.name) {
    return { guessedRepo: `${ref.namespace}/${ref.name}`, guessConfidence: 'medium' };
  }
  // Docker Hub official images (library/*) and other arbitrary OCI hosts have
  // no reliable 1:1 GitHub mapping — don't guess.
  return { guessedRepo: null, guessConfidence: null };
}

const SEMVER_RE = /^v?\d+\.\d+/;

/**
 * Resolve via Docker Hub tags API.
 */
async function resolveFromHub(namespace, name, digest) {
  let url = `https://hub.docker.com/v2/repositories/${namespace}/${name}/tags?page_size=100&ordering=-last_updated`;
  let pages = 0;

  while (url && pages < 3) {
    pages++;
    const res = await fetch(url);
    if (!res.ok) break;
    const data = await res.json();

    const match = (data.results || []).find(
      (t) => SEMVER_RE.test(t.name) && t.digest === digest
    );
    if (match) return match.name;

    url = data.next || null;
  }
  return null;
}

const MAX_HEAD_CANDIDATES = 20;

const MANIFEST_ACCEPT = [
  'application/vnd.docker.distribution.manifest.list.v2+json',
  'application/vnd.oci.image.index.v1+json',
  'application/vnd.docker.distribution.manifest.v2+json',
].join(', ');

/**
 * Order semver-ish tags newest first (a release above its own pre-releases),
 * with plain tags ahead of variants of the same version (v1.2.3 before
 * v1.2.3-cuda), and keep the top N to HEAD.
 */
export function rankDigestCandidates(tags, limit = MAX_HEAD_CANDIDATES) {
  return tags
    .map((tag) => ({ tag, p: parseTag(tag) }))
    .filter((c) => c.p)
    .sort((a, b) => compareParsed(b.p, a.p) || (a.p.flavor ? 1 : 0) - (b.p.flavor ? 1 : 0))
    .slice(0, limit)
    .map((c) => c.tag);
}

async function findTagByDigest(host, imagePath, candidates, token, digest) {
  const headers = { Accept: MANIFEST_ACCEPT };
  if (token) headers.Authorization = `Bearer ${token}`;
  for (const tag of candidates) {
    const headRes = await fetch(
      `https://${host}/v2/${imagePath}/manifests/${tag}`,
      { method: 'HEAD', headers }
    );
    if (headRes.ok && headRes.headers.get('docker-content-digest') === digest) {
      return tag;
    }
  }
  return null;
}

/**
 * Resolve via GHCR: full (paginated) tag list, then HEAD manifests of the newest candidates.
 */
async function resolveFromGhcr(namespace, name, digest) {
  const imagePath = `${namespace}/${name}`;
  const list = await listOciTags({
    host: 'ghcr.io', path: imagePath, tokenFirst: true,
    filter: (t) => SEMVER_RE.test(t), label: `ghcr.io/${imagePath}`,
  });
  if (!list) return null;
  return findTagByDigest('ghcr.io', imagePath, rankDigestCandidates(list.tags), list.token, digest);
}

/**
 * Resolve via a generic OCI registry using HEAD manifests.
 * Tries unauthenticated first; falls back to token auth on 401.
 */
async function resolveFromOci(host, imagePath, digest) {
  const list = await listOciTags({
    host, path: imagePath,
    filter: (t) => SEMVER_RE.test(t), label: `${host}/${imagePath}`,
  });
  if (!list) return null;
  return findTagByDigest(host, imagePath, rankDigestCandidates(list.tags), list.token, digest);
}

/**
 * Resolve the version tag for a `latest` digest by querying the registry.
 * Returns the matched semver tag string, or null if not found.
 * Always degrades gracefully — never throws.
 *
 * @param {string} image  e.g. "nginx", "ghcr.io/owner/repo"
 * @param {string} digest e.g. "sha256:abc123..."
 * @returns {Promise<string|null>}
 */
export async function resolveVersionTag(image, digest) {
  if (!image || !digest) return null;

  const cacheKey = `${image}@${digest}`;
  const cached = getCached(cacheKey);
  if (cached !== undefined) return cached;

  try {
    const ref = parseImageRef(image);
    let result = null;

    if (ref.type === 'hub') {
      result = await resolveFromHub(ref.namespace, ref.name, digest);
    } else if (ref.type === 'ghcr') {
      result = await resolveFromGhcr(ref.namespace, ref.name, digest);
    } else {
      result = await resolveFromOci(ref.host, ref.path, digest);
    }

    setCached(cacheKey, result);
    return result;
  } catch (err) {
    logger.warn({ image, err: err.message }, 'Registry version lookup failed');
    return null;
  }
}
