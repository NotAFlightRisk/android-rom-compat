import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { feedUrls, latestBuild, parseTable } from '../../scripts/import/sources/iodeos.js';

const html = readFileSync('tests/fixtures/feeds/iodeos.html', 'utf8');
const feed = (name) => readFileSync(`tests/fixtures/feeds/iodeos-ota-${name}.json`, 'utf8');
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

test('calls marked no are broken with a note', () => {
  const { row } = entry('beyondx');
  assert.equal(row.relock, 'no');
  assert.equal(row.features.volte.status, 'broken');
  assert.ok(row.features.vowifi.note);
});

test('5G marked no is broken on a phone named 5G, and left out on the rest', () => {
  assert.equal(entry('beyondx').row.features['5g'].status, 'broken');
  assert.ok(entry('beyondx').row.features['5g'].note);
  assert.equal(entry('a5y17lte').row.features['5g'], undefined);
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

test('the release feed is tried as the table spells the codename, then lowercase', () => {
  assert.deepEqual(feedUrls(entry('hawao').feed), [
    'https://ota.iode.tech/v7-release/Hawao.json',
    'https://ota.iode.tech/v7-release/hawao.json',
  ]);
  assert.deepEqual(feedUrls(entry('gts4lvwifi').feed), [
    'https://ota.iode.tech/v6-release/gts4lvwifi.json',
  ]);
});

test('latest build reads the newer feeds, missing comma and all', () => {
  assert.deepEqual(latestBuild(feed('fp5')), {
    version: '7.9',
    date: '2026-10-05',
    patch: '2026-09-01',
    zip: 'https://gitlab.iode.tech/ota/release/-/raw/master/FP5/iode-7.9-20261005-FP5-ota.zip',
  });
});

test('old style feeds give the version and date from the file name', () => {
  const [build] = JSON.parse(feed('poplar')).response;
  const older = { ...build, datetime: 1, filename: 'iode-4.36-20260901-poplar-ota.zip' };
  const expected = { version: '4.37', date: '2026-10-05', zip: build.url };
  assert.deepEqual(latestBuild(feed('poplar')), expected);
  assert.deepEqual(latestBuild(JSON.stringify({ response: [older, build] })), expected);
  assert.equal(latestBuild('{ "response": [] }'), undefined);
});
