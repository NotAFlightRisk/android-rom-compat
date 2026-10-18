import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { latestBuild, parseWiki } from '../../scripts/import/sources/lineageos.js';

const dir = 'tests/fixtures/feeds/lineageos-wiki';
const entries = parseWiki(readdirSync(dir).map((file) => readFileSync(`${dir}/${file}`, 'utf8')));
const entry = (codename) => entries.find((item) => item.device.codenames[0] === codename);

test('migrated files are dropped and variants fold into one codename', () => {
  assert.equal(entry('flo'), undefined);
  const lmi = entry('lmi');
  assert.equal(lmi.device.name, 'POCO F2 Pro');
  assert.deepEqual(lmi.device.aliases, [
    'Redmi K30 Pro',
    'Redmi K30 Pro Zoom Edition',
    'M2004J11G',
    'M2001J11C',
    'M2001J11C',
    'M2001J11E',
  ]);
  assert.equal(lmi.row.install, 'https://wiki.lineageos.org/devices/lmi/install/variant1/');
});

test('hardware counts every variant, not just the first', () => {
  assert.deepEqual(entry('r8q').device.hardware, ['5g', 'cellular', 'fingerprint', 'nfc']);
});

test('variants with different chips list them all', () => {
  assert.equal(
    entry('fogos').device.soc,
    'Qualcomm SM6375 Snapdragon 695 / Qualcomm SM6375-AC Snapdragon 6s Gen 3',
  );
  assert.equal(entry('r8q').device.soc, 'Qualcomm SM8250 Snapdragon 865');
});

test('an active device gets android, firmware, relock and the upstream codename spelling', () => {
  const { vendor, device, row } = entry('fp4');
  assert.equal(vendor, 'Fairphone');
  assert.deepEqual(device.hardware, ['5g', 'cellular', 'esim', 'fingerprint', 'nfc']);
  assert.deepEqual(row, {
    status: 'active',
    android: 16,
    maintainer: 'mikeioannina',
    relock: 'no',
    firmware: '13/15',
    source: 'https://wiki.lineageos.org/devices/FP4/',
    install: 'https://wiki.lineageos.org/devices/FP4/install/',
  });
});

test('ims and esim quirks become features with a note', () => {
  const { device, row } = entry('dm1q');
  assert.equal(device.bootloader.unlock, 'no');
  assert.equal(device.bootloader.source, 'https://wiki.lineageos.org/devices/dm1q/');
  const statuses = Object.entries(row.features).map(([key, cell]) => [key, cell.status]);
  assert.deepEqual(statuses, [
    ['esim', 'partial'],
    ['volte', 'partial'],
    ['vowifi', 'broken'],
  ]);
  for (const cell of Object.values(row.features)) {
    assert.ok(cell.note);
    assert.equal(cell.source, 'https://wiki.lineageos.org/devices/dm1q/');
  }
});

test('camera quirks make the camera partial', () => {
  for (const codename of ['addison', 'beckham']) {
    const { camera } = entry(codename).row.features;
    assert.equal(camera.status, 'partial');
    assert.ok(camera.note);
    assert.equal(camera.source, `https://wiki.lineageos.org/devices/${codename}/`);
  }
});

test('no maintainers means discontinued, and no network means no cellular', () => {
  const { device, row } = entry('castor_windy');
  assert.equal(row.status, 'discontinued');
  assert.equal(row.maintainer, undefined);
  assert.equal(row.firmware, undefined);
  assert.equal(device.type, 'tablet');
  assert.deepEqual(device.hardware, ['nfc']);
});

test('set top boxes are marked to skip', () => {
  assert.equal(entry('beast').device.type, 'skip');
});

test('latest build comes from the newest build and its first file', () => {
  const builds = JSON.parse(readFileSync('tests/fixtures/feeds/lineageos-builds.json', 'utf8'));
  const expected = { version: '23.2', date: '2026-09-15', patch: '2026-09-01' };
  assert.deepEqual(latestBuild(builds), expected);
  assert.deepEqual(latestBuild(builds.toReversed()), expected);
  assert.equal(latestBuild([]), undefined);
});
