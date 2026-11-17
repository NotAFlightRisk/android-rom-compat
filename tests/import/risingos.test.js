import assert from 'node:assert/strict';
import { test } from 'node:test';
import { androidOf, byCodename, parse } from '../../scripts/import/sources/risingos.js';

const build = {
  status: 'active',
  oem: 'Xiaomi',
  device: 'Redmi Note 13 Pro 5G/Poco X6 5G',
  codename: 'garnet',
  maintainer: 'KernelPanix',
  variant: 'GAPPS',
  download: 'https://sourceforge.net/projects/risingos-revived/files/9.x/GAPPS/garnet/build.zip/download',
  version: '9-elefthería',
  timestamp: 1794757625,
};
const now = Date.parse('2026-11-17');

test('Android comes from the SDK level the zip was built for', () => {
  assert.equal(androidOf({ 'post-sdk-level': '37' }), 17);
  assert.equal(androidOf({ 'post-sdk-level': '35' }), 15);
  assert.equal(androidOf({}), undefined);
  assert.equal(androidOf(undefined), undefined);
});

test("variants group by codename, newest first, skipping ones that can't be downloaded", () => {
  const older = { ...build, variant: 'VANILLA', timestamp: 1749000000 };
  const blank = { ...build, variant: 'CORE', download: '' };
  const pixel = { ...build, codename: 'Spacewar', oem: 'Nothing' };
  const groups = byCodename([older, blank, build, pixel]);
  assert.deepEqual(groups, [[build, older], [pixel]]);
});

test('a fresh build makes an active row, with the other names as aliases', () => {
  const { brand, device, row } = parse([build], now);
  assert.equal(brand, 'Xiaomi');
  assert.deepEqual(device, {
    name: 'Redmi Note 13 Pro 5G',
    codenames: ['garnet'],
    aliases: ['Poco X6 5G'],
  });
  assert.deepEqual(row, {
    status: 'active',
    maintainer: 'KernelPanix',
    latest: { version: '9', date: '2026-11-15' },
    source: 'https://risingos-revived-devices.github.io/downloads/?codename=garnet',
  });
});

test('dropped phones and old builds read as discontinued', () => {
  assert.equal(parse([{ ...build, status: 'dropped' }], now).row.status, 'discontinued');
  assert.equal(parse([build], now + 200 * 864e5).row.status, 'discontinued');
});

test('entries with no maker or build date are skipped', () => {
  assert.equal(parse([{ ...build, oem: '' }], now), undefined);
  assert.equal(parse([{ ...build, timestamp: 0 }], now), undefined);
});
