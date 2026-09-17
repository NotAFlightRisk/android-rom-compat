import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { latestBuild, parseDevice, patchLevels } from '../../scripts/import/sources/eos.js';

const feeds = 'tests/fixtures/feeds';
const text = (codename) => readFileSync(`${feeds}/eos-devices/${codename}.yaml`, 'utf8');
const patches = patchLevels(readFileSync(`${feeds}/eos-releases.yaml`, 'utf8'));
const ota = JSON.parse(readFileSync(`${feeds}/eos-ota.json`, 'utf8'));

test('an official device is stable, relockable and passes basic integrity outright', () => {
  const { vendor, codename, device, row } = parseDevice(text('FP4'));
  assert.equal(vendor, 'Fairphone');
  assert.equal(codename, 'FP4');
  assert.deepEqual(device.hardware, ['5g', 'cellular', 'esim', 'fingerprint']);
  assert.deepEqual(row, {
    status: 'active',
    channel: 'stable',
    android: 14,
    relock: 'yes',
    source: 'https://doc.e.foundation/devices/FP4/',
    install: 'https://doc.e.foundation/devices/FP4/install/',
    features: { integrity: 'basic' },
  });
});

test('a community build is community, not relockable, and its integrity is unconfirmed', () => {
  const { row } = parseDevice(text('tegu'));
  assert.equal(row.channel, 'community');
  assert.equal(row.relock, 'no');
  assert.equal(row.firmware, '16');
  assert.deepEqual(row.features.integrity, { status: 'basic', note: 'To be confirmed' });
});

test('a lockable bootloader on a userdebug build still counts as no relock', () => {
  const debuggable = text('FP4').replace('build_variant: user', 'build_variant: userdebug');
  assert.equal(parseDevice(debuggable).row.relock, 'no');
});

test('test builds are skipped', () => {
  assert.equal(parseDevice(text('sdk_phone_x86_64')), null);
});

test('slashed and bracketed names split into aliases', () => {
  const { device } = parseDevice(text('Mi8917'));
  assert.equal(device.name, 'Redmi 4A');
  assert.deepEqual(device.aliases.slice(0, 4), ['5A', 'Note 5A', 'Y1 - Lite', '2016111']);
  assert.equal(device.released, 2016);
});

test('a wifi tablet is a tablet with no cellular', () => {
  const { device } = parseDevice(text('gts4lvwifi'));
  assert.equal(device.type, 'tablet');
  assert.deepEqual(device.hardware, ['fingerprint']);
});

test('latest build is the newest on the newest Android branch, with its patch level', () => {
  const expected = {
    android: 16,
    latest: { version: '4.2', date: '2026-08-15', patch: '2026-08-01' },
  };
  assert.deepEqual(latestBuild(ota, patches), expected);
  assert.deepEqual(latestBuild({ response: ota.response.toReversed() }, patches), expected);
  assert.equal(latestBuild({ response: [] }, patches), undefined);
});

test('a branch with a security note instead of a bulletin gets no patch', () => {
  const t = ota.response.find((build) => build.android_version === '13');
  assert.deepEqual(latestBuild({ response: [{ ...t, version: '4.2' }] }, patches).latest, {
    version: '4.2',
    date: '2025-07-10',
  });
  assert.equal(patches.get('v3.7.3/A15'), '2026-05-01');
});
