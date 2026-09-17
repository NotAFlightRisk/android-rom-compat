import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseBuilds } from '../../scripts/import/sources/lineageos-microg.js';

const fixture = 'tests/fixtures/feeds/lineageos-microg-builds.json';
const builds = JSON.parse(readFileSync(fixture, 'utf8'));

test('the newest build wins even though the feed lists oldest first', () => {
  assert.deepEqual(parseBuilds(builds, 'FP4'), {
    status: 'active',
    latest: { version: '23.2', date: '2026-09-09', patch: '2026-08-01' },
    source: 'https://download.lineage.microg.org/FP4/',
  });
});

test('version falls back to the filename', () => {
  const [build] = builds;
  const { version, ...rest } = build;
  assert.equal(parseBuilds([rest], 'FP4').latest.version, '23.2');
});

test('no builds means no row', () => {
  assert.equal(parseBuilds([], 'FP4'), undefined);
});
