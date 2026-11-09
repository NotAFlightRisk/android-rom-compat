import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parse, withPatch } from '../../scripts/import/sources/pixelos.js';

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/feeds/${name}`, import.meta.url), 'utf8'));
const entries = parse(fixture('pixelos-devices.json'), fixture('pixelos-team.json'));
const byCodename = Object.fromEntries(entries.map((entry) => [entry.codename, entry]));

test('an active device keeps its brand-less name, codenames and team names', () => {
  const { brand, device, row } = byCodename.RMX2020;
  assert.equal(brand, 'Realme');
  assert.deepEqual(device, { name: 'C3', codenames: ['rmx2020'], aliases: ['Narzo 10A'] });
  assert.deepEqual(row, {
    status: 'active',
    android: 16,
    maintainer: 'Sarthak Roy & Koushik Dey',
    latest: { version: '16.2', date: '2026-06-18' },
    source: 'https://pixelos.net/download/RMX2020',
    install: 'https://xdaforums.com/t/rom-14-official-pixelos-aosp-stable.4642903/',
  });
});

test('a maintainer missing from the team keeps their login', () => {
  assert.equal(byCodename.garnet.row.maintainer, 'AdarshGrewal');
});

test('an inactive duplicate loses to the active device sharing its codename', () => {
  assert.equal(byCodename.RMX2001L1, undefined);
  assert.deepEqual(byCodename.nemo.device.codenames, ['nemo', 'rmx2001', 'rmx2002', 'rmx2003']);
  assert.equal(byCodename.cheetah.row.status, 'discontinued');
  assert.equal(byCodename.cheetah.device.name, 'Pixel 7 Pro');
  assert.equal(byCodename.cheetah.row.install, undefined);
});

test('android comes from the zip, not the version word', () => {
  assert.equal(byCodename.r5x.row.android, 13);
});

test('no build yet leaves android, latest and the zip out', () => {
  const { row, zip } = byCodename.infiniti;
  assert.equal(row.android, undefined);
  assert.equal(row.latest, undefined);
  assert.equal(zip, undefined);
});

test('tablets are spotted from the name', () => {
  assert.equal(byCodename.pipa.device.type, 'tablet');
  assert.equal(byCodename.garnet.device.type, undefined);
});

test('the patch level read off the build zip goes in with the version', () => {
  const { row } = byCodename.RMX2020;
  assert.deepEqual(withPatch(row, '2026-06-01').latest, {
    version: '16.2',
    date: '2026-06-18',
    patch: '2026-06-01',
  });
  assert.equal(withPatch(row, undefined), row);
});
