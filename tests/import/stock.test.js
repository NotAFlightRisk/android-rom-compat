import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  fromCalyxos,
  join,
  nameKeys,
  products,
  stockRow,
  xiaomiRelease,
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

const device = (brand, codename, name, extra = {}) => ({
  brand,
  id: codename,
  data: { name, codenames: [codename], ...extra },
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

test("Xiaomi's list gives the security cut-off as a date, from Xiaomi's own page", () => {
  const [first, second] = fixture('stock-xiaomi.json').data.map(xiaomiRelease);
  assert.deepEqual(first, {
    brand: 'xiaomi',
    label: 'REDMI Note 17 Pro Max 5G',
    row: {
      security_until: '2032-09-17',
      source: 'https://trust.mi.com/misrc/updates/detail?tab=phone',
    },
  });
  assert.equal(second.label, 'POCO X8 Pro');
});

test('Xiaomi names join without the brand, the 4G or the spacing', () => {
  const xiaomi = fixture('stock-xiaomi.json').data.map(xiaomiRelease);
  const rows = join(
    [
      device('xiaomi', 'diting', '12T Pro'),
      device('xiaomi', 'sweet2', 'Redmi Note 12 Pro 4G'),
      device('xiaomi', 'rubyx', 'Note 12 Pro', { aliases: ['Redmi Note 12 Pro 5G'] }),
      device('xiaomi', 'oxygen', 'Mi Max 2'),
    ],
    xiaomi,
  );
  const until = (key) => rows[key].security_until;
  assert.deepEqual(
    ['diting', 'sweet2', 'rubyx', 'oxygen'].map(until),
    ['2026-10-13', '2026-04-20', '2027-03-23', '2020-07-01'],
  );
});

test("a device's own name wins, and aliases alone give the earliest cut-off", () => {
  const rows = join(
    [
      device('motorola', 'fogos', 'moto g34 5G', { aliases: ['moto g45 5G'] }),
      device('xiaomi', 'gemstone', 'Note 12 5G/Poco X5', {
        aliases: ['POCO X5 5G', 'Redmi Note 12 5G'],
      }),
      device('sony', 'twins', 'Xperia Twin', { aliases: ['Xperia A', 'Xperia B'] }),
    ],
    [
      { brand: 'motorola', label: 'Moto G34 5G', row: { security_until: '2027-01-31' } },
      { brand: 'motorola', label: 'Moto G45 5G', row: { security_until: '2026-09-30' } },
      { brand: 'xiaomi', label: 'POCO X5 5G', row: { security_until: '2027-02-06' } },
      { brand: 'xiaomi', label: 'Redmi Note 12 5G', row: { security_until: '2026-03-23' } },
      { brand: 'sony', label: 'Xperia A', row: { security_until: '2030-01-01' } },
      { brand: 'sony', label: 'Xperia B', row: { security_until: 'ended' } },
    ],
  );
  assert.equal(rows.fogos.security_until, '2027-01-31');
  assert.equal(rows.gemstone.security_until, '2026-03-23');
  assert.equal(rows.twins.security_until, 'ended');
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
