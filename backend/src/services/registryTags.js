// Paginated tag listing for OCI distribution registries (ghcr.io, lscr.io, any /v2/ registry).
//
// Why this exists: /v2/<name>/tags/list returns one page (ghcr: 100 tags by
// default) plus a `Link: <...>; rel="next"` header. ghcr lists tags in push
// order, so the NEWEST tags are on the LAST page — reading only page 1 means
// never seeing a new release for any image with more than 100 tags (immich-server
// has 33k+, immich-machine-learning 220k+). See CHANGELOG 1.7.3.

import logger from '../logger.js';

export const PAGE_SIZE = 1000;   // ghcr honours up to 1000; larger values are clamped
export const MAX_PAGES = 500;    // 500k tags; immich-machine-learning needed 224 pages in 2026-11
const REQUEST_TIMEOUT_MS = 15000;
// ghcr throttles bursts with 429 and no Retry-After header (seen 2026-11 after
// ~20 rapid page requests). Back off 1s, 2s, 4s, 8s, 16s before giving up.
const RETRY_STATUSES = new Set([429, 503]);
const MAX_RETRIES = 5;
const RETRY_BASE_MS = 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function retryDelayMs(res, attempt, baseMs) {
  const header = Number(res.headers.get('retry-after'));
  if (Number.isFinite(header) && header > 0) return Math.min(header * 1000, 60000);
  return baseMs * 2 ** attempt;
}

const VERSION_LIKE_RE = /^(?:version-)?v?\d+\.\d+/;
/** Default page filter: keep only tags that could be a version (drops commit-/pr-/sha- noise). */
export const versionLikeTag = (tag) => VERSION_LIKE_RE.test(tag);

/**
 * Parse a `WWW-Authenticate: Bearer realm="...",service="...",scope="..."` challenge.
 * Registries can delegate auth elsewhere — lscr.io answers with realm="https://ghcr.io/token".
 */
export function parseBearerChallenge(header) {
  if (!header || !/^\s*bearer\s/i.test(header)) return null;
  const params = {};
  for (const m of header.matchAll(/(\w+)="([^"]*)"/g)) params[m[1].toLowerCase()] = m[2];
  return params.realm ? params : null;
}

async function fetchToken(host, path, challenge = null) {
  const scope = challenge?.scope || `repository:${path}:pull`;
  const realm = challenge?.realm || `https://${host}/token`;
  const service = challenge?.service || host;
  const tokenUrl = new URL(realm);
  tokenUrl.searchParams.set('service', service);
  tokenUrl.searchParams.set('scope', scope);
  const res = await fetch(tokenUrl, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!res.ok) return null;
  const data = await res.json();
  return data.token || data.access_token || null;
}

/**
 * Resolve the rel="next" URL from a Link header, forcing n=PAGE_SIZE.
 * ghcr echoes back the n we sent — and its own first-page link says n=0,
 * which silently falls back to the 100-tag default.
 */
export function nextPageUrl(linkHeader, currentUrl) {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(',')) {
    const m = /<([^>]+)>\s*;\s*rel="?next"?/i.exec(part);
    if (m) {
      const u = new URL(m[1], currentUrl);
      u.searchParams.set('n', String(PAGE_SIZE));
      return u.href;
    }
  }
  return null;
}

/**
 * List every tag of an image, following pagination.
 *
 * @param {object} opts
 * @param {string} opts.host        registry host, e.g. "ghcr.io"
 * @param {string} opts.path        repository path, e.g. "immich-app/immich-server"
 * @param {boolean} [opts.tokenFirst] fetch an anonymous pull token before the first request (ghcr);
 *                                  otherwise try unauthenticated and fall back to a token on 401
 * @param {(tag: string) => boolean} [opts.filter] keep only matching tags (applied per page, so
 *                                  huge repos don't hold every commit tag in memory)
 * @param {number} [opts.maxPages]
 * @param {string} [opts.label]     image name for log lines
 * @param {number} [opts.retryBaseMs] first back-off delay for 429/503 (tests pass a tiny value)
 * @returns {Promise<{ tags: string[], token: string|null, truncated: boolean, pages: number, seen: number }|null>}
 *   null when the first page can't be fetched. When a later page fails or the
 *   page cap is hit, returns what was collected with truncated=true and logs a warning.
 */
export async function listOciTags({
  host, path, tokenFirst = false, filter = versionLikeTag, maxPages = MAX_PAGES, label,
  retryBaseMs = RETRY_BASE_MS,
}) {
  const image = label || `${host}/${path}`;
  let token = null;
  let challenge = null;
  let retries = 0;
  const get = async (url) => {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!RETRY_STATUSES.has(res.status) || attempt >= MAX_RETRIES) return res;
      retries++;
      await sleep(retryDelayMs(res, attempt, retryBaseMs));
    }
  };

  let url = `https://${host}/v2/${path}/tags/list?n=${PAGE_SIZE}`;
  let res;
  try {
    if (tokenFirst) {
      token = await fetchToken(host, path);
      if (!token) return null;
    }
    res = await get(url);
    if (res.status === 401 && !tokenFirst) {
      challenge = parseBearerChallenge(res.headers.get('www-authenticate'));
      token = await fetchToken(host, path, challenge);
      if (!token) return null;
      res = await get(url);
    }
    if (!res.ok) return null;
  } catch (err) {
    logger.debug({ image, err: err.message }, 'Tag list request failed');
    return null;
  }

  const tags = [];
  let pages = 0;
  let seen = 0;
  let truncated = false;
  let refreshedToken = false;

  for (;;) {
    let data;
    try {
      data = await res.json();
    } catch (err) {
      if (pages === 0) return null;
      logger.warn({ image, pages, seen, err: err.message }, 'Tag list page was not valid JSON; tag list is truncated');
      truncated = true;
      break;
    }
    pages++;
    const pageTags = Array.isArray(data?.tags) ? data.tags : [];
    seen += pageTags.length;
    for (const t of pageTags) if (filter(t)) tags.push(t);

    const next = nextPageUrl(res.headers.get('link'), url);
    if (!next) break;
    if (next === url || pageTags.length === 0) {
      logger.warn({ image, pages, seen, next }, 'Tag list pagination made no progress; tag list is truncated');
      truncated = true;
      break;
    }
    if (pages >= maxPages) {
      logger.warn({ image, pages, seen, maxPages }, 'Tag list page cap reached; tag list is truncated and newer tags may be missed');
      truncated = true;
      break;
    }

    url = next;
    try {
      res = await get(url);
      // Anonymous tokens are short-lived; refresh once if one expires mid-listing.
      if (res.status === 401 && token && !refreshedToken) {
        refreshedToken = true;
        token = await fetchToken(host, path, challenge);
        if (token) res = await get(url);
      }
    } catch (err) {
      logger.warn({ image, pages, seen, err: err.message }, 'Tag list page request failed; tag list is truncated');
      truncated = true;
      break;
    }
    if (!res.ok) {
      logger.warn({ image, pages, seen, status: res.status }, 'Tag list page request failed; tag list is truncated');
      truncated = true;
      break;
    }
  }

  logger.debug({ image, pages, seen, kept: tags.length, truncated, retries }, 'Fetched registry tag list');
  return { tags, token, truncated, pages, seen, retries };
}
