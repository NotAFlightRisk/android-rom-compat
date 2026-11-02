import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  androidOf,
  fingerprintBrand,
  nameOf,
  parse,
} from '../../scripts/import/sources/alphadroid.js';

const build = {
  maintainer: 'elpaablo',
  oem: 'OnePlus',
  device: 'aston',
  filename: 'AlphaDroid-16-20260901-gapps-aston-v4.7.zip',
  timestamp: 1788285284,
  version: '4.7',
  forum: 'https://t.me/alphadroid_chat',
};
const json = { response: [build] };
const site = { codename: 'aston', oem: 'OnePlus', model: 'OnePlus 12R' };
const now = Date.parse('2026-11-02');

test("Android comes off the zip's name, with or without a time after the date", () => {
  assert.equal(androidOf(build.filename), 16);
  assert.equal(androidOf('AlphaDroid-15.1-20250223-gapps-akita-v3.1.zip'), 15);
  assert.equal(androidOf('AlphaDroid-16-20260916_052649-gapps-salami-v4.7.zip'), 16);
  assert.equal(androidOf('AlphaDroid-20230316-RMX3461-vanilla-v1.2.1.zip'), undefined);
});

test("a build's fingerprint names its maker", () => {
  assert.equal(fingerprintBrand({ 'post-build': 'POCO/onyx_global/onyx:16/16OS3.1:user' }), 'POCO');
  assert.equal(fingerprintBrand({}), undefined);
  assert.equal(fingerprintBrand(undefined), undefined);
});

test("the site's name wins, and a feed name that's just the codename doesn't count", () => {
  assert.equal(nameOf(build, site, 'aston'), 'OnePlus 12R');
  assert.equal(nameOf({ device: 'Pixel 8a (akita)' }, undefined, 'akita'), 'Pixel 8a');
  assert.equal(
    nameOf({ device: 'Redmi K20 Pro / Mi 9T Pro' }, undefined, 'raphael'),
    'Redmi K20 Pro',
  );
  assert.equal(nameOf({ device: 'onyx' }, undefined, 'onyx'), undefined);
});

test('a fresh build makes an active row that links to its page on the site', () => {
  const { brand, name, row } = parse(json, site, 'aston', now);
  assert.equal(brand, 'OnePlus');
  assert.equal(name, 'OnePlus 12R');
  assert.deepEqual(row, {
    status: 'active',
    android: 16,
    maintainer: 'elpaablo',
    latest: { version: '4.7', date: '2026-09-01' },
    source: 'https://alphadroid.org/#devices?codename=aston',
  });
});

test("the maker falls back to the site's, and is left out when neither has one", () => {
  const bare = { response: [{ ...build, oem: '' }] };
  assert.equal(parse(bare, site, 'aston', now).brand, 'OnePlus');
  assert.equal(parse(bare, undefined, 'aston', now).brand, undefined);
});

test('a phone not built for half a year, or with no maintainer, is discontinued', () => {
  assert.equal(parse(json, site, 'aston', now + 200 * 864e5).row.status, 'discontinued');
  const orphan = { response: [{ ...build, maintainer: '' }] };
  assert.equal(parse(orphan, site, 'aston', now).row.status, 'discontinued');
  assert.equal(parse({ response: [] }, site, 'aston', now), undefined);
});
