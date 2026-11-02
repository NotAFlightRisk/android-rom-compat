import { fetchJson, fetchMetadata, mapLimit, patchOf } from '../fetch.js';
import { brandKey, brandsOf, known, rowsFor, upsertDevice, withoutBrand } from '../store.js';
import { freshest } from './crdroid.js';
import { isoDate } from '../../../src/lib/dates.js';

const REPO = 'AlphaDroid-devices/OTA';
const API = `https://api.github.com/repos/${REPO}`;
const RAW = `https://raw.githubusercontent.com/${REPO}/main`;
// The names and makers alphadroid.org shows in place of its feed's
const SITE_DB =
  'https://raw.githubusercontent.com/AlphaDroid-Project/alphadroid-project.github.io/main/data/device_db.json';
const DAY = 24 * 60 * 60 * 1000;

/** Android version from a zip named like AlphaDroid-16-20260901-gapps-aston-v4.7.zip */
export const androidOf = (filename = '') =>
  Number(filename.match(/^AlphaDroid-(\d+)(?:\.\d+)?-\d{8}/)?.[1]) || undefined;

/** The maker a build fingerprint opens with, as in POCO/onyx_global/onyx:16/... */
export const fingerprintBrand = (metadata) => metadata?.['post-build']?.split('/')[0] || undefined;

/** The site's name for a phone, else the feed's minus its "(codename)", unless that's all it is */
export function nameOf(build, site, codename) {
  const [first] = (site?.model ?? build.device ?? '').split(/\s+\/\s+/);
  const name = first.replace(/\s*\([^)]*\)$/, '').trim();
  return name && name.toLowerCase() !== codename.toLowerCase() ? name : undefined;
}

/** Device and row from one <codename>.json, with the brand left out when the feed has none */
export function parse(json, site, codename, now = Date.now()) {
  const build = json.response?.[0];
  if (!build) return;
  const built = build.timestamp * 1000;
  const android = androidOf(build.filename);
  const row = {
    status: build.maintainer && now - built < 180 * DAY ? 'active' : 'discontinued',
    ...(android && { android }),
    ...(build.maintainer && { maintainer: build.maintainer }),
    latest: { ...(build.version && { version: String(build.version) }), date: isoDate(built) },
    source: `https://alphadroid.org/#devices?codename=${codename}`,
  };
  const brand = build.oem || site?.oem || undefined;
  return { brand, name: nameOf(build, site, codename), download: build.download, row };
}

export default async function alphadroid({ previous }) {
  const { tree } = await fetchJson(`${API}/git/trees/main`);
  const { overrides = {} } = await fetchJson(SITE_DB).catch(() => ({}));
  // The site hides a codename that's a second file for another one
  const codenames = tree
    .map(({ path }) => path.match(/^([^/]+)\.json$/)?.[1])
    .filter((codename) => codename && !overrides[codename.toLowerCase()]?.hide);

  const devices = {};
  const failed = [];
  const unplaced = [];
  await mapLimit(codenames, 5, async (codename) => {
    const lower = codename.toLowerCase();
    const json = await fetchJson(`${RAW}/${codename}.json`).catch(() => void failed.push(codename));
    const parsed = json && parse(json, overrides[lower], codename);
    if (!parsed) {
      Object.assign(devices, rowsFor(previous, lower));
      return;
    }
    const { row, download } = parsed;
    const metadata =
      row.status === 'active' ? await fetchMetadata(download).catch(() => undefined) : undefined;
    const patch = patchOf(metadata);
    if (patch) row.latest.patch = patch;
    const listed = brandsOf(lower);
    const brand =
      parsed.brand ?? fingerprintBrand(metadata) ?? (listed.length === 1 ? listed[0] : undefined);
    const name = brand && parsed.name && withoutBrand(parsed.name, brand);
    if (!brand || !(name || known(`${brandKey(brand)}/${lower}`))) {
      unplaced.push(codename);
      return;
    }
    const key = upsertDevice(brand, { name: name ?? lower, codenames: [lower] });
    if (key) devices[key] = freshest(devices[key], row);
  });
  const notes = [
    failed.length && `couldn't read ${failed.join(', ')}`,
    unplaced.length && `no brand or name for ${unplaced.join(', ')}`,
  ].filter(Boolean);
  return { devices, ...(notes.length && { note: notes.join('; ') }) };
}
