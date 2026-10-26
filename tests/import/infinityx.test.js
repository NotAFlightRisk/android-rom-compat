import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  androidOf,
  builtOn,
  newestBranches,
  newestBuild,
  parse,
  vendorOf,
} from '../../scripts/import/sources/infinityx.js';

const info = {
  maintainer: 'franlop77',
  maintainerurl: 'https://t.me/franlop77',
  devicemodel: 'Redmi Note 13 Pro 5G / Poco X6 5G',
  codename: 'garnet',
};
const build = {
  download: 'https://sourceforge.net/projects/infinity-x/files/garnet/17/gapps/build.zip',
  timestamp: 1791954773,
  version: '4.1',
};
const entry = { codename: 'garnet', branch: '17', paths: new Set(['flashguide/garnet.txt']) };
const now = Date.parse('2026-10-26');

test('branches are Android versions, master is 15 and anything else is skipped', () => {
  assert.equal(androidOf('17'), 17);
  assert.equal(androidOf('master'), 15);
  assert.equal(androidOf('fix-ota'), undefined);
});

test('makers come from the model, with Pixel, Redmi, POCO and Mi filled in', () => {
  assert.equal(vendorOf('Pixel 9 Pro'), 'Google');
  assert.equal(vendorOf('Poco X6 5G'), 'Xiaomi');
  assert.equal(vendorOf('Samsung Galaxy A25 5G'), 'Samsung');
});

test('the newest build wins across the gapps and vanilla feeds', () => {
  const older = { timestamp: 1, version: '4.0' };
  assert.equal(newestBuild([{ response: [older] }, { response: [build] }]), build);
  assert.equal(newestBuild([]), undefined);
});

test('a codename belongs to the newest branch that lists it', () => {
  const trees = [
    new Set(['devices/garnet.json']),
    new Set(['devices/Garnet.json', 'devices/lancelot.json']),
  ];
  const picked = newestBranches(['17', '16'], trees).map(
    ({ codename, branch }) => `${codename}@${branch}`,
  );
  assert.deepEqual(picked, ['garnet@17', 'lancelot@16']);
});

test('a fresh build makes an active row, named after the first model it lists', () => {
  const { vendor, device, row } = parse(info, build, entry, now);
  assert.equal(vendor, 'Xiaomi');
  assert.deepEqual(device, { name: 'Redmi Note 13 Pro 5G', codenames: ['garnet'] });
  assert.deepEqual(row, {
    status: 'active',
    android: 17,
    maintainer: { name: 'franlop77', link: 'https://t.me/franlop77' },
    latest: { version: '4.1', date: '2026-10-14' },
    source: 'https://projectinfinity-x.com/downloads/garnet',
    install: 'https://github.com/ProjectInfinity-X/official_devices/blob/17/flashguide/garnet.txt',
  });
});

test("a timestamp in the future gives way to the date in the zip's name", () => {
  const typo = {
    timestamp: 11792768200,
    filename: 'Project_Infinity-X-4.1-rubyx-23.10.2026-GAPPS-OFFICIAL.zip',
  };
  assert.equal(builtOn(typo, now), '2026-10-23');
  assert.equal(builtOn(build, now), '2026-10-14');
});

test('a phone not built for half a year, or with no build at all, is discontinued', () => {
  assert.equal(parse(info, build, entry, now + 200 * 864e5).row.status, 'discontinued');
  assert.equal(parse(info, undefined, entry, now).row.status, 'discontinued');
});
