import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parse, parseBuild } from '../../scripts/import/sources/grapheneos.js';

const fixture = (name) =>
  readFileSync(new URL(`../fixtures/feeds/${name}`, import.meta.url), 'utf8');
const feed = {
  installer: fixture('grapheneos-web-install.js'),
  faq: fixture('grapheneos-faq.html'),
  releases: fixture('grapheneos-releases.html'),
};
const byCodename = (entries) =>
  Object.fromEntries(entries.map((entry) => [entry.device.codenames[0], entry]));

test('reads the build id and unix time off a release channel file', () => {
  assert.deepEqual(parseBuild(fixture('grapheneos-tegu-stable.txt')), {
    version: '2026091000',
    date: '2026-09-10',
  });
});

test('supported Pixels are active on the newest Android and relock', () => {
  const latest = { tegu: { version: '2026091000', date: '2026-09-10' } };
  const { tegu } = byCodename(parse({ ...feed, latest }));
  assert.equal(tegu.brand, 'Google');
  assert.deepEqual(tegu.device, {
    name: 'Pixel 9a',
    codenames: ['tegu'],
    bootloader: {
      unlock: 'conditional',
      notes: "Carrier models, like Verizon's, can't be unlocked.",
    },
  });
  assert.deepEqual(tegu.row, {
    status: 'active',
    channel: 'stable',
    android: 17,
    maintainer: 'GrapheneOS',
    relock: 'yes',
    latest: latest.tegu,
    source: 'https://grapheneos.org/faq#supported-devices',
    install: 'https://grapheneos.org/install/web',
  });
});

test('legacy devices are discontinued, with no Android or install link', () => {
  const devices = byCodename(parse(feed));
  assert.deepEqual(devices.bramble.row, {
    status: 'discontinued',
    channel: 'stable',
    maintainer: 'GrapheneOS',
    relock: 'yes',
    source: 'https://grapheneos.org/faq#supported-devices',
  });
  assert.equal(devices.bramble.device.name, 'Pixel 4a 5G');
  assert.deepEqual(devices.angler.device.bootloader, {});
  assert.equal(devices.jflte.brand, 'Samsung');
  assert.equal(devices.jflte.device.name, 'Galaxy S4');
  assert.equal(devices.jflte.row.relock, undefined);
});

test('names from FAQ prose count once, like the lists', () => {
  const codenames = parse(feed).map((entry) => entry.device.codenames[0]);
  assert.equal(new Set(codenames).size, codenames.length);
  assert.ok(codenames.includes('shiba'));
});
