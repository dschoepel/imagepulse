import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  parseTag, normalizeTag, isPrerelease, compareVersions, analyzeVersions,
} from '../src/services/tagVersions.js';

// Real tag lists captured from the registries (see each file's _source/_note).
const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));
const immichServer = fixture('immich-server-tags');
const immichMl = fixture('immich-machine-learning-tags');
const swag = fixture('linuxserver-swag-tags');
const nginx = fixture('nginx-tags');

describe('normalizeTag', () => {
  for (const [tag, expected] of [
    ['v1.2.3', '1.2.3'],
    ['1.2.3', '1.2.3'],
    ['version-29.0.1', '29.0.1'],
    ['1.31.1-alpine3.23', '1.31.1'],
    ['v3.4.0-rc.1', '3.4.0'],
    ['v1.36.0_55-dev', '1.36.0'],
    ['5.10.0-ls499', '5.10.0'],
    ['2.9', '2.9'],
    ['stable-alpine3.23', null],
    ['trixie-slim', null],
    ['48', null],
    ['2', null],
    ['alpine', null],
    ['latest', null],
    ['commit-283067e38df0f05c21317117ba2923d8fe301858', null],
    ['pr-12990', null],
    ['arm64v8-5.10.0', null],
  ]) {
    test(`${tag} → ${expected}`, () => assert.equal(normalizeTag(tag), expected));
  }
});

describe('parseTag', () => {
  test('pre-release markers', () => {
    assert.deepEqual(parseTag('v3.4.0-rc.1').prerelease, ['rc', 1]);
    assert.deepEqual(parseTag('v3.4.0-rc.1-cuda').prerelease, ['rc', 1]);
    assert.deepEqual(parseTag('1.0.0-beta2').prerelease, ['beta', 2]);
    assert.deepEqual(parseTag('3.12.0b1').prerelease, ['beta', 1]);
    assert.deepEqual(parseTag('2.0.0-alpha').prerelease, ['alpha']);
    assert.deepEqual(parseTag('v1.36.0_55-dev').prerelease, ['dev']);
    for (const t of ['1.0.0-pre', '1.0.0-preview.3', '1.0.0-nightly', '1.0.0-snapshot', '1.0.0-canary.4']) {
      assert.ok(isPrerelease(t), t);
    }
  });

  test('releases and variants are not pre-releases', () => {
    for (const t of ['v3.4.1', 'v3.4.1-cuda', '1.31.1-alpine3.23', '5.10.0-ls499', 'version-5.10.0', '1.31.8-alpine-slim']) {
      assert.equal(isPrerelease(t), false, t);
    }
  });

  test('flavor ignores digits and pre-release parts', () => {
    assert.equal(parseTag('v3.4.1').flavor, '');
    assert.equal(parseTag('version-5.9.0').flavor, '');
    assert.equal(parseTag('v3.4.1-cuda').flavor, 'cuda');
    assert.equal(parseTag('v3.4.0-rc.1-cuda').flavor, 'cuda');
    assert.equal(parseTag('1.31.1-alpine3.23').flavor, 'alpine');
    assert.equal(parseTag('1.31.8-alpine3.24').flavor, 'alpine');
    assert.equal(parseTag('1.31.8-alpine3.24-slim').flavor, 'alpine-slim');
    assert.equal(parseTag('5.10.0-ls499').flavor, 'ls');
    assert.equal(parseTag('v1.36.0_55-dev').flavor, '');
  });
});

describe('compareVersions', () => {
  test('final release outranks its release candidates', () => {
    assert.ok(compareVersions('v3.4.0', 'v3.4.0-rc.3') > 0);
    assert.ok(compareVersions('v3.4.0-rc.3', 'v3.4.0-rc.1') > 0);
    assert.ok(compareVersions('v3.4.0-rc.1', 'v3.3.6') > 0);
    assert.ok(compareVersions('v3.4.0-rc.1', 'v3.4.0-beta.9') > 0);
    assert.ok(compareVersions('v3.4.0-beta.1', 'v3.4.0-alpha.9') > 0);
    assert.ok(compareVersions('v3.4.0-rc.1', 'v3.4.0-rc') > 0);
  });
  test('numeric, not lexical', () => {
    assert.ok(compareVersions('v1.100.0', 'v1.99.9') > 0);
    assert.ok(compareVersions('5.10.0', '5.9.0') > 0);
    assert.equal(compareVersions('1.2', '1.2.0'), 0);
  });
});

describe('analyzeVersions — Immich (ghcr, push-ordered, 33k tags)', () => {
  test('v3.3.6 pin sees v3.4.1, not an rc', () => {
    assert.deepEqual(analyzeVersions('v3.3.6', immichServer.tags), {
      newerSameMajor: 'v3.4.1', newestOverall: null,
    });
  });

  test('page 1 only (the pre-1.7.3 behaviour) contains no v3 tags at all', () => {
    const page1 = immichServer.tags.slice(0, immichServer.firstPageSize);
    assert.equal(page1.at(-1), 'v1.91.1');
    assert.deepEqual(analyzeVersions('v3.3.6', page1), { newerSameMajor: null, newestOverall: null });
  });

  test('rc tags are ignored for a release pin even when they are the only newer tags', () => {
    const upToRc3 = immichServer.tags.slice(0, immichServer.tags.indexOf('v3.4.0-rc.3') + 1);
    assert.deepEqual(analyzeVersions('v3.3.6', upToRc3), { newerSameMajor: null, newestOverall: null });
  });

  test('final release is picked once it appears after its rcs (never suppressed)', () => {
    const upTo340 = immichServer.tags.slice(0, immichServer.tags.indexOf('v3.4.0') + 1);
    assert.equal(analyzeVersions('v3.3.6', upTo340).newerSameMajor, 'v3.4.0');
  });

  test('pre-release pin follows pre-releases and then the final release', () => {
    const upToRc3 = immichServer.tags.slice(0, immichServer.tags.indexOf('v3.4.0-rc.3') + 1);
    assert.equal(analyzeVersions('v3.4.0-rc.1', upToRc3).newerSameMajor, 'v3.4.0-rc.3');
    assert.equal(analyzeVersions('v3.4.0-rc.1', immichServer.tags).newerSameMajor, 'v3.4.1');
  });

  test('dedup key moves from rc to final (rc and final are distinct keys)', () => {
    const upToRc3 = immichServer.tags.slice(0, immichServer.tags.indexOf('v3.4.0-rc.3') + 1);
    const upTo340 = immichServer.tags.slice(0, immichServer.tags.indexOf('v3.4.0') + 1);
    const key = (r) => r.newestOverall || r.newerSameMajor;
    const before = key(analyzeVersions('v3.4.0-rc.1', upToRc3));
    const after = key(analyzeVersions('v3.4.0-rc.1', upTo340));
    assert.equal(before, 'v3.4.0-rc.3');
    assert.equal(after, 'v3.4.0');
    assert.notEqual(before, after);
  });

  test('up-to-date pin reports nothing', () => {
    assert.deepEqual(analyzeVersions('v3.4.1', immichServer.tags), { newerSameMajor: null, newestOverall: null });
  });

  test('major bump reported as newestOverall', () => {
    assert.deepEqual(analyzeVersions('v1.91.0', immichServer.tags), {
      newerSameMajor: 'v1.144.1', newestOverall: 'v3.4.1',
    });
  });

  test('_N-dev tags are pre-releases', () => {
    const r = analyzeVersions('v1.35.0', ['v1.36.0_55-dev', 'v1.35.1']);
    assert.equal(r.newerSameMajor, 'v1.35.1');
  });
});

describe('analyzeVersions — Immich ML variants', () => {
  test('plain pin is not reported a -rknn/-cuda variant listed first', () => {
    const i = immichMl.tags.indexOf('v3.4.1-rknn');
    assert.ok(i >= 0 && i < immichMl.tags.indexOf('v3.4.1'), 'fixture lists the variant first');
    assert.equal(analyzeVersions('v3.3.6', immichMl.tags).newerSameMajor, 'v3.4.1');
  });
  test('variant pin stays on its variant', () => {
    assert.equal(analyzeVersions('v3.3.6-cuda', immichMl.tags).newerSameMajor, 'v3.4.1-cuda');
    assert.equal(analyzeVersions('v3.3.6-openvino', immichMl.tags).newerSameMajor, 'v3.4.1-openvino');
  });
});

describe('analyzeVersions — linuxserver (Docker Hub)', () => {
  test('version- pin reports the version- tag', () => {
    assert.equal(analyzeVersions('version-5.9.0', swag.tags).newerSameMajor, 'version-5.10.0');
  });
  test('-lsNNN pin reports the newest -ls build', () => {
    assert.equal(analyzeVersions('5.9.0-ls497', swag.tags).newerSameMajor, '5.10.0-ls499');
  });
  test('pin at the latest version-x.y.z is up to date', () => {
    assert.deepEqual(analyzeVersions('version-5.10.0', swag.tags), { newerSameMajor: null, newestOverall: null });
  });
  test('major bump for an older pin', () => {
    const r = analyzeVersions('version-4.0.0', ['version-4.1.0', '4.1.0-ls10', 'version-5.10.0', 'arm64v8-version-5.10.0']);
    assert.deepEqual(r, { newerSameMajor: 'version-4.1.0', newestOverall: 'version-5.10.0' });
  });
});

describe('analyzeVersions — alpine-suffixed tags (nginx)', () => {
  test('1.31.1-alpine3.23 pin stays on -alpineX.Y tags', () => {
    assert.equal(analyzeVersions('1.31.1-alpine3.23', nginx.tags).newerSameMajor, '1.31.8-alpine3.24');
  });
  test('-alpine-slim pin stays on -alpine-slim', () => {
    const r = analyzeVersions('1.31.1-alpine-slim', nginx.tags).newerSameMajor;
    assert.equal(parseTag(r).flavor, 'alpine-slim');
    assert.equal(normalizeTag(r), '1.31.8');
  });
});

describe('analyzeVersions — unparseable pins', () => {
  for (const pin of ['alpine', '2', 'latest', 'stable-alpine3.23', '']) {
    test(JSON.stringify(pin), () => {
      assert.deepEqual(analyzeVersions(pin, immichServer.tags), { newerSameMajor: null, newestOverall: null });
    });
  }
});
