import logger from '../logger.js';
import { getDb, getSetting } from '../db/index.js';
import { sendNtfy } from './ntfy.js';
import { sendEmail } from './email.js';
import { parseImageRef } from './registry.js';

function normalizeTag(tag) {
  // Anchored match: tag must START with an optional "version-" prefix, optional "v", then digits.
  // Rejects channel tags like "stable-alpine3.23" where the version number is incidental.
  // e.g. "version-29.0.1" → "29.0.1", "v1.2.3" → "1.2.3", "1.31.1-alpine3.23" → "1.31.1"
  //      "stable-alpine3.23" → null, "trixie-slim" → null, "48" → null
  const m = /^(?:version-)?v?(\d+\.\d+(?:\.\d+)*)/.exec(tag);
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
    // ordering=last_updated (newest first) surfaces recently-released version tags on page 1
    // for both linuxserver-style (version-34.0.0) and library-style (1.31.1-alpine3.23) images
    let url = `https://hub.docker.com/v2/repositories/${namespace}/${name}/tags?page_size=100&ordering=last_updated`;
    let pages = 0;
    const tags = [];
    while (url && pages < 5) {
      pages++;
      const res = await fetch(url);
      if (!res.ok) { if (pages === 1) return null; break; }
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

function analyzeVersions(pinnedTag, allTags) {
  const pinnedNorm = normalizeTag(pinnedTag);
  if (!pinnedNorm) return { newerSameMajor: null, newestOverall: null };
  const pinnedMajor = Number(pinnedNorm.split('.')[0]);

  let sameMajorRaw = null, sameMajorNorm = pinnedNorm;
  let overallRaw = null,   overallNorm   = pinnedNorm;

  for (const tag of allTags) {
    const norm = normalizeTag(tag);
    if (!norm) continue;
    const major = Number(norm.split('.')[0]);
    if (major === pinnedMajor && compareSemver(norm, sameMajorNorm) > 0) {
      sameMajorRaw = tag; sameMajorNorm = norm;
    }
    if (compareSemver(norm, overallNorm) > 0) {
      overallRaw = tag; overallNorm = norm;
    }
  }

  // Only report newestOverall when it is a higher major than the pinned line
  const overallMajor = overallRaw ? Number(overallNorm.split('.')[0]) : pinnedMajor;
  return {
    newerSameMajor: sameMajorRaw,
    newestOverall: overallRaw && overallMajor !== pinnedMajor ? overallRaw : null,
  };
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

  const { newerSameMajor, newestOverall } = analyzeVersions(mapping.pinned_tag, allTags);
  if (!newerSameMajor && !newestOverall) return;

  // Dedup: use the most-significant newer tag as the key
  const dedupKey = newestOverall || newerSameMajor;
  if (dedupKey === mapping.pinned_tag_notified) return;

  const imageName     = mapping.image.split('/').pop();
  const pinnedNorm    = normalizeTag(mapping.pinned_tag) || mapping.pinned_tag;
  const sameMajorDisp = newerSameMajor ? (normalizeTag(newerSameMajor) || newerSameMajor) : null;
  const overallDisp   = newestOverall  ? (normalizeTag(newestOverall)  || newestOverall)  : null;
  const majorLine     = `${pinnedNorm.split('.')[0]}.x`;

  let title;
  if (newerSameMajor && newestOverall) {
    title = `${imageName}: ${pinnedNorm} -> ${sameMajorDisp} (${overallDisp} available)`;
  } else if (newerSameMajor) {
    title = `${imageName}: ${pinnedNorm} -> ${sameMajorDisp}`;
  } else {
    title = `${imageName}: major update available (${overallDisp})`;
  }

  const ntfyLines = [`Pinned: **${mapping.pinned_tag}**`];
  if (newerSameMajor) ntfyLines.push(`Newest in ${majorLine}: **${newerSameMajor}**`);
  else                ntfyLines.push(`Up to date in ${majorLine}`);
  if (newestOverall)  ntfyLines.push(`Newest overall: **${newestOverall}**`);
  ntfyLines.push(`Image: ${mapping.image}`);
  const ntfyBody = ntfyLines.join('\n');

  const plainLines = [`Pinned: ${mapping.pinned_tag}`];
  if (newerSameMajor) plainLines.push(`Newest in ${majorLine}: ${newerSameMajor}`);
  else                plainLines.push(`Up to date in ${majorLine}`);
  if (newestOverall)  plainLines.push(`Newest overall: ${newestOverall}`);
  plainLines.push(`Image: ${mapping.image}`);
  const plainBody = plainLines.join('\n');

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

  db.prepare('UPDATE mappings SET pinned_tag_notified = ? WHERE image = ?').run(dedupKey, mapping.image);
  logger.info({ image: mapping.image, pinned: mapping.pinned_tag, newerSameMajor, newestOverall }, 'Pinned tag check result');
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
