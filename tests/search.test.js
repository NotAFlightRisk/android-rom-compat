import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nearly, prepare, readQuery, search } from '../src/lib/search.js';

const device = (name, extra) => ({
  name,
  url: `/devices/acme/${name}/`,
  brand: 'google',
  codenames: [name],
  type: 'phone',
  unlock: 'yes',
  ended: false,
  roms: {},
  ...extra,
});

const catalogue = prepare({
  roms: [
    { key: 'lineageos', name: 'LineageOS' },
    { key: 'pixelos', name: 'PixelOS' },
  ],
  brands: [{ key: 'google', name: 'Google' }],
  features: [
    { key: 'volte', name: 'VoLTE' },
    { key: '5g', name: '5G' },
  ],
  devices: [
    device('Google Pixel 7', {
      codenames: ['panther'],
      released: 2022,
      roms: { lineageos: ['volte'], pixelos: [] },
    }),
    device('Google Pixel 7 Pro', {
      codenames: ['cheetah'],
      released: 2022,
      roms: { lineageos: [] },
    }),
    device('Google Pixel 7a', {
      codenames: ['lynx'],
      released: 2023,
      roms: { pixelos: ['volte'] },
    }),
    device('Samsung Galaxy S21', {
      codenames: ['o1s'],
      aliases: ['SM-G991B'],
      ended: true,
    }),
    device('Samsung Galaxy S20 5G', { codenames: ['x1s'], roms: { lineageos: ['volte', '5g'] } }),
  ],
});

const names = (query, filters) => search(catalogue, query, filters).devices.map(({ name }) => name);

test('the plainest name that fits comes first', () => {
  assert.deepEqual(names('pixel 7'), ['Google Pixel 7', 'Google Pixel 7a', 'Google Pixel 7 Pro']);
});

test('codenames and model numbers find their phone, however they are typed', () => {
  for (const query of ['lynx', 'pixel7a', 'Pixel 7A']) {
    assert.equal(names(query)[0], 'Google Pixel 7a');
  }
  for (const query of ['SM-G991B', 'smg991b', 'g991b']) {
    assert.deepEqual(names(query), ['Samsung Galaxy S21']);
  }
});

test('a ROM or feature in the query keeps only the phones where it fits', () => {
  assert.deepEqual(names('pixel lineage'), ['Google Pixel 7', 'Google Pixel 7 Pro']);
  assert.deepEqual(names('pixel volte'), ['Google Pixel 7', 'Google Pixel 7a']);
  assert.deepEqual(names('pixel 7 lineageos volte'), ['Google Pixel 7']);
  assert.deepEqual(names('', { works: 'volte', rom: 'pixelos' }), ['Google Pixel 7a']);
});

test('a word from a phone name stays a word, even when a ROM or feature starts with it', () => {
  assert.deepEqual(names('galaxy s20 5g'), ['Samsung Galaxy S20 5G']);
  assert.deepEqual(readQuery('pixe', catalogue).roms, []);
  assert.deepEqual(
    readQuery('lineage', catalogue).roms.map(({ key }) => key),
    ['lineageos'],
  );
});

test('one typo still finds the phone', () => {
  assert.ok(nearly('pixle', 'pixel'));
  assert.ok(!nearly('pixel', 'pixies'));
  assert.deepEqual(names('pxiel 7a'), ['Google Pixel 7a']);
});

test('ended support sinks below the rest, or goes when asked', () => {
  assert.deepEqual(names('galaxy'), ['Samsung Galaxy S20 5G', 'Samsung Galaxy S21']);
  assert.deepEqual(names('galaxy', { active: true }), ['Samsung Galaxy S20 5G']);
});

test('nothing typed and nothing picked lists nothing', () => {
  assert.deepEqual(names(''), []);
  assert.deepEqual(names('zzzz'), []);
});
