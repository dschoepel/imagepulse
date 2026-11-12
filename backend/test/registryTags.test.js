import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import logger from '../src/logger.js';
import { listOciTags, nextPageUrl, parseBearerChallenge, PAGE_SIZE } from '../src/services/registryTags.js';
import { rankDigestCandidates } from '../src/services/registry.js';
import { analyzeVersions } from '../src/services/tagVersions.js';

// ── fake registry ───────────────────────────────────────────────────────────
// Serves `tags` like ghcr does: push order, `n` per page (default 100),
// Link header echoing the n it was given (ghcr's first link literally says n=0).
function fakeRegistry(tags, { requireToken = true, failPage = null, echoN = true } = {}) {
  const calls = [];
  const fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    calls.push(url.pathname + url.search);
    if (url.pathname === '/token') {
      return Response.json({ token: 'tkn' });
    }
    if (requireToken && init.headers?.Authorization !== 'Bearer tkn') {
      return new Response('unauthorized', { status: 401 });
    }
    const n = Number(url.searchParams.get('n')) || 100;
    const size = n === 0 ? 100 : Math.min(n, 1000);
    const last = url.searchParams.get('last');
    const start = last ? tags.indexOf(last) + 1 : 0;
    const page = tags.slice(start, start + size);
    const pageNo = Math.floor(start / size) + 1;
    if (failPage && pageNo === failPage) return new Response('boom', { status: 503 });
    const headers = {};
    if (start + size < tags.length) {
      const base = url.pathname;
      headers.Link = `<${base}?last=${encodeURIComponent(page.at(-1))}&n=${echoN ? url.searchParams.get('n') ?? 0 : 0}>; rel="next"`;
    }
    return Response.json({ name: 'x', tags: page }, { headers });
  };
  return { fetch, calls };
}

const synthetic = (count, extra = []) => {
  const tags = [];
  for (let i = 0; i < count; i++) tags.push(i % 3 ? `commit-${i.toString(16).padStart(8, '0')}` : `v1.${i}.0`);
  return [...tags, ...extra];
};

let realFetch;
let warnings;
let realWarn;
beforeEach(() => {
  realFetch = globalThis.fetch;
  warnings = [];
  realWarn = logger.warn;
  logger.warn = (obj, msg) => warnings.push({ obj, msg });
});
afterEach(() => {
  globalThis.fetch = realFetch;
  logger.warn = realWarn;
});

describe('nextPageUrl', () => {
  test('resolves relative links and forces n', () => {
    const next = nextPageUrl(
      '</v2/immich-app/immich-server/tags/list?last=v1.91.1&n=0>; rel="next"',
      'https://ghcr.io/v2/immich-app/immich-server/tags/list?n=1000'
    );
    assert.equal(next, `https://ghcr.io/v2/immich-app/immich-server/tags/list?last=v1.91.1&n=${PAGE_SIZE}`);
  });
  test('absolute link and multiple rels', () => {
    const next = nextPageUrl(
      '<https://r.example/v2/a/tags/list?last=z>; rel="prev", <https://r.example/v2/a/tags/list?last=b>; rel="next"',
      'https://r.example/v2/a/tags/list'
    );
    assert.equal(next, `https://r.example/v2/a/tags/list?last=b&n=${PAGE_SIZE}`);
  });
  test('no link → null', () => assert.equal(nextPageUrl(null, 'https://x/'), null));
});

describe('parseBearerChallenge', () => {
  test('parses realm/service/scope', () => {
    assert.deepEqual(
      parseBearerChallenge('Bearer realm="https://ghcr.io/token",service="ghcr.io",scope="repository:linuxserver/swag:pull"'),
      { realm: 'https://ghcr.io/token', service: 'ghcr.io', scope: 'repository:linuxserver/swag:pull' }
    );
  });
  test('non-bearer or missing → null', () => {
    assert.equal(parseBearerChallenge('Basic realm="x"'), null);
    assert.equal(parseBearerChallenge(null), null);
  });
});

describe('listOciTags', () => {
  test('follows every page and finds tags on the last one (Immich case)', async () => {
    const tags = synthetic(4500, ['v3.4.0-rc.1', 'v3.3.6', 'v3.4.0', 'v3.4.1', 'commit-ffff']);
    const reg = fakeRegistry(tags, { echoN: false }); // worst case: link always says n=0
    globalThis.fetch = reg.fetch;
    const list = await listOciTags({ host: 'ghcr.io', path: 'immich-app/immich-server', tokenFirst: true });
    assert.equal(list.truncated, false);
    assert.equal(list.pages, 5);
    assert.equal(list.seen, tags.length);
    assert.ok(list.tags.includes('v3.4.1'));
    assert.ok(!list.tags.some((t) => t.startsWith('commit-')), 'non-version tags filtered out');
    assert.ok(reg.calls.filter((c) => c.includes('tags/list')).every((c) => c.includes(`n=${PAGE_SIZE}`)));
    assert.equal(analyzeVersions('v3.3.6', list.tags).newerSameMajor, 'v3.4.1');
    assert.equal(warnings.length, 0);
  });

  test('page cap reached → partial list, truncated, warning', async () => {
    globalThis.fetch = fakeRegistry(synthetic(5000)).fetch;
    const list = await listOciTags({ host: 'ghcr.io', path: 'a/b', tokenFirst: true, maxPages: 2 });
    assert.equal(list.truncated, true);
    assert.equal(list.pages, 2);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0].msg, /page cap/);
  });

  test('later page failure → partial list, truncated, warning', async () => {
    globalThis.fetch = fakeRegistry(synthetic(3500), { failPage: 3 }).fetch;
    const list = await listOciTags({ host: 'ghcr.io', path: 'a/b', tokenFirst: true, retryBaseMs: 1 });
    assert.equal(list.truncated, true);
    assert.equal(list.pages, 2);
    assert.equal(list.retries, 5, 'retried before giving up');
    assert.equal(warnings[0].obj.status, 503);
  });

  test('first page failure → null', async () => {
    globalThis.fetch = fakeRegistry(synthetic(10), { failPage: 1 }).fetch;
    assert.equal(await listOciTags({ host: 'ghcr.io', path: 'a/b', tokenFirst: true, retryBaseMs: 1 }), null);
  });

  test('429 rate limiting is retried with back-off, no truncation', async () => {
    const reg = fakeRegistry(synthetic(2500));
    let throttled = 0;
    globalThis.fetch = async (input, init) => {
      if (String(input).includes('last=') && throttled < 2) {
        throttled++;
        return new Response('slow down', { status: 429 });
      }
      return reg.fetch(input, init);
    };
    const list = await listOciTags({ host: 'ghcr.io', path: 'a/b', tokenFirst: true, retryBaseMs: 1 });
    assert.equal(list.truncated, false);
    assert.equal(list.pages, 3);
    assert.equal(list.retries, 2);
    assert.equal(warnings.length, 0);
  });

  test('generic OCI: anonymous, then token on 401', async () => {
    const reg = fakeRegistry(synthetic(1200));
    globalThis.fetch = reg.fetch;
    const list = await listOciTags({ host: 'lscr.io', path: 'linuxserver/swag' });
    assert.equal(list.token, 'tkn');
    assert.equal(list.pages, 2);
    assert.deepEqual(reg.calls.slice(0, 3), [
      `/v2/linuxserver/swag/tags/list?n=${PAGE_SIZE}`,
      '/token?service=lscr.io&scope=repository%3Alinuxserver%2Fswag%3Apull',
      `/v2/linuxserver/swag/tags/list?n=${PAGE_SIZE}`,
    ]);
  });

  test('generic OCI: token from the realm the 401 challenge names (lscr.io → ghcr.io)', async () => {
    const reg = fakeRegistry(['5.9.0', 'version-5.10.0']);
    const seen = [];
    globalThis.fetch = async (input, init = {}) => {
      seen.push(String(input));
      const res = await reg.fetch(input, init);
      if (res.status !== 401) return res;
      return new Response('unauthorized', {
        status: 401,
        headers: { 'WWW-Authenticate': 'Bearer realm="https://ghcr.io/token",service="ghcr.io",scope="repository:linuxserver/swag:pull"' },
      });
    };
    const list = await listOciTags({ host: 'lscr.io', path: 'linuxserver/swag' });
    assert.deepEqual(list.tags, ['5.9.0', 'version-5.10.0']);
    assert.equal(seen[1], 'https://ghcr.io/token?service=ghcr.io&scope=repository%3Alinuxserver%2Fswag%3Apull');
  });

  test('registry without auth works anonymously', async () => {
    const reg = fakeRegistry(['1.0.0', '1.1.0'], { requireToken: false });
    globalThis.fetch = reg.fetch;
    const list = await listOciTags({ host: 'r.example', path: 'a/b' });
    assert.deepEqual(list.tags, ['1.0.0', '1.1.0']);
    assert.equal(list.token, null);
  });

  test('pagination that makes no progress stops with a warning', async () => {
    globalThis.fetch = async () => Response.json({ tags: ['1.0.0'] }, {
      headers: { Link: `</v2/a/b/tags/list?last=1.0.0&n=${PAGE_SIZE}>; rel="next"` },
    });
    // first URL has no `last`, so the 2nd page is fetched; it returns the same link → loop guard
    const list = await listOciTags({ host: 'r.example', path: 'a/b' });
    assert.equal(list.truncated, true);
    assert.match(warnings[0].msg, /no progress/);
  });
});

describe('rankDigestCandidates', () => {
  test('newest first, releases above their rcs, plain before variants', () => {
    const ml = JSON.parse(readFileSync(new URL('./fixtures/immich-machine-learning-tags.json', import.meta.url), 'utf8'));
    const top = rankDigestCandidates(ml.tags, 8);
    assert.equal(top[0], 'v3.4.1');
    assert.ok(top.slice(1, 6).every((t) => t.startsWith('v3.4.1-')));
    assert.equal(top[6], 'v3.4.0');
  });
  test('numeric ordering (v1.100 above v1.99)', () => {
    assert.deepEqual(rankDigestCandidates(['v1.99.0', 'v1.100.0', 'v1.100.0-rc.1']), ['v1.100.0', 'v1.100.0-rc.1', 'v1.99.0']);
  });
});

// Opt-in: hits the real ghcr.io. `LIVE_REGISTRY_TESTS=1 npm test`
describe('live ghcr.io (LIVE_REGISTRY_TESTS=1)', { skip: !process.env.LIVE_REGISTRY_TESTS }, () => {
  for (const name of ['immich-server', 'immich-machine-learning']) {
    test(`${name}: pin v3.3.6 sees a newer plain v3.x release`, { timeout: 120000 }, async () => {
      globalThis.fetch = realFetch;
      const list = await listOciTags({ host: 'ghcr.io', path: `immich-app/${name}`, tokenFirst: true });
      assert.ok(list, 'tag list fetched');
      assert.equal(list.truncated, false, `not truncated: ${JSON.stringify(warnings)}`);
      const { newerSameMajor } = analyzeVersions('v3.3.6', list.tags);
      assert.match(newerSameMajor ?? '', /^v3\.\d+\.\d+$/);
      assert.ok(newerSameMajor !== 'v3.3.6');
      console.log(`  ${name}: ${list.seen} tags over ${list.pages} pages → v3.3.6 → ${newerSameMajor}`);
    });
  }
  test('lscr.io/linuxserver/swag: delegated ghcr auth, version- pin', { timeout: 60000 }, async () => {
    globalThis.fetch = realFetch;
    const list = await listOciTags({ host: 'lscr.io', path: 'linuxserver/swag' });
    assert.ok(list, 'tag list fetched');
    assert.equal(list.truncated, false);
    const { newerSameMajor } = analyzeVersions('version-5.0.0', list.tags);
    assert.match(newerSameMajor ?? '', /^version-5\.\d+\.\d+$/);
    console.log(`  lscr.io swag: ${list.seen} tags over ${list.pages} pages → version-5.0.0 → ${newerSameMajor}`);
  });
});
