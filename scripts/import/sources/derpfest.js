import { fetchJson, fetchPatchLevel, mapLimit } from '../fetch.js';
import { brandKey, brandsOf, known, upsertDevice } from '../store.js';
import { freshest } from './crdroid.js';
import { dateOf, namesOf, typeOfName } from './evolutionx.js';
import { vendorOf } from './infinityx.js';

// The list derpfest.org builds from its OTA repos, names and maintainers included
const INDEX =
  'https://raw.githubusercontent.com/DerpFest-AOSP/DerpSite/master/public/devices-index.json';
const DAY = 24 * 60 * 60 * 1000;

/** Android version from "v16.2" or "13", or else the zip's name */
export const androidOf = ({ version = '', filename = '' }) =>
  parseInt(String(version).replace(/^v/i, '')) ||
  Number(filename.match(/^DerpFest-v?(\d+)/i)?.[1]) ||
  undefined;

/** Where on GitHub a device's feed lives, from the repo the index read it out of */
export function feedOf({ sources = [] }, repos) {
  const [{ repoFolder, filePath } = {}] = sources;
  const repo = repos.find(({ folder }) => folder === repoFolder);
  const path = filePath?.slice(`${repoFolder}/`.length);
  return (
    repo && path && `https://github.com/${repo.owner}/${repo.repo}/blob/${repo.branch}/${path}`
  );
}

/** Brand, device and row from one index entry, or undefined for GSIs and entries with no build */
export function parse(entry, repos, now = Date.now()) {
  const { codename, displayName = '', maintainer, latest } = entry;
  const source = feedOf(entry, repos);
  if (!latest?.datetime || !/\.zip$/i.test(latest.filename ?? '') || !source) return;
  const built = latest.datetime * 1000;
  const android = androidOf(latest);
  const row = {
    status: now - built < 180 * DAY ? 'active' : 'discontinued',
    channel: /-beta\b/i.test(latest.filename) ? 'beta' : 'stable',
    ...(android && { android }),
    ...(maintainer && maintainer !== 'Unknown' && { maintainer }),
    latest: { date: dateOf(latest.datetime) },
    source,
  };
  const named =
    displayName && !['unknown', codename.toLowerCase()].includes(displayName.toLowerCase());
  const vendor = named ? vendorOf(displayName) : undefined;
  const name = named ? namesOf(displayName, vendor).name : undefined;
  const type = typeOfName(displayName);
  return { vendor, name, type, zip: latest.url, row };
}

export default async function derpfest() {
  const { devices: entries, detected_repos: repos = [] } = await fetchJson(INDEX);
  const devices = {};
  const unplaced = [];
  await mapLimit(entries, 5, async (entry) => {
    const parsed = parse(entry, repos);
    if (!parsed) return;
    const lower = entry.codename.toLowerCase();
    const listed = brandsOf(lower);
    const vendor = parsed.vendor ?? (listed.length === 1 ? listed[0] : undefined);
    if (!vendor) {
      unplaced.push(entry.codename);
      return;
    }
    const { row, zip } = parsed;
    // A phone we don't list only comes in with a live build, not a years-old one
    if (row.status !== 'active' && !known(`${brandKey(vendor)}/${lower}`)) return;
    const patch = row.status === 'active' && (await fetchPatchLevel(zip).catch(() => undefined));
    if (patch) row.latest.patch = patch;
    const device = {
      name: parsed.name ?? lower,
      codenames: [lower],
      ...(parsed.type && { type: parsed.type }),
    };
    const key = upsertDevice(vendor, device);
    if (key) devices[key] = freshest(devices[key], row);
  });
  return {
    devices,
    ...(unplaced.length && { note: `no brand or name for ${unplaced.join(', ')}` }),
  };
}
