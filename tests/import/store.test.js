import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'store-test-'));
after(() => rmSync(process.env.DATA_DIR, { recursive: true }));
const { writeUpstream, readUpstream, today } = await import('../../scripts/import/store.js');

const row = (status = 'active') => ({ status, source: 'https://example.com' });
const rows = (count, prefix = 'dev') =>
  Object.fromEntries(Array.from({ length: count }, (_, i) => [`${prefix}${i}`, row()]));

test('rows are sorted by codename, with the generated header', () => {
  writeUpstream('sorted', { zeta: row(), alpha: row() });
  const text = readFileSync(join(process.env.DATA_DIR, 'upstream/sorted.yml'), 'utf8');
  assert.match(
    text,
    /^# yaml-language-server: \$schema=\.\.\/\.\.\/schema\/upstream\.json\n# Generated/,
  );
  assert.deepEqual(Object.keys(readUpstream('sorted').devices), ['alpha', 'zeta']);
});

test('devices that vanish are kept as discontinued', () => {
  writeUpstream('ended', { keep: row(), gone: { ...row(), latest: { date: '2026-01-01' } } });
  const result = writeUpstream('ended', { keep: row() });
  assert.deepEqual(result, { rows: 2, added: 0, ended: 1 });
  assert.deepEqual(readUpstream('ended').devices.gone, {
    status: 'discontinued',
    source: 'https://example.com',
    latest: { date: '2026-01-01' },
  });
});

test('a source that loses a fifth of its devices fails and leaves the file alone', () => {
  writeUpstream('floor', rows(10));
  assert.throws(() => writeUpstream('floor', rows(7)), /only 7 active devices, last import had 10/);
  assert.equal(Object.keys(readUpstream('floor').devices).length, 10);
  assert.doesNotThrow(() => writeUpstream('floor', rows(8)));
});

test('an import with nothing new keeps the old imported date', () => {
  mkdirSync(join(process.env.DATA_DIR, 'upstream'), { recursive: true });
  const file = join(process.env.DATA_DIR, 'upstream/same.yml');
  writeFileSync(
    file,
    'imported: 2020-01-01\ndevices:\n  a: { status: active, source: https://example.com }\n',
  );
  writeUpstream('same', { a: row() });
  assert.equal(readUpstream('same').imported, '2020-01-01');
  writeUpstream('same', { a: row(), b: row() });
  assert.equal(readUpstream('same').imported, today);
});

test('a row that breaks the schema fails the source instead of the whole import', () => {
  writeUpstream('broken', { a: row() });
  const bad = { a: { ...row(), latest: { date: '+057647-02-01' } } };
  assert.throws(() => writeUpstream('broken', bad), /bad row, devices\.a\.latest\.date/);
  assert.equal(readUpstream('broken').devices.a.latest, undefined);
});
