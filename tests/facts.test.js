import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../src/lib/data/load.js';
import { buildModel } from '../src/lib/data/model.js';
import {
  buildFact,
  channelText,
  everywhereCells,
  firmwareNeed,
  knownFeatures,
  maintainerOf,
  needsOf,
  relockFact,
  romRelock,
  statusText,
  stockFact,
  unlockFact,
} from '../src/lib/facts.js';

const model = (now) => buildModel(loadData('tests/fixtures/good'), new Date(now));
const tidyRow = (now) =>
  model(now).support.find((row) => row.device.key === 'rocket' && row.rom.key === 'tidyos');
const wording = (list) => list.map(({ name, text, note, stale }) => [name, text, note, stale]);

test('statuses read as words, and inferred ones as likely', () => {
  assert.equal(statusText({ value: 'working' }), 'Works');
  assert.equal(statusText({ value: 'broken', inferred: true }), "Likely doesn't work");
  assert.equal(statusText({ value: 'basic', inferred: true }), 'Likely basic');
  assert.equal(statusText({ value: 'L3', inferred: true }), 'Likely L3');
});

test('cards list only the features with an answer, and say when a report was made', () => {
  const { features } = model('2026-02-01');
  assert.deepEqual(wording(knownFeatures(features, tidyRow('2026-02-01').cells)), [
    ['NFC', 'Partly works', "Payments don't work", undefined],
    ['Notifications', 'Works', 'Reported 10 Jan 2026 on Android 15, Plus build', undefined],
    ['Widevine', 'L3', undefined, undefined],
  ]);
});

test('an old report says when it was last checked instead of being called stale', () => {
  const { features } = model('2027-02-01');
  const push = knownFeatures(features, tidyRow('2027-02-01').cells).find(
    (feature) => feature.key === 'push',
  );
  assert.equal(push.stale, 'Last checked Jan 2026 on Android 15');
});

test('what a ROM says holds everywhere reads the same way', () => {
  const { features, roms } = model('2026-02-01');
  const tidy = roms.find((rom) => rom.key === 'tidyos');
  assert.deepEqual(wording(knownFeatures(features, everywhereCells(features, tidy))), [
    ['Notifications', 'Partly works', 'Bring your own', undefined],
    ['Widevine', 'Likely unsupported', undefined, undefined],
  ]);
});

test("the bootloader keeps the device's own note, or borrows the brand policy it follows", () => {
  const [device] = model('2026-02-01').devices;
  assert.deepEqual(unlockFact(device), {
    tone: 'partial',
    text: 'Unlocks, with conditions',
    note: 'Carrier models are locked.',
    source: undefined,
  });
  const brand = { bootloader: { unlock: 'yes', notes: 'All unlock.', source: 'https://a.test' } };
  assert.deepEqual(unlockFact({ bootloader: { unlock: 'yes', origin: 'brand' }, brand }), {
    tone: 'working',
    text: 'Unlocks',
    note: 'All unlock.',
    source: 'https://a.test',
  });
  assert.equal(unlockFact({ bootloader: { unlock: 'no' }, brand }).note, undefined);
});

test('stock updates read as a date, until they run out', () => {
  const { stock } = model('2026-02-01').devices[0];
  assert.deepEqual(
    [stockFact(stock, '2026-02-01').text, stockFact(stock, '2026-02-01').note],
    ['Security updates until Jan 2027', 'Android 13 to 15'],
  );
  assert.equal(stockFact(stock, '2027-02-01').text, 'Updates have ended');
  assert.deepEqual(stockFact({ android: '13 - 15', source: 'https://a.test' }), {
    text: 'Android 13 to 15',
    source: 'https://a.test',
  });
  assert.equal(stockFact(undefined), undefined);
});

test('builds carry a readable date, their patch month, and say so once they are old', () => {
  const latest = { version: '1.2', date: '2026-01-09', patch: '2026-01-01' };
  assert.deepEqual(buildFact(latest, Date.parse('2026-02-01')), {
    date: '2026-01-09',
    tone: 'working',
    text: '9 Jan 2026',
    old: undefined,
    version: '1.2',
    patch: 'Jan 2026',
  });
  assert.equal(buildFact(latest, Date.parse('2026-09-01')).old, 'Over 6 months old');
  assert.equal(buildFact(undefined), undefined);
});

test('relock and install needs only say what the ROM says', () => {
  const { name, text } = relockFact(tidyRow('2026-02-01'));
  assert.deepEqual([name, text], ['Bootloader relock', 'Supported']);
  assert.equal(relockFact({ relock: 'no' }).text, 'Not supported');
  assert.equal(relockFact({ relock: 'unknown' }), undefined);
  assert.equal(relockFact({}), undefined);
  assert.deepEqual(needsOf({ firmware: '16', channel: 'beta' }), [
    'Install stock Android 16 first',
    'Beta build',
  ]);
  assert.equal(firmwareNeed({ firmware: '14/15/16' }), 'Install stock Android 14, 15 or 16 first');
  assert.equal(channelText({ channel: 'community' }), 'Community build');
  assert.deepEqual(needsOf({ channel: 'stable' }), []);
});

test("a ROM's relock answer gives way when its own device pages say otherwise", () => {
  const rom = { security: { relockable_bootloader: false }, support: [{ active: true }] };
  assert.equal(romRelock(rom), 'No');
  rom.support.push({ active: true, relock: { status: 'yes', note: 'Check first' } });
  assert.equal(romRelock(rom), 'On some devices');
  assert.equal(romRelock({ security: { relockable_bootloader: true }, support: [] }), 'Yes');
});

test('a maintainer is a name, with a link when the ROM gives one', () => {
  assert.deepEqual(maintainerOf({ maintainer: 'Joey' }), { name: 'Joey' });
  const linked = { name: 'Joey', link: 'https://github.com/joeyhuab' };
  assert.deepEqual(maintainerOf({ maintainer: linked }), linked);
  assert.equal(maintainerOf({}), undefined);
});
