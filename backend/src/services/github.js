// TODO: Fetch GitHub release notes for a given repo + tag.

/**
 * Fetch the release notes for a GitHub repository tag.
 * @param {string} repo - e.g. "owner/repository"
 * @param {string} tag  - e.g. "v1.2.3"
 * @returns {Promise<{ name: string, body: string, url: string } | null>}
 */
export async function fetchReleaseNotes(repo, tag) {
  // TODO: implement GitHub Releases API call
  // GET https://api.github.com/repos/{repo}/releases/tags/{tag}
  // Fall back to listing releases and matching by tag if direct lookup fails
  return null;
}
