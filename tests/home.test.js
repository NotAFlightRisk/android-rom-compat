import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mostSupported, recentlyBuilt } from '../src/lib/home.js';

const phone = (title, brand, activeCount, builds = {}) => ({
  title,
  brand,
  activeCount,
  support: Object.entries(builds).map(([rom, date]) => ({ rom, latest: { date }, active: true })),
});
const pixel9 = phone('Pixel 9', 'google', 8);
const pixel8 = phone('Pixel 8', 'google', 7);
const oneplus = phone('OnePlus 13', 'oneplus', 6);
const fairphone = phone('Fairphone 6', 'fairphone', 4);
const titles = (devices) => devices.map((device) => device.title);
const built = (builds) => builds.map(({ device, rom }) => [device.title, rom]);

test('most supported takes one phone per brand before any brand gets a second', () => {
  const devices = [pixel9, pixel8, oneplus, fairphone];
  assert.deepEqual(titles(mostSupported(devices, 3)), ['Pixel 9', 'OnePlus 13', 'Fairphone 6']);
});

test('most supported tops up from the same brands when there are too few of them', () => {
  const devices = [fairphone, pixel8, oneplus, pixel9];
  assert.deepEqual(titles(mostSupported(devices, 4)), [
    'Pixel 9',
    'Pixel 8',
    'OnePlus 13',
    'Fairphone 6',
  ]);
});

test("recently built gives each ROM its newest build on a phone that's still free", () => {
  const fp4 = phone('Fairphone 4', 'fairphone', 2, { calyxos: '2026-10-06', eos: '2026-09-29' });
  const fp3 = phone('Fairphone 3', 'fairphone', 1, { eos: '2026-09-20' });
  const pixel = phone('Pixel 10', 'google', 1, { grapheneos: '2026-10-16' });
  assert.deepEqual(built(recentlyBuilt([fp3, fp4, pixel], [pixel], 3)), [
    ['Fairphone 4', 'calyxos'],
    ['Fairphone 3', 'eos'],
  ]);
});

test('recently built leaves out builds from support that has ended', () => {
  const pixel = phone('Pixel 7', 'google', 1, { dotos: '2026-10-24', lineageos: '2026-10-20' });
  pixel.support[0].active = false;
  assert.deepEqual(built(recentlyBuilt([pixel], [], 2)), [['Pixel 7', 'lineageos']]);
});
