// Registry digest → version tag lookup service.
// Resolves a `latest` digest to a semver tag by querying the registry's tag list.

import logger from '../logger.js';

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
function parseImageRef(image) {
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

/**
 * Fetch an anonymous OCI pull token.
 */
async function fetchOciToken(host, scope) {
  const res = await fetch(
    `https://${host}/token?service=${host}&scope=${encodeURIComponent(scope)}`
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data.token || data.access_token || null;
}

/**
 * Resolve via GHCR using OCI token + HEAD manifests.
 */
async function resolveFromGhcr(namespace, name, digest) {
  const scope = `repository:${namespace}/${name}:pull`;
  const token = await fetchOciToken('ghcr.io', scope);
  if (!token) return null;

  const tagsRes = await fetch(
    `https://ghcr.io/v2/${namespace}/${name}/tags/list`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!tagsRes.ok) return null;
  const tagsData = await tagsRes.json();

  const candidates = (tagsData.tags || [])
    .filter((t) => SEMVER_RE.test(t))
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' }))
    .slice(0, 20);

  const acceptHeader = [
    'application/vnd.docker.distribution.manifest.list.v2+json',
    'application/vnd.oci.image.index.v1+json',
    'application/vnd.docker.distribution.manifest.v2+json',
  ].join(', ');

  for (const tag of candidates) {
    const headRes = await fetch(
      `https://ghcr.io/v2/${namespace}/${name}/manifests/${tag}`,
      {
        method: 'HEAD',
        headers: { Authorization: `Bearer ${token}`, Accept: acceptHeader },
      }
    );
    if (headRes.ok && headRes.headers.get('docker-content-digest') === digest) {
      return tag;
    }
  }
  return null;
}

/**
 * Resolve via a generic OCI registry using HEAD manifests.
 * Tries unauthenticated first; falls back to token auth on 401.
 */
async function resolveFromOci(host, imagePath, digest) {
  const acceptHeader = [
    'application/vnd.docker.distribution.manifest.list.v2+json',
    'application/vnd.oci.image.index.v1+json',
    'application/vnd.docker.distribution.manifest.v2+json',
  ].join(', ');

  // Attempt to list tags — unauthenticated first
  let tagsRes = await fetch(`https://${host}/v2/${imagePath}/tags/list`);

  let token = null;
  if (tagsRes.status === 401) {
    const scope = `repository:${imagePath}:pull`;
    token = await fetchOciToken(host, scope);
    if (!token) return null;
    tagsRes = await fetch(`https://${host}/v2/${imagePath}/tags/list`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }
  if (!tagsRes.ok) return null;

  const tagsData = await tagsRes.json();
  const candidates = (tagsData.tags || [])
    .filter((t) => SEMVER_RE.test(t))
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' }))
    .slice(0, 20);

  const headers = { Accept: acceptHeader };
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
