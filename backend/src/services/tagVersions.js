// Pure tag/version helpers for the pinned-tag watcher and registry lookups.
// No DB, network or logger imports — safe to load directly from unit tests.

// Anchored: tag must START with an optional "version-" prefix, optional "v", then x.y[.z...].
// Rejects channel tags like "stable-alpine3.23" where the version number is incidental.
const VERSION_RE = /^(?:version-)?v?(\d+\.\d+(?:\.\d+)*)(.*)$/;

// Pre-release markers, as whole tokens ("rc", "rc1", "beta2") ...
const PRE_WORD_RE = /^(alpha|beta|rc|dev|pre|preview|nightly|snapshot|canary|unstable)(\d*)$/i;
// ... or PEP 440 short forms glued to a number ("a1", "b2")
const PEP440_RE = /^(a|b)(\d+)$/i;

const PRE_ALIASES = { a: 'alpha', b: 'beta' };
const PRE_RANK = {
  dev: 0, nightly: 0, snapshot: 0, canary: 0, unstable: 0,
  alpha: 1, beta: 2, pre: 3, preview: 3, rc: 4,
};

/**
 * Parse a tag into its version parts.
 *   "v3.4.0-rc.1-cuda"  → { core: '3.4.0', prerelease: ['rc', 1], flavor: 'cuda' }
 *   "1.31.1-alpine3.23" → { core: '1.31.1', prerelease: null, flavor: 'alpine' }
 *   "version-5.9.0"     → { core: '5.9.0', prerelease: null, flavor: '' }
 *   "v1.36.0_55-dev"    → { core: '1.36.0', prerelease: ['dev'], flavor: '' }
 *   "commit-abc123", "stable-alpine3.23", "48" → null
 *
 * `flavor` is the variant suffix with digits stripped (so "-alpine3.23" and
 * "-alpine3.24" are the same flavor, as are "-ls45" and "-ls46").
 * `shape` is the whole tag with digit runs replaced by "N" — used only as a
 * tie-break so a "version-x.y.z" pin reports "version-…" tags, etc.
 *
 * @param {string} tag
 * @returns {{ core: string, nums: number[], prerelease: Array<string|number>|null, flavor: string, shape: string }|null}
 */
export function parseTag(tag) {
  if (typeof tag !== 'string') return null;
  const m = VERSION_RE.exec(tag);
  if (!m) return null;
  return buildParsed(tag, m[1], m[2]);
}

// Major-only pin: "2", "v2", "2-slim", "2-slim-rootless". The character after the
// major must be a separator other than "." (x.y forms are handled by VERSION_RE).
const MAJOR_ONLY_RE = /^(?:version-)?v?(\d+)((?:[-_+].*)?)$/;

/**
 * Parse a *pinned* tag. Accepts everything parseTag does, plus major-only
 * floating tags ("2", "2-slim") — marked `majorOnly: true`.
 * Candidate tags from a registry must still go through parseTag, so floating
 * aliases like "2" or "1" in a tag list are never mistaken for releases.
 */
export function parsePinnedTag(tag) {
  const full = parseTag(tag);
  if (full) return { ...full, majorOnly: false };
  if (typeof tag !== 'string') return null;
  const m = MAJOR_ONLY_RE.exec(tag);
  if (!m) return null;
  return { ...buildParsed(tag, m[1], m[2]), majorOnly: true };
}

function buildParsed(tag, core, rest) {
  const tokens = rest.split(/[-_.+]/).filter(Boolean);
  let prerelease = null;
  let inPre = false;
  const flavorParts = [];

  for (const tok of tokens) {
    if (!prerelease) {
      const pm = PRE_WORD_RE.exec(tok) || PEP440_RE.exec(tok);
      if (pm) {
        const name = pm[1].toLowerCase();
        prerelease = [PRE_ALIASES[name] || name];
        if (pm[2]) prerelease.push(Number(pm[2]));
        inPre = true;
        continue;
      }
    }
    if (inPre && /^\d+$/.test(tok)) { prerelease.push(Number(tok)); continue; }
    inPre = false;
    const word = tok.toLowerCase().replace(/\d+/g, '');
    if (word) flavorParts.push(word);
  }

  return {
    core,
    nums: core.split('.').map(Number),
    prerelease,
    flavor: flavorParts.join('-'),
    shape: tag.replace(/\d+/g, 'N'),
  };
}

/**
 * Numeric version core of a tag, or null if it isn't a version tag.
 * e.g. "version-29.0.1" → "29.0.1", "v1.2.3" → "1.2.3", "1.31.1-alpine3.23" → "1.31.1"
 */
export function normalizeTag(tag) {
  return parseTag(tag)?.core ?? null;
}

/** True when the tag is a version tag carrying a pre-release marker (-rc, -beta, -dev, ...). */
export function isPrerelease(tag) {
  return Boolean(parseTag(tag)?.prerelease);
}

function compareNums(pa, pb) {
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function comparePre(a, b) {
  // A final release outranks any pre-release of the same core version.
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  const rank = (PRE_RANK[a[0]] ?? 0) - (PRE_RANK[b[0]] ?? 0);
  if (rank !== 0) return rank;
  // Same marker: compare numeric identifiers; fewer identifiers sort lower ("rc" < "rc.1").
  const len = Math.max(a.length, b.length);
  for (let i = 1; i < len; i++) {
    if (a[i] === undefined) return -1;
    if (b[i] === undefined) return 1;
    const diff = a[i] - b[i];
    if (diff !== 0) return diff;
  }
  return 0;
}

/** Compare two parsed tags (output of parseTag). <0, 0, >0 like a sort comparator. */
export function compareParsed(a, b) {
  return compareNums(a.nums, b.nums) || comparePre(a.prerelease, b.prerelease);
}

/**
 * Compare two version tags by precedence. Flavor is ignored.
 * "v3.4.0" > "v3.4.0-rc.3" > "v3.4.0-rc.1" > "v3.3.6".
 * Non-version tags sort below every version tag.
 */
export function compareVersions(a, b) {
  const pa = parseTag(a), pb = parseTag(b);
  if (!pa || !pb) return (pa ? 1 : 0) - (pb ? 1 : 0);
  return compareParsed(pa, pb);
}

/**
 * Find newer tags than the pinned one.
 *  - Only tags of the same flavor as the pin are considered ("v3.3.6" never
 *    matches "v3.4.1-cuda"; "1.31.1-alpine3.23" only matches "-alpine…" tags).
 *  - Pre-release tags are ignored unless the pin itself is a pre-release.
 *  - Among tags of equal precedence, the one shaped like the pin wins.
 *  - A major-only pin ("2", "2-slim") floats within its major line, so only a
 *    higher major is reported (newestOverall); newerSameMajor is always null.
 *
 * @param {string} pinnedTag
 * @param {string[]} allTags
 * @returns {{ newerSameMajor: string|null, newestOverall: string|null }}
 *   newestOverall is only reported when it is a higher major than the pin.
 */
export function analyzeVersions(pinnedTag, allTags) {
  const pinned = parsePinnedTag(pinnedTag);
  if (!pinned) return { newerSameMajor: null, newestOverall: null };
  const allowPre = pinned.prerelease !== null;
  const pinnedMajor = pinned.nums[0];

  let sameMajor = null; // { tag, p }
  let overall = null;

  const better = (cand, best) => {
    if (!best) return true;
    const c = compareParsed(cand.p, best.p);
    if (c !== 0) return c > 0;
    return cand.p.shape === pinned.shape && best.p.shape !== pinned.shape;
  };

  for (const tag of allTags) {
    const p = parseTag(tag);
    if (!p) continue;
    if (p.flavor !== pinned.flavor) continue;
    if (p.prerelease && !allowPre) continue;
    if (compareParsed(p, pinned) <= 0) continue;
    if (pinned.majorOnly && p.nums[0] <= pinnedMajor) continue;

    const cand = { tag, p };
    if (p.nums[0] === pinnedMajor && better(cand, sameMajor)) sameMajor = cand;
    if (better(cand, overall)) overall = cand;
  }

  return {
    newerSameMajor: sameMajor ? sameMajor.tag : null,
    newestOverall: overall && overall.p.nums[0] !== pinnedMajor ? overall.tag : null,
  };
}
