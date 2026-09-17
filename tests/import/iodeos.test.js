import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseTable } from '../../scripts/import/sources/iodeos.js';

const html = readFileSync('tests/fixtures/feeds/iodeos.html', 'utf8');
const entries = parseTable(html);
const entry = (codename) => entries.find((item) => item.device.codenames[0] === codename);

test('every device row comes through, GSIs left out', () => {
  assert.equal(entries.length, 8);
  assert.equal(entries.some(({ brand }) => brand.startsWith('GSI')), false);
});

test('a fully working device gets relock, android and working calls and 5G', () => {
  const { brand, device, row } = entry('tegu');
  assert.equal(brand, 'Google');
  assert.equal(device.name, 'Pixel 9a');
  assert.deepEqual(row, {
    status: 'active',
    android: 16,
    relock: 'yes',
    source: 'https://iode.tech/iodeos-official-supported-devices/',
    install: 'https://iode.tech/installation/',
    features: { volte: 'working', vowifi: 'working', '5g': 'working' },
  });
});

test('variants on separate lines become aliases and codenames are lowercased', () => {
  const { device } = entry('hawao');
  assert.equal(device.name, 'moto g42');
  assert.deepEqual(device.aliases, ['XT2233-1', 'XT2233-2']);
});

test('calls marked no are broken with a note, and 5G marked no is left out', () => {
  const { row } = entry('beyondx');
  assert.equal(row.relock, 'no');
  assert.equal(row.features.volte.status, 'broken');
  assert.ok(row.features.vowifi.note);
  assert.equal(row.features['5g'], undefined);
});

test('wifi-only tablets get no call features at all', () => {
  assert.equal(entry('gts4lvwifi').row.features, undefined);
});

test('columns are found by header name, not position', () => {
  const swap = (text) =>
    text.replace(
      /(<t([hd]) class="column-6">[\s\S]*?<\/t\2>)(<t\2 class="column-7">[\s\S]*?<\/t\2>)/g,
      '$3$1',
    );
  assert.deepEqual(parseTable(swap(html)), entries);
});
