import { loadData } from '../../../src/lib/data/load.js';
import { fetchJson, fetchText } from '../fetch.js';
import { DATA } from '../store.js';
import { DATA as CALYXOS, supportEnds } from './calyxos.js';

/** endoflife.date product -> our brand key */
export const products = {
  pixel: 'google',
  'google-nexus': 'google',
  'samsung-mobile': 'samsung',
  'samsung-galaxy-tab': 'samsung',
  fairphone: 'fairphone',
  oneplus: 'oneplus',
  'sony-xperia': 'sony',
  'motorola-mobility': 'motorola',
  nokia: 'nokia',
};

const brandPrefix = /^(the\s+)?(google|samsung|fairphone|oneplus|sony|motorola|nokia)\s+/;
const YEAR = /\b(19|20)\d\d\b/g;

const squash = (text) => text.replace(/\+/g, ' plus ').replace(/[^a-z0-9]+/g, '');

/** Match keys for a name, with and without its year: "Galaxy A9+ (2018)" -> galaxya9plus2018 */
export function nameKeys(name) {
  const plain = name
    .toLowerCase()
    .replace(brandPrefix, '')
    .replace(/\((?:gen\.?\s*)?(\d+g?)\)/g, ' $1 ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(4g|lte|wi-?fi)\b/g, ' ');
  return { full: squash(plain), yearless: squash(plain.replace(YEAR, ' ')) };
}

const until = (ended, date) =>
  /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : ended ? 'ended' : undefined;

/** "14 > 15 > 16" and "11 - 15" both become "first - last" */
const androidRange = (versions) => {
  const parts = String(versions ?? '').split(/\s*[>-]\s*/).filter(Boolean);
  return parts.length > 1 ? `${parts[0]} - ${parts.at(-1)}` : parts[0];
};

/** A stock row from one endoflife.date release, or undefined when it says nothing useful */
export function stockRow(release, source) {
  const { supportedAndroidVersions, androidVersions } = release.custom ?? {};
  const android = androidRange(supportedAndroidVersions ?? androidVersions);
  const updates = until(release.isEoas, release.eoasFrom);
  const security = until(release.isEol, release.eolFrom);
  if (!android && !updates && !security) return;
  return {
    ...(android && { android }),
    ...(updates && { updates_until: updates }),
    ...(security && { security_until: security }),
    source,
  };
}

/**
 * Joins stock rows onto our devices by brand and name, exact names before yearless ones. When two
 * releases squash to the same key the plainer label wins, so "Galaxy S6" beats "Galaxy S6 (USA)"
 */
export function join(devices, releases) {
  const index = {};
  for (const release of releases) {
    const byName = (index[release.brand] ??= {});
    const { full } = nameKeys(release.label);
    if (!byName[full] || release.label.length < byName[full].label.length) byName[full] = release;
  }
  const rows = {};
  for (const { brand, key, data } of devices) {
    const keys = [data.name, ...(data.aliases ?? [])].map(String).map(nameKeys);
    const names = [...keys.map(({ full }) => full), ...keys.map(({ yearless }) => yearless)];
    const release = names.map((name) => index[brand]?.[name]).find(Boolean);
    if (release) rows[key] = release.row;
  }
  return rows;
}

/** Pixels endoflife.date doesn't list get CalyxOS's manufacturer support date instead */
export function fromCalyxos(devices, rows, ends) {
  const source = 'https://calyxos.org/docs/guide/device-support/';
  const extra = {};
  for (const { brand, key, data } of devices) {
    if (brand !== 'google' || rows[key]) continue;
    const end = data.codenames.map((codename) => ends[codename]).find(Boolean);
    if (end) extra[key] = { security_until: end, source };
  }
  return extra;
}

export default async function stock() {
  const brands = new Set(Object.values(products));
  const devices = loadData(DATA).devices.filter(({ brand }) => brands.has(brand));

  const releases = [];
  const failed = [];
  for (const [product, brand] of Object.entries(products)) {
    const json = await fetchJson(`https://endoflife.date/api/v1/products/${product}`).catch(
      () => void failed.push(product),
    );
    for (const release of json?.result.releases ?? []) {
      const row = stockRow(release, json.result.links.html);
      if (row) releases.push({ brand, label: release.label, row });
    }
  }
  if (failed.length === Object.keys(products).length) throw new Error('endoflife.date is down');

  const rows = join(devices, releases);
  const ends = await fetchText(`${CALYXOS}/devices.yml`).then(supportEnds).catch(() => ({}));
  const extra = fromCalyxos(devices, rows, ends);
  const notes = [
    `matched ${Object.keys(rows).length} of ${devices.length} devices`,
    ...(Object.keys(extra).length ? [`${Object.keys(extra).length} more from CalyxOS`] : []),
    ...(failed.length ? [`couldn't read ${failed.join(', ')}`] : []),
  ];
  return { devices: { ...rows, ...extra }, note: notes.join(', ') };
}
