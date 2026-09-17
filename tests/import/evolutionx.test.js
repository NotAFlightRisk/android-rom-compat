import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { namesOf, newestBranch, parse } from '../../scripts/import/sources/evolutionx.js';

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/feeds/${name}`, import.meta.url), 'utf8'));
const branches = Object.fromEntries(
  fixture('evolutionx-devices.json').map(({ codename, branches }) => [codename, branches]),
);

test('the newest Android branch wins and vanilla builds are ignored', () => {
  assert.equal(newestBranch(branches.marble), 'cnb');
  assert.equal(newestBranch(branches.Pong), 'bka');
  assert.equal(newestBranch(branches.PL2), 'udc');
  assert.equal(newestBranch(['bka-vanilla']), undefined);
});

test('a maintained device gets android from its branch, latest and the forum link', () => {
  const { brand, device, row } = parse(fixture('evolutionx-marble.json'), {
    codename: 'marble',
    branch: 'cnb',
  });
  assert.equal(brand, 'Xiaomi');
  assert.deepEqual(device, {
    name: 'Poco F5',
    codenames: ['marble'],
    aliases: ['Redmi Note 12 Turbo'],
  });
  assert.deepEqual(row, {
    status: 'active',
    android: 17,
    maintainer: 'Joey',
    latest: { version: '12.2', date: '2026-09-09' },
    source: 'https://evolution-x.org/device/marble',
    install: 'https://xdaforums.com/t/rom-17-marble-official-evolution-x-07-20-26.4709959/',
  });
});

test('an unmaintained device is discontinued, and an empty forum means no install link', () => {
  const pl2 = parse(fixture('evolutionx-pl2.json'), { codename: 'PL2', branch: 'udc' });
  assert.equal(pl2.row.status, 'discontinued');
  assert.equal(pl2.row.android, 14);
  assert.deepEqual(pl2.device.codenames, ['pl2']);

  const pong = parse(fixture('evolutionx-pong.json'), { codename: 'Pong', branch: 'bka' });
  assert.equal(pong.row.install, undefined);
  assert.equal(pong.row.source, 'https://evolution-x.org/device/Pong');
});

test('tablets are spotted from the name', () => {
  const { device } = parse(fixture('evolutionx-gta4xlwifi.json'), {
    codename: 'gta4xlwifi',
    branch: 'bka',
  });
  assert.equal(device.type, 'tablet');
});

test('names split into aliases, minus bare suffixes and bracketed lists', () => {
  assert.deepEqual(namesOf('Moto G10 & G10 Power / Lenovo K13 Note', 'Motorola'), {
    name: 'Moto G10',
    aliases: ['G10 Power', 'Lenovo K13 Note'],
  });
  assert.deepEqual(namesOf('realme 6/6i(Indian)/6s/Narzo', 'Realme'), { name: '6', aliases: [] });
  assert.deepEqual(namesOf('POCO M2 Pro / Redmi Note (9S / 9 Pro)', 'Xiaomi'), {
    name: 'POCO M2 Pro',
    aliases: [],
  });
});
