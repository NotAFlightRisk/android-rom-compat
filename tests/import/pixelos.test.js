import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { detailOf, parse, withDetail } from '../../scripts/import/sources/pixelos.js';

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/feeds/${name}`, import.meta.url), 'utf8'));
const entries = parse(fixture('pixelos-devices.json'));
const byCodename = Object.fromEntries(entries.map((entry) => [entry.codename, entry]));

test('an active device keeps its brand-less name, codenames and a tidy maintainer', () => {
  const { brand, device, row } = byCodename.RMX2020;
  assert.equal(brand, 'Realme');
  assert.deepEqual(device, { name: 'C3', codenames: ['rmx2020'], aliases: ['Narzo 10A'] });
  assert.deepEqual(row, {
    status: 'active',
    android: 16,
    maintainer: 'Sarthak Roy & Koushik Dey',
    latest: { date: '2026-06-18' },
    source: 'https://pixelos.net/download/RMX2020',
  });
});

test('an inactive duplicate loses to the active device sharing its codename', () => {
  assert.equal(byCodename.RMX2001L1, undefined);
  assert.deepEqual(byCodename.nemo.device.codenames, ['nemo', 'rmx2001', 'rmx2002', 'rmx2003']);
  assert.equal(byCodename.cheetah.row.status, 'discontinued');
  assert.equal(byCodename.cheetah.device.name, 'Pixel 7 Pro');
});

test('a null version or date leaves android and latest out', () => {
  const { row } = byCodename.Spacewar;
  assert.equal(row.android, undefined);
  assert.equal(row.latest, undefined);
});

test('tablets are spotted from the name', () => {
  assert.equal(byCodename.pipa.device.type, 'tablet');
  assert.equal(byCodename.garnet.device.type, undefined);
});

test('the device file adds a version from the download link, and a null xda adds nothing', () => {
  const { row } = byCodename.garnet;
  assert.deepEqual(withDetail(row, detailOf(fixture('pixelos-garnet.json'))), {
    ...row,
    latest: { version: '17.0', date: '2026-08-21' },
  });
  const xda = 'https://xdaforums.com/t/pixelos-garnet';
  assert.equal(withDetail(row, { install: xda }).install, xda);
});
