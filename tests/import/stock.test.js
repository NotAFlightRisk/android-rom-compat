import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  fromCalyxos,
  join,
  nameKeys,
  products,
  stockRow,
} from '../../scripts/import/sources/stock.js';

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/feeds/${name}`, import.meta.url), 'utf8'));

const releases = ['pixel', 'fairphone', 'samsung-mobile', 'sony-xperia'].flatMap((product) => {
  const { result } = fixture(`stock-${product}.json`);
  return result.releases.map((release) => ({
    brand: products[product],
    label: release.label,
    row: stockRow(release, result.links.html),
  }));
});
const rowOf = (label) => releases.find((release) => release.label === label).row;

const device = (brand, key, name, extra = {}) => ({
  brand,
  key,
  data: { name, codenames: [key], ...extra },
});

test('dates pass through, and a null date on an ended release becomes ended', () => {
  assert.deepEqual(rowOf('Pixel 9a'), {
    android: '15 - 17',
    updates_until: '2032-04-01',
    security_until: '2032-04-01',
    source: 'https://endoflife.date/pixel',
  });
  assert.deepEqual(rowOf('Fairphone 4'), {
    android: '11 - 15',
    updates_until: 'ended',
    security_until: '2028-09-01',
    source: 'https://endoflife.date/fairphone',
  });
  assert.equal(rowOf('Galaxy A5').security_until, 'ended');
});

test("Sony's arrow lists become a range, and a missing eoas leaves updates_until out", () => {
  assert.deepEqual(rowOf('Xperia 10 VI'), {
    android: '14 - 16',
    security_until: '2028-05-01',
    source: 'https://endoflife.date/sony-xperia',
  });
});

test('names normalise brand, brackets, 5G, plus and connectivity variants', () => {
  assert.equal(nameKeys('Pixel 4a (5G)').full, nameKeys('Pixel 4a 5G').full);
  assert.equal(nameKeys('Fairphone 6').full, nameKeys('The Fairphone (Gen. 6)').full);
  assert.equal(nameKeys('Galaxy S23+').full, nameKeys('Galaxy S23 Plus').full);
  assert.equal(nameKeys('Galaxy Tab S7').full, nameKeys('Galaxy Tab S7 (Wi-Fi)').full);
  assert.equal(nameKeys('Galaxy Note20 Ultra').full, nameKeys('Galaxy Note20 Ultra (4G/5G)').full);
  assert.deepEqual(nameKeys('Nexus 7 2013 (LTE)'), { full: 'nexus72013', yearless: 'nexus7' });
});

test('devices join by brand and name, aliases included, exact years before none', () => {
  const rows = join(
    [
      device('google', 'bramble', 'Pixel 4a 5G'),
      device('fairphone', 'fp3', '3', { aliases: ['3+'] }),
      device('fairphone', 'fp6', 'The Fairphone (Gen. 6)'),
      device('samsung', 'a5xelte', 'Galaxy A5 (2016)'),
      device('samsung', 'zerofltexx', 'Galaxy S6'),
      device('samsung', 'z3q', 'Galaxy S20 Ultra (5G)'),
      device('sony', 'pdx246', 'Xperia 10 VI'),
      device('google', 'fp4', 'Fairphone 4'),
    ],
    releases,
  );
  assert.deepEqual(Object.keys(rows).sort(), [
    'a5xelte',
    'bramble',
    'fp3',
    'fp6',
    'pdx246',
    'z3q',
    'zerofltexx',
  ]);
  assert.equal(rows.a5xelte, rowOf('Galaxy A5 (2016)'));
  assert.equal(rows.fp3, rowOf('Fairphone 3'));
  assert.equal(rows.zerofltexx, rowOf('Galaxy S6'));
});

test('a year on our side still finds a release without one, but not the other way round', () => {
  const rows = join(
    [device('samsung', 'a5y17lte', 'Galaxy A5 (2017)'), device('google', 'redfin', 'Pixel')],
    [
      { brand: 'samsung', label: 'Galaxy A5', row: { source: 'a5' } },
      { brand: 'google', label: 'Pixel (2016)', row: { source: 'pixel' } },
    ],
  );
  assert.deepEqual(rows, { a5y17lte: { source: 'a5' } });
});

test('CalyxOS fills Pixels endoflife.date missed, and nothing else', () => {
  const devices = [
    device('google', 'tegu', 'Pixel 9a'),
    device('google', 'oriole', 'Pixel 6'),
    device('fairphone', 'fp5', '5'),
  ];
  const ends = { tegu: '2032-04-01', oriole: '2026-10-01', fp5: '2026-12-01' };
  assert.deepEqual(fromCalyxos(devices, { tegu: {} }, ends), {
    oriole: {
      security_until: '2026-10-01',
      source: 'https://calyxos.org/docs/guide/device-support/',
    },
  });
});
