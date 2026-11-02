import assert from 'node:assert/strict';
import { test } from 'node:test';
import { androidOf, feedOf, parse } from '../../scripts/import/sources/derpfest.js';

const repos = [
  { folder: 'repo_avalon', owner: 'amanrajOO7', repo: 'derpfest_avalon', branch: '16.0' },
  { folder: 'repo_primary', owner: 'DerpFest-AOSP', repo: 'Updater-Stuff', branch: 'master' },
];
const entry = {
  codename: 'giulia',
  displayName: 'OnePlus 13R',
  maintainer: '0mar',
  latest: {
    filename: 'DerpFest-v17-20261023-giulia-Official-Stable.zip',
    url: 'https://sourceforge.net/projects/derpfest/files/giulia/build.zip/download',
    version: 'v17',
    datetime: 1792783101,
  },
  sources: [{ repoFolder: 'repo_primary', filePath: 'repo_primary/giulia.json' }],
};
const now = Date.parse('2026-11-02');

test("Android comes from the version, or else the zip's name", () => {
  assert.equal(androidOf({ version: 'v16.2' }), 16);
  assert.equal(androidOf({ version: '13' }), 13);
  assert.equal(androidOf({ version: '', filename: 'DerpFest-14-Official-Stable-phone1.zip' }), 14);
});

test('the source is the feed file in whichever repo the site read it from', () => {
  assert.equal(
    feedOf(entry, repos),
    'https://github.com/DerpFest-AOSP/Updater-Stuff/blob/master/giulia.json',
  );
  const avalon = { sources: [{ repoFolder: 'repo_avalon', filePath: 'repo_avalon/avalon.json' }] };
  assert.equal(
    feedOf(avalon, repos),
    'https://github.com/amanrajOO7/derpfest_avalon/blob/16.0/avalon.json',
  );
});

test('a fresh build makes an active row, with the maker taken off the name', () => {
  const { vendor, name, row } = parse(entry, repos, now);
  assert.equal(vendor, 'OnePlus');
  assert.equal(name, '13R');
  assert.deepEqual(row, {
    status: 'active',
    channel: 'stable',
    android: 17,
    maintainer: '0mar',
    latest: { date: '2026-10-23' },
    source: 'https://github.com/DerpFest-AOSP/Updater-Stuff/blob/master/giulia.json',
  });
});

test('beta builds, unknown maintainers and old builds read as such', () => {
  const beta = {
    ...entry,
    maintainer: 'Unknown',
    latest: { ...entry.latest, filename: 'DerpFest-v16.2-20260506-chime-Official-Beta.zip' },
  };
  const { row } = parse(beta, repos, now);
  assert.equal(row.channel, 'beta');
  assert.equal(row.maintainer, undefined);
  assert.equal(parse(entry, repos, now + 200 * 864e5).row.status, 'discontinued');
});

test("a name that's just the codename leaves the maker to the device files", () => {
  const bare = { ...entry, codename: 'chime', displayName: 'chime' };
  assert.equal(parse(bare, repos, now).vendor, undefined);
  assert.equal(parse(bare, repos, now).name, undefined);
});

test('GSIs and entries with no build are skipped', () => {
  const gsi = { ...entry, latest: { ...entry.latest, filename: 'Derpfest-16_GSI_arm64.img.xz' } };
  assert.equal(parse(gsi, repos, now), undefined);
  assert.equal(parse({ ...entry, latest: undefined }, repos, now), undefined);
});
