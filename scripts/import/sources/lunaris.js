import { fetchJson, fetchMetadata, mapLimit, patchOf } from '../fetch.js';
import { brandKey, brandsOf, known, rowsFor, upsertDevice } from '../store.js';
import { freshest } from './crdroid.js';
import { dateOf, namesOf, typeOfName } from './evolutionx.js';

const REPO = 'Lunaris-AOSP/OTA';
const API = `https://api.github.com/repos/${REPO}`;
const DAY = 24 * 60 * 60 * 1000;

/** Release branches, newest first, as in 16.10 over 16.2 over 16 */
export const releaseBranches = (branches) =>
  branches
    .map(({ name }) => name)
    .filter((name) => /^\d+(\.\d+)?$/.test(name))
    .sort((a, b) => b.localeCompare(a, 'en', { numeric: true }));

/** Codename and path of every feed on a branch, vanilla builds included */
export const feedsOf = (tree) =>
  tree.flatMap(({ path }) => {
    const codename = path.match(/^builds\/(?:vanilla\/)?([^/]+)\.json$/)?.[1];
    return codename ? [{ codename, path }] : [];
  });

/** Android from the feed's SDK level, else the branch it sits on */
export const androidOf = (build, branch) => {
  const sdk = Number(build.os_sdk_level);
  return sdk >= 34 ? sdk - 20 : parseInt(branch) || undefined;
};

/** The maker the feed names, or for "OnePlus/Realme" whichever one already has the phone */
export function brandOf(oem = '', codename) {
  const listed = brandsOf(codename);
  const named = oem.split('/').map((part) => part.trim()).filter(Boolean);
  if (named.length === 1) return named[0];
  if (named.length) return named.find((part) => listed.includes(brandKey(part)));
  return listed.length === 1 ? listed[0] : undefined;
}

/** Device and row from one feed, with no name when the feed only gives the codename */
export function parse(json, { branch, path }, codename, now = Date.now()) {
  const build = json.response?.[0];
  if (!build?.timestamp) return;
  const built = build.timestamp * 1000;
  const android = androidOf(build, branch);
  const patch = build.os_patch_level?.match(/^\d{4}-\d\d-\d\d$/)?.[0];
  const maintainer = build.maintainer?.trim();
  const row = {
    status: maintainer && now - built < 180 * DAY ? 'active' : 'discontinued',
    ...(android && { android }),
    ...(maintainer && { maintainer }),
    latest: {
      ...(build.version && { version: String(build.version) }),
      date: dateOf(build.timestamp),
      ...(patch && { patch }),
    },
    source: `https://github.com/${REPO}/blob/${branch}/${path}`,
  };
  const device = build.device?.trim() ?? '';
  const named = device && device.toLowerCase() !== codename.toLowerCase();
  return { oem: build.oem, name: named ? device : undefined, download: build.download, row };
}

export default async function lunaris({ previous }) {
  const branches = releaseBranches(await fetchJson(`${API}/branches?per_page=100`));
  const feeds = [];
  for (const branch of branches) {
    const { tree } = await fetchJson(`${API}/git/trees/${branch}?recursive=1`);
    feeds.push(...feedsOf(tree).map((feed) => ({ ...feed, branch })));
  }
  const devices = {};
  const unplaced = [];
  // Most zips are on SourceForge, which throttles parallel reads
  await mapLimit(feeds, 2, async (feed) => {
    const lower = feed.codename.toLowerCase();
    const url = `https://raw.githubusercontent.com/${REPO}/${feed.branch}/${feed.path}`;
    const json = await fetchJson(url).catch(() => undefined);
    const parsed = json && parse(json, feed, feed.codename);
    if (!parsed) {
      for (const [id, row] of Object.entries(rowsFor(previous, lower))) devices[id] ??= row;
      return;
    }
    const { row, download } = parsed;
    const brand = brandOf(parsed.oem, lower);
    const id = brand && `${brandKey(brand)}/${lower}`;
    const { name, aliases } = parsed.name && brand ? namesOf(parsed.name, brand) : {};
    if (!brand || !(name || known(id))) {
      unplaced.push(feed.codename);
      return;
    }
    // A phone we don't list only comes in with a live build
    if (row.status !== 'active' && !known(id)) return;
    const metadata =
      row.status === 'active' && download
        ? await fetchMetadata(download).catch(() => undefined)
        : undefined;
    const patch = patchOf(metadata);
    if (patch) row.latest.patch = patch;
    const type = typeOfName(name ?? '');
    const key = upsertDevice(brand, {
      name: name ?? lower,
      codenames: [lower],
      ...(aliases?.length && { aliases }),
      ...(type && { type }),
    });
    if (key) devices[key] = freshest(devices[key], row);
  });
  const note = unplaced.length && `no brand or name for ${[...new Set(unplaced)].join(', ')}`;
  return { devices, ...(note && { note }) };
}
