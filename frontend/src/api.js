export async function apiFetch(path, options) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/**
 * Validate a GitHub repo string against the GitHub API.
 * Returns { repoExists: true|false|null, repoError?: string }
 * null means uncertain (rate-limited or network error) — treat as a soft warning.
 */
export async function validateRepo(repo) {
  return apiFetch(`/settings/validate-mapping?repo=${encodeURIComponent(repo.trim())}`);
}

/**
 * Validate a URL by checking reachability via a server-side HEAD request.
 * Returns { urlReachable: true|false|null, urlError?: string }
 * null means uncertain (timeout or network error) — treat as a soft warning.
 */
export async function validateUrl(url) {
  return apiFetch(`/settings/validate-url?url=${encodeURIComponent(url.trim())}`);
}

/** List of { image, eventCount, lastSeen, guessedRepo, guessConfidence } for events with no mapping. */
export async function getUnmappedImages() {
  return apiFetch('/settings/unmapped-images');
}

/** { count } of distinct unmapped images — cheap, for the sidebar badge. */
export async function getUnmappedCount() {
  return apiFetch('/settings/unmapped-count');
}

/** Permanently ignore an image so it stops appearing as unmapped. */
export async function ignoreImage(image) {
  return apiFetch('/settings/ignored-images', {
    method: 'POST',
    body: JSON.stringify({ image }),
  });
}

/** List of { image, created_at } previously ignored images. */
export async function getIgnoredImages() {
  return apiFetch('/settings/ignored-images');
}

/** Un-ignore a previously ignored image. */
export async function unignoreImage(image) {
  return apiFetch(`/settings/ignored-images/${encodeURIComponent(image)}`, { method: 'DELETE' });
}
