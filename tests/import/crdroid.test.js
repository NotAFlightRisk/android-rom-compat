import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { newestBranches, parse } from '../../scripts/import/sources/crdroid.js';

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/feeds/${name}`, import.meta.url), 'utf8'));
const trees = fixture('crdroid-trees.json');
const builds = fixture('crdroid-builds.json');
const now = Date.parse('2026-09-17');
const parsed = (key) => {
  const [branch, codename] = key.split('/');
  return parse(builds[key], { branch, codename }, now);
};

test('each codename comes from the newest branch that has it', () => {
  const newest = newestBranches(trees);
  assert.deepEqual(newest.get('walleye'), { codename: 'walleye', branch: '15.0' });
  assert.deepEqual(newest.get('pong'), { codename: 'Pong', branch: '16.0' });
  assert.deepEqual(newest.get('jasmine_sprout'), { codename: 'jasmine_sprout', branch: '12.1' });
  assert.equal(newest.has('readme.md'), false);
  assert.equal(newest.has('tegu_changelog'), false);
});

test('a fresh monthly build is an active stable row with a patch level', () => {
  const { brand, device, row } = parsed('16.0/tegu');
  assert.equal(brand, 'Google');
  assert.deepEqual(device, { name: 'Pixel 9a', codenames: ['tegu'], aliases: [] });
  assert.deepEqual(row, {
    status: 'active',
    channel: 'stable',
    android: 16,
    maintainer: 'Pranav Vashi (neobuddy89)',
    latest: { version: '12.12', date: '2026-09-16', patch: '2026-09-01' },
    source: 'https://github.com/crdroidandroid/android_vendor_crDroidOTA/blob/16.0/tegu.json',
    install: 'https://xdaforums.com/t/rom-16-pixel-9a-crdroid-v12-official.4755913/',
  });
});

test('upstream case stays in the source link but not the codename', () => {
  const { device, row } = parsed('16.0/Pong');
  assert.deepEqual(device.codenames, ['pong']);
  assert.match(row.source, /\/blob\/16\.0\/Pong\.json$/);
});

test('empty maintainer and missing patch level are left out', () => {
  const { row } = parsed('16.0/a21s');
  assert.equal(row.maintainer, undefined);
  assert.deepEqual(row.latest, { version: '12.9', date: '2026-04-19' });
});

test('builds over 180 days old are discontinued', () => {
  assert.equal(parsed('16.0/a21s').row.status, 'active');
  assert.equal(parsed('15.0/PL2').row.status, 'discontinued');
});

test('only alpha, beta and nightly builds count as beta', () => {
  const channel = (key) => parsed(key).row.channel;
  assert.equal(channel('15.0/devon'), 'beta');
  assert.equal(channel('16.0/onyx'), 'stable');
  assert.equal(channel('16.0/vayu'), 'stable');
  assert.equal(channel('13.0/RM6785'), 'stable');
});

test('a file with no builds gives nothing', () => {
  assert.equal(parse({ response: [] }, { branch: '16.0', codename: 'tegu' }, now), undefined);
});
