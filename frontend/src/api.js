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
