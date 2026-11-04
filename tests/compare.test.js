import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../src/lib/data/load.js';
import { buildModel } from '../src/lib/data/model.js';
import { compareRows, romPairs } from '../src/lib/compare.js';

const phones = (from, to) =>
  Array.from({ length: to - from }, (_, i) => ({ id: `phone-${from + i}` }));
const rom = (key, devices, { status = 'active', active = true } = {}) => ({
  key,
  name: key,
  status,
  support: devices.map((device) => ({ active, device })),
});
const ids = (devices) => devices.map(({ id }) => id);

test('only active ROMs with ten active devices in common get paired, keys in order', () => {
  const shared = phones(0, 10);
  const [pair, ...rest] = romPairs([
    rom('zeta', [...shared, ...phones(10, 12)]),
    rom('alpha', [...shared, ...phones(20, 21)]),
    rom('nine', shared.slice(1)),
    rom('gone', shared, { status: 'discontinued' }),
    rom('stalled', shared, { active: false }),
  ]);
  assert.equal(rest.length, 0);
  assert.equal(pair.url, '/compare/alpha-vs-zeta/');
  assert.deepEqual(ids(pair.both), ids(shared));
  assert.deepEqual(pair.only.map(ids), [['phone-20'], ['phone-10', 'phone-11']]);
});

test('the comparison leads with differences and skips what neither ROM answers', () => {
  const { features, roms } = buildModel(loadData('tests/fixtures/good'), new Date('2026-02-01'));
  const rows = compareRows(roms, roms, features);
  const labels = rows.map((row) => row.head.label);
  assert.deepEqual(labels.slice(-2), ['Built-in root', 'Install with']);
  assert.ok(rows.slice(0, -2).every((row) => !row.same));
  assert.equal(
    rows.find((row) => row.head.label === 'Notifications').cells.handmadeos.text,
    'Depends on the device',
  );
  assert.ok(!labels.includes('VoLTE') && !labels.includes('NFC'));
});
