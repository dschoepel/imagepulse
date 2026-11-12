import logger from '../logger.js';
import { getDb, getSetting } from '../db/index.js';
import { sendNtfy } from './ntfy.js';
import { sendEmail } from './email.js';
import { parseImageRef } from './registry.js';
import { listOciTags } from './registryTags.js';
import { analyzeVersions, normalizeTag } from './tagVersions.js';

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

// Pinned tags that can't be compared (e.g. "alpine", "2") — warned about once per process.
const _warnedUnparseable = new Set();

async function checkOneMapping(db, mapping) {
  const markChecked = () => db.prepare(
    "UPDATE mappings SET pinned_tag_last_checked = datetime('now') WHERE image = ?"
  ).run(mapping.image);

  if (!normalizeTag(mapping.pinned_tag)) {
    // Not a version tag, so there's nothing to compare against — say so instead of
    // silently never alerting.
    const key = `${mapping.image}:${mapping.pinned_tag}`;
    if (!_warnedUnparseable.has(key)) {
      _warnedUnparseable.add(key);
      logger.warn({ image: mapping.image, pinned: mapping.pinned_tag },
        'Pinned tag is not a version (expected e.g. v1.2.3, 1.2, version-1.2.3); skipping pinned tag check');
    }
    markChecked();
    return;
  }

  const ref = parseImageRef(mapping.image);
  let allTags = null;

  if (ref.type === 'hub') {
    allTags = await fetchHubTags(ref.namespace, ref.name);
  } else if (ref.type === 'ghcr') {
    const list = await listOciTags({
      host: 'ghcr.io', path: `${ref.namespace}/${ref.name}`, tokenFirst: true, label: mapping.image,
    });
    allTags = list ? list.tags : null;
  } else {
    const list = await listOciTags({ host: ref.host, path: ref.path, label: mapping.image });
    allTags = list ? list.tags : null;
  }

  markChecked();

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
