import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parse, supportEnds } from '../../scripts/import/sources/calyxos.js';

const fixture = (name) =>
  readFileSync(new URL(`../fixtures/feeds/${name}`, import.meta.url), 'utf8');
const devicesYml = fixture('calyxos-devices.yml');
const entries = parse(devicesYml, fixture('calyxos-downloads.yml'));
const byCodename = Object.fromEntries(
  entries.map((entry) => [entry.device.codenames[0], entry]),
);

test('a Pixel with a stable build gets latest, install and a plain relock', () => {
  const { tegu } = byCodename;
  assert.equal(tegu.brand, 'Google');
  assert.deepEqual(tegu.device, { name: 'Pixel 9a', codenames: ['tegu'], aliases: [] });
  assert.deepEqual(tegu.row, {
    status: 'active',
    channel: 'stable',
    android: 16,
    relock: 'yes',
    latest: { version: '7.2.5.20', date: '2026-09-09' },
    source: 'https://calyxos.org/docs/guide/device-support/',
    install: 'https://calyxos.org/install/devices/tegu/',
  });
});

test('non-Pixels relock with a note, and keep upstream case in the install link', () => {
  const { fp4 } = byCodename;
  assert.equal(fp4.brand, 'Fairphone');
  assert.deepEqual(fp4.row.relock, {
    status: 'yes',
    note: "Check CalyxOS's device page before relocking",
  });
  assert.equal(fp4.row.install, 'https://calyxos.org/install/devices/FP4/');
});

test('model names lose "The" and "(beta)", and "and" splits off aliases', () => {
  assert.equal(byCodename.fp6.device.name, 'Fairphone (Gen. 6)');
  assert.equal(byCodename.fp6.row.channel, 'beta');
  assert.deepEqual(byCodename.fogos.device, {
    name: 'moto g34 5G',
    codenames: ['fogos'],
    aliases: ['g45 5G'],
  });
  assert.equal(byCodename.lemonadep.device.name, '9 Pro');
  assert.equal(byCodename.jasmine_sprout.device.name, 'Mi A2');
});

test('upcoming and previous devices have no build, so no latest or install', () => {
  const { status, channel, latest } = byCodename.stallion.row;
  assert.deepEqual([status, channel, latest], ['active', 'beta', undefined]);
  assert.equal(byCodename.sunfish.row.status, 'discontinued');
  assert.equal(byCodename.sunfish.row.install, undefined);
});

test('supportEnds keeps real months only', () => {
  const ends = supportEnds(devicesYml);
  assert.equal(ends.tegu, '2032-04-01');
  assert.equal(ends.fp4, '2026-12-01');
  assert.equal(ends.otter, undefined);
  assert.equal(ends.lemonadep, undefined);
});
