import logger from '../logger.js';
import { getDb, getSetting } from '../db/index.js';
import { sendNtfy } from './ntfy.js';
import { sendEmail } from './email.js';
import { parseImageRef } from './registry.js';

function normalizeTag(tag) {
  // Match the first numeric version substring with at least two segments.
  // Handles prefixes like "version-", "v", "amd64-", and suffixes like "-ls436".
  // e.g. "version-29.0.1" → "29.0.1", "v1.2.3" → "1.2.3", "48" → null
  const m = /(\d+\.\d+(?:\.\d+)*)/.exec(tag);
  return m ? m[1] : null;
}

function compareSemver(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

async function fetchHubTags(namespace, name) {
  try {
    // ordering=name surfaces versioned tags (e.g. "version-34.0.0") before build-number-only tags
    let url = `https://hub.docker.com/v2/repositories/${namespace}/${name}/tags?page_size=100&ordering=name`;
    let pages = 0;
    const tags = [];
    while (url && pages < 5) {
      pages++;
      const res = await fetch(url);
      if (!res.ok) break;
      const data = await res.json();
      for (const t of data.results || []) tags.push(t.name);
      url = data.next || null;
    }
    return tags;
  } catch {
    return null;
  }
}

async function fetchGhcrTags(namespace, name) {
  try {
    const scope = `repository:${namespace}/${name}:pull`;
    const tokenRes = await fetch(
      `https://ghcr.io/token?service=ghcr.io&scope=${encodeURIComponent(scope)}`
    );
    if (!tokenRes.ok) return null;
    const tokenData = await tokenRes.json();
    const token = tokenData.token || tokenData.access_token || null;
    if (!token) return null;

    const tagsRes = await fetch(
      `https://ghcr.io/v2/${namespace}/${name}/tags/list`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!tagsRes.ok) return null;
    const tagsData = await tagsRes.json();
    return tagsData.tags || [];
  } catch {
    return null;
  }
}

async function fetchOciTags(host, imagePath) {
  try {
    let tagsRes = await fetch(`https://${host}/v2/${imagePath}/tags/list`);
    if (tagsRes.status === 401) {
      const scope = `repository:${imagePath}:pull`;
      const tokenRes = await fetch(
        `https://${host}/token?service=${host}&scope=${encodeURIComponent(scope)}`
      );
      if (!tokenRes.ok) return null;
      const tokenData = await tokenRes.json();
      const token = tokenData.token || tokenData.access_token || null;
      if (!token) return null;
      tagsRes = await fetch(`https://${host}/v2/${imagePath}/tags/list`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    }
    if (!tagsRes.ok) return null;
    const tagsData = await tagsRes.json();
    return tagsData.tags || [];
  } catch {
    return null;
  }
}

function findNewerSameMajor(pinnedTag, allTags) {
  const pinnedNorm = normalizeTag(pinnedTag);
  if (!pinnedNorm) return null;
  const pinnedMajor = Number(pinnedNorm.split('.')[0]);

  let bestRaw = null;
  let bestNorm = pinnedNorm;

  for (const tag of allTags) {
    const norm = normalizeTag(tag);
    if (!norm) continue;
    if (Number(norm.split('.')[0]) !== pinnedMajor) continue;
    if (compareSemver(norm, bestNorm) > 0) {
      bestRaw = tag;
      bestNorm = norm;
    }
  }

  return bestRaw && compareSemver(bestNorm, pinnedNorm) > 0 ? bestRaw : null;
}

async function checkOneMapping(db, mapping) {
  const ref = parseImageRef(mapping.image);
  let allTags = null;

  if (ref.type === 'hub') {
    allTags = await fetchHubTags(ref.namespace, ref.name);
  } else if (ref.type === 'ghcr') {
    allTags = await fetchGhcrTags(ref.namespace, ref.name);
  } else {
    allTags = await fetchOciTags(ref.host, ref.path);
  }

  db.prepare(
    "UPDATE mappings SET pinned_tag_last_checked = datetime('now') WHERE image = ?"
  ).run(mapping.image);

  if (!allTags) {
    logger.warn({ image: mapping.image }, 'Could not fetch tags for pinned tag check');
    return;
  }

  const newerTag = findNewerSameMajor(mapping.pinned_tag, allTags);
  if (!newerTag) return;

  if (newerTag === mapping.pinned_tag_notified) return;

  const imageName = mapping.image.split('/').pop();
  const title = `${imageName}: newer tag available`;
  const ntfyBody = `Pinned: **${mapping.pinned_tag}**\nNewer: **${newerTag}**\nImage: ${mapping.image}`;
  const plainBody = `Pinned: ${mapping.pinned_tag}\nNewer: ${newerTag}\nImage: ${mapping.image}`;

  if (getSetting('ntfy_enabled') === 'true') {
    try {
      await sendNtfy({ title, body: ntfyBody, tags: ['arrow_up'], priority: 3 });
    } catch (err) {
      logger.error({ err: err.message }, 'ntfy pinned-tag notification failed');
    }
  }

  if (getSetting('email_enabled') === 'true') {
    try {
      await sendEmail({ subject: `[ImagePulse] ${title}`, text: plainBody });
    } catch (err) {
      logger.error({ err: err.message }, 'Email pinned-tag notification failed');
    }
  }

  db.prepare('UPDATE mappings SET pinned_tag_notified = ? WHERE image = ?').run(newerTag, mapping.image);
  logger.info({ image: mapping.image, pinned: mapping.pinned_tag, newer: newerTag }, 'Pinned tag newer version found');
}

export async function checkPinnedTags() {
  const db = getDb();
  const mappings = db.prepare(
    "SELECT * FROM mappings WHERE pinned_tag IS NOT NULL AND pinned_tag != ''"
  ).all();

  for (const mapping of mappings) {
    try {
      await checkOneMapping(db, mapping);
    } catch (err) {
      logger.warn({ image: mapping.image, err: err.message }, 'Pinned tag check failed');
    }
  }
}
