import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  androidOfBranch,
  newestBuild,
  parse,
  vendorOf,
} from '../../scripts/import/sources/axionos.js';

const maintainers = new Map([['Shravan', { name: 'Shravan', link: 'https://github.com/DarkDolphin1' }]]);
const entry = {
  codename: 'Pacman',
  name: 'Nothing Phone 2a',
  brand: 'nothing',
  status: 'active',
  maintainer_ids: ['Shravan'],
  guide: 'https://raw.githubusercontent.com/AxionAOSP/official_devices/refs/heads/main/Wiki/Pacman.md',
};
const build = { datetime: 1791642948, version: '2.9' };

test('vendors come from the name, except POCO and Redmi, which are Xiaomi', () => {
  assert.equal(vendorOf({ brand: 'nothing', name: 'Nothing Phone 2a' }), 'Nothing');
  assert.equal(vendorOf({ brand: 'other', name: 'Infinix Hot 50 4G' }), 'Infinix');
  assert.equal(vendorOf({ brand: 'poco', name: 'POCO F7' }), 'Xiaomi');
  assert.equal(vendorOf({ brand: 'realme', name: 'Narzo 50A' }), 'realme');
});

test('lineage branches map to Android the way LineageOS numbers them', () => {
  assert.equal(androidOfBranch('lineage-23.2'), 16);
  assert.equal(androidOfBranch('main'), undefined);
});

test('the newest build wins, and an empty feed has none', () => {
  const older = { datetime: 1, version: '2.8' };
  assert.equal(newestBuild({ response: [older, build] }), build);
  assert.equal(newestBuild({ response: [] }), undefined);
});

test('an active phone gets a brand-less name, its build and links to its pages', () => {
  const { vendor, device, row } = parse(entry, { build, maintainers, android: 16, current: 2 });
  assert.equal(vendor, 'Nothing');
  assert.deepEqual(device, { name: 'Phone 2a', codenames: ['pacman'] });
  assert.deepEqual(row, {
    status: 'active',
    android: 16,
    maintainer: { name: 'Shravan', link: 'https://github.com/DarkDolphin1' },
    latest: { version: '2.9', date: '2026-10-10' },
    source: 'https://www.axionos.org/download/Pacman',
    install: 'https://github.com/AxionAOSP/official_devices/blob/main/Wiki/Pacman.md',
  });
});

test("a build from an older major doesn't claim the current Android", () => {
  const old = { datetime: 1750000000, version: '1.9' };
  const { row } = parse(entry, { build: old, maintainers, android: 16, current: 2 });
  assert.equal(row.android, undefined);
  assert.deepEqual(row.latest, { version: '1.9', date: '2025-06-15' });
});
