import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../src/lib/data/load.js';
import { buildModel } from '../src/lib/data/model.js';
import { resolveCell } from '../src/lib/data/status.js';

const model = (now) => buildModel(loadData('tests/fixtures/good'), new Date(now));
const rowOf = (now, rom) =>
  model(now).support.find((row) => row.device.key === 'rocket' && row.rom.key === rom);
const cellsOf = (row) =>
  Object.fromEntries(
    Object.entries(row.cells).map(([key, cell]) => [key, [cell.value, cell.origin]]),
  );

test('cells resolve report, then docs, then hardware, then ROM-wide', () => {
  assert.deepEqual(cellsOf(rowOf('2026-02-01', 'tidyos')), {
    nfc: ['partial', 'upstream'],
    volte: ['n/a', 'hardware'],
    push: ['working', 'report'],
    widevine: ['L3', 'report'],
  });
});

test('explicit values beat inferred ones, whatever layer they sit in', () => {
  const feature = { key: 'wallet' };
  const cell = resolveCell(feature, {
    report: { wallet: { status: 'working', inferred: true } },
    device: {},
    rom: { features: { wallet: { status: 'broken', note: 'Nope', source: 'https://x.test' } } },
  });
  assert.equal(cell.value, 'broken');
  assert.equal(cell.origin, 'rom');
  const onlyInferred = resolveCell(feature, {
    report: { wallet: { status: 'working', inferred: true } },
    device: {},
    rom: {},
  });
  assert.deepEqual([onlyInferred.value, onlyInferred.inferred], ['working', true]);
});

test('reports go stale after a year or a newer Android', () => {
  assert.equal(rowOf('2026-02-01', 'tidyos').cells.push.stale, false);
  assert.equal(rowOf('2027-02-01', 'tidyos').cells.push.stale, true);
  const cell = resolveCell(
    { key: 'nfc' },
    { report: { nfc: { status: 'working', android: 14 } }, device: {}, rom: {}, android: 15 },
  );
  assert.equal(cell.stale, true);
});

test('rows join docs, hand-written rows, variants and stock support', () => {
  const tidy = rowOf('2026-02-01', 'tidyos');
  assert.deepEqual(
    tidy.variants.map(({ key, latest }) => [key, latest.date]),
    [['plus', '2026-01-08']],
  );
  assert.equal(tidy.generated, true);
  const handmade = rowOf('2026-02-01', 'handmadeos');
  assert.deepEqual([handmade.generated, handmade.status, handmade.android], [false, 'active', 14]);
  assert.equal(tidy.device.stock.security_until, '2027-01-01');
});
