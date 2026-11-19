import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  androidOf,
  brandOf,
  feedsOf,
  releaseBranches,
  parse,
} from '../../scripts/import/sources/lunaris.js';

const build = {
  maintainer: 'Chethan',
  oem: 'OnePlus',
  device: 'oscaro',
  filename: 'Lunaris-AOSP-oscaro-OFFICIAL-3.13-GMS-2026111906.zip',
  download: 'https://example.com/Lunaris-AOSP-oscaro-OFFICIAL-3.13-GMS-2026111906.zip',
  timestamp: 1795064868,
  version: '3.13',
  os_patch_level: '2026-11-01',
  os_sdk_level: 36,
};
const json = { response: [build] };
const feed = { branch: '16.2', path: 'builds/oscaro.json' };
const now = Date.parse('2026-11-19');

test('release branches sort newest first, by number', () => {
  const names = ['16', '16.2', 'main', '16.10'].map((name) => ({ name }));
  assert.deepEqual(releaseBranches(names), ['16.10', '16.2', '16']);
});

test('feeds come from builds/ and builds/vanilla/, nothing else', () => {
  const tree = [
    { path: 'builds/oscaro.json' },
    { path: 'builds/vanilla/oscaro.json' },
    { path: 'builds/vanilla' },
    { path: 'changelogs/oscaro.txt' },
  ];
  assert.deepEqual(feedsOf(tree), [
    { codename: 'oscaro', path: 'builds/oscaro.json' },
    { codename: 'oscaro', path: 'builds/vanilla/oscaro.json' },
  ]);
});

test("Android comes from the SDK level, else the branch's number", () => {
  assert.equal(androidOf(build, '16.2'), 16);
  assert.equal(androidOf({ os_sdk_level: 37 }, '16.2'), 17);
  assert.equal(androidOf({}, '16.2'), 16);
});

test('a two-maker feed picks the one that already has the phone', () => {
  assert.equal(brandOf('OnePlus', 'oscaro'), 'OnePlus');
  assert.equal(brandOf('Realme/OnePlus', 'op6893'), 'OnePlus');
  assert.equal(brandOf('Realme/OPPO', 'nosuchphone'), undefined);
  assert.equal(brandOf('Realme/OPPO', 'op6893'), undefined);
  assert.equal(brandOf('', 'op6893'), 'oneplus');
});

test('a fresh build makes an active row that links to its feed', () => {
  const { oem, name, row } = parse(json, feed, 'oscaro', now);
  assert.equal(oem, 'OnePlus');
  assert.equal(name, undefined);
  assert.deepEqual(row, {
    status: 'active',
    android: 16,
    maintainer: 'Chethan',
    latest: { version: '3.13', date: '2026-11-19', patch: '2026-11-01' },
    source: 'https://github.com/Lunaris-AOSP/OTA/blob/16.2/builds/oscaro.json',
  });
});

test('a feed that names the phone keeps the name', () => {
  const named = { response: [{ ...build, device: 'OnePlus Nord 5G' }] };
  assert.equal(parse(named, feed, 'avicii', now).name, 'OnePlus Nord 5G');
});

test('a phone not built for half a year, or with no maintainer, is discontinued', () => {
  assert.equal(parse(json, feed, 'oscaro', now + 200 * 864e5).row.status, 'discontinued');
  const orphan = { response: [{ ...build, maintainer: ' ' }] };
  assert.equal(parse(orphan, feed, 'oscaro', now).row.status, 'discontinued');
  assert.equal(parse({ response: [] }, feed, 'oscaro', now), undefined);
});
