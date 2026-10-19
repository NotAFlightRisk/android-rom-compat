import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'yaml';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'store-test-'));
after(() => rmSync(process.env.DATA_DIR, { recursive: true }));
const { writeUpstream, readUpstream, upsertDevice } = await import('../../scripts/import/store.js');
const { today } = await import('../../src/lib/dates.js');

const row = (status = 'active') => ({ status, source: 'https://example.com' });
const rows = (count) =>
  Object.fromEntries(Array.from({ length: count }, (_, i) => [`acme/dev${i}`, row()]));

test('rows are sorted by brand and codename, with the generated header', () => {
  writeUpstream('sorted', { 'acme/zeta': row(), 'acme/alpha': row() });
  const text = readFileSync(join(process.env.DATA_DIR, 'upstream/sorted.yml'), 'utf8');
  assert.match(
    text,
    /^# yaml-language-server: \$schema=\.\.\/\.\.\/schema\/upstream\.json\n# Generated/,
  );
  assert.deepEqual(Object.keys(readUpstream('sorted').devices), ['acme/alpha', 'acme/zeta']);
});

test('devices that vanish are kept as discontinued', () => {
  const gone = { ...row(), latest: { date: '2026-01-01' } };
  writeUpstream('ended', { 'acme/keep': row(), 'acme/gone': gone });
  const result = writeUpstream('ended', { 'acme/keep': row() });
  assert.deepEqual(result, { rows: 2, added: 0, ended: 1 });
  assert.deepEqual(readUpstream('ended').devices['acme/gone'], {
    status: 'discontinued',
    source: 'https://example.com',
    latest: { date: '2026-01-01' },
  });
});

test('a codename that moves in with another device brings its row, ended or not', () => {
  writeUpstream('moved', { 'acme/old': row(), 'acme/gone': row() });
  upsertDevice('Acme', { name: 'New', codenames: ['new', 'old'] });
  upsertDevice('Acme', { name: 'Newer', codenames: ['newer', 'gone'] });
  writeUpstream('moved', { 'acme/new': row() });
  assert.deepEqual(readUpstream('moved').devices, {
    'acme/new': row(),
    'acme/newer': row('discontinued'),
  });
});

test('a codename another brand already uses gets a device of its own', () => {
  assert.equal(upsertDevice('Acme', { name: 'Twin', codenames: ['twin'] }), 'acme/twin');
  assert.equal(upsertDevice('Tidy', { name: 'Twin', codenames: ['twin'] }), 'tidy/twin');
  assert.ok(existsSync(join(process.env.DATA_DIR, 'devices/tidy/twin.yml')));
});

test('a name that opens with another brand we list goes to that brand', () => {
  upsertDevice('Acme', { name: 'Rocket', codenames: ['rocket'] });
  assert.equal(upsertDevice('Tidy', { name: 'Acme Rocket', codenames: ['rocket'] }), 'acme/rocket');
  assert.ok(!existsSync(join(process.env.DATA_DIR, 'devices/tidy/rocket.yml')));
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
    'imported: 2020-01-01\ndevices:\n  acme/a: { status: active, source: https://example.com }\n',
  );
  writeUpstream('same', { 'acme/a': row() });
  assert.equal(readUpstream('same').imported, '2020-01-01');
  writeUpstream('same', { 'acme/a': row(), 'acme/b': row() });
  assert.equal(readUpstream('same').imported, today);
});

test('a row that breaks the schema fails the source instead of the whole import', () => {
  writeUpstream('broken', { 'acme/a': row() });
  const bad = { 'acme/a': { ...row(), latest: { date: '+057647-02-01' } } };
  assert.throws(() => writeUpstream('broken', bad), /bad row, devices\.acme\/a\.latest\.date/);
  assert.equal(readUpstream('broken').devices['acme/a'].latest, undefined);
});

test('a bootloader answer gains our notes and source only if its own words match', () => {
  const ours = { unlock: 'no', notes: 'Nope.', source: 'https://example.com/wiki' };
  const refilled = (codename, bootloader) => {
    upsertDevice('Acme', { name: codename, codenames: [codename], bootloader });
    upsertDevice('Acme', { name: codename, codenames: [codename], bootloader: ours });
    const file = join(process.env.DATA_DIR, `devices/acme/${codename}.yml`);
    return parse(readFileSync(file, 'utf8')).bootloader;
  };
  assert.deepEqual(refilled('blank', { unlock: 'unknown' }), ours);
  assert.deepEqual(refilled('bare', { unlock: 'no' }), ours);
  assert.deepEqual(refilled('same', { unlock: 'no', notes: 'Nope.' }), ours);
  assert.deepEqual(refilled('own', { unlock: 'no', notes: 'Exploit only.' }), {
    unlock: 'no',
    notes: 'Exploit only.',
  });
  assert.deepEqual(refilled('open', { unlock: 'yes' }), { unlock: 'yes' });
});
