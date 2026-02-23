import fetch from 'node-fetch';

/**
 * Fetch the release notes for a GitHub repository tag.
 * @param {string} repo - e.g. "owner/repository"
 * @param {string} tag  - e.g. "v1.2.3"
 * @returns {Promise<{ name: string, body: string, url: string } | null>}
 */
export async function fetchReleaseNotes(repo, tag) {
  try {
    const headers = { 'User-Agent': 'ImagePulse/1.0' };
    if (process.env.GITHUB_TOKEN) {
      headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    // Try direct tag lookup first
    const directRes = await fetch(
      `https://api.github.com/repos/${repo}/releases/tags/${tag}`,
      { headers }
    );

    if (directRes.ok) {
      const data = await directRes.json();
      return { name: data.name, body: data.body, url: data.html_url };
    }

    // Fall back to listing releases and matching by tag_name
    if (directRes.status === 404) {
      const listRes = await fetch(
        `https://api.github.com/repos/${repo}/releases`,
        { headers }
      );
      if (!listRes.ok) return null;
      const releases = await listRes.json();
      const match = releases.find((r) => r.tag_name === tag);
      if (!match) return null;
      return { name: match.name, body: match.body, url: match.html_url };
    }

    return null;
  } catch {
    return null;
  }
}
