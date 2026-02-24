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
