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

const XIAOMI = 'https://trust.mi.com/bff/psti/phone/online';
const XIAOMI_PAGE = 'https://trust.mi.com/misrc/updates/detail?tab=phone';
const ONEPLUS = 'https://www.oneplus.com/uk/psti';
const LG_NOTICE =
  'https://www.lg.com/us/support/announcements-detail/notice-on-termination-of-services-of-lg-electronics-mobile-phone-software-upgrade-update-center-and-lg-bridge-USNTC20250410200140';

/** Motorola's page drops a phone once support ends, so older phones come from archived copies */
const MOTOROLA_LIVE = 'https://en-us.support.motorola.com/app/software-security-update';
const MOTOROLA_OLD =
  'https://motorola-global-portal.custhelp.com/app/software-security-page/g_id/6806';
export const motorolaPages = [
  MOTOROLA_LIVE,
  `https://web.archive.org/web/20230814082825/${MOTOROLA_LIVE}`,
  `https://web.archive.org/web/20220413155903/${MOTOROLA_OLD}`,
  `https://web.archive.org/web/20210607224525/${MOTOROLA_OLD}`,
  `https://web.archive.org/web/20210311195314/${MOTOROLA_OLD}`,
];

const brandPrefix = /^(the\s+)?(google|samsung|fairphone|oneplus|sony|motorola|nokia|xiaomi)\s+/;
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

/** A release from Xiaomi's own list, which only says when security updates stop */
export const xiaomiRelease = ({ productName, eolTime }) => ({
  brand: 'xiaomi',
  label: productName.trim(),
  row: { security_until: eolTime.slice(0, 10), source: XIAOMI_PAGE },
});

async function xiaomiReleases() {
  const phones = [];
  for (let page = 1; ; page++) {
    const body = JSON.stringify({ page, pageSize: 100 });
    const headers = { 'content-type': 'application/json' };
    const { data = [], count } = await fetchJson(XIAOMI, { headers, body });
    phones.push(...data);
    if (!data.length || phones.length >= count) return phones.map(xiaomiRelease);
  }
}

/** OnePlus's UK security update page keeps its table as a JS literal, phones under status 1 */
export function onePlusReleases(html) {
  const rows = html.matchAll(
    /status:\s*'(\d)',\s*name:\s*'([^']+)',\s*date:\s*'(\d{4})\/(\d+)\/(\d+)'/g,
  );
  return [...rows]
    .filter(([, status]) => status === '1')
    .map(([, , label, year, month, day]) => ({
      brand: 'oneplus',
      label,
      row: {
        security_until: `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`,
        source: ONEPLUS,
      },
    }));
}

/** The JSON object starting at a given index, found by counting braces outside strings */
export function jsonAt(text, start) {
  let depth = 0;
  let quoted = false;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '\\') i++;
      else if (char === '"') quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === '{') depth++;
    else if (char === '}' && --depth === 0) return JSON.parse(text.slice(start, i + 1));
  }
}

const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** "August", 2022 becomes 2022-08-01 */
const monthOf = (name, year) => {
  const index = months.indexOf(name.slice(0, 3).toLowerCase());
  return index >= 0 ? `${year}-${String(index + 1).padStart(2, '0')}-01` : undefined;
};

/** Every phone in a Motorola security page's guide that says when its updates stop */
export function motorolaReleases(html, source) {
  const start = html.indexOf('{"guideID":');
  const guide = start >= 0 && jsonAt(html, start);
  return (guide?.questions ?? []).flatMap(({ taglessText = '' }) => {
    const [, month, year] = taglessText.match(/Security updates will stop on (\w+), (\d{4})/) ?? [];
    const until = month && monthOf(month, year);
    if (!until) return [];
    const label = taglessText.trim().split('\n')[0].replace(/\*$/, '').trim();
    const first = taglessText.match(/Launched On: Android ([\d.]+)/i)?.[1];
    const last = taglessText.match(/Upgraded? To: Android ([\d.]+)/i)?.[1];
    const android = first && last && (first === last ? first : `${first} - ${last}`);
    const row = { ...(android && { android }), security_until: until, source };
    return [{ brand: 'motorola', label, row }];
  });
}

/** LG shut its phone update service down for every model on 30 June 2025 */
export const lgRows = (devices) =>
  Object.fromEntries(
    devices
      .filter(({ brand }) => brand === 'lg')
      .map(({ id }) => [
        id,
        { updates_until: 'ended', security_until: 'ended', source: LG_NOTICE },
      ]),
  );

/** When support ends, with ended sorting first and no date at all last */
const cutoff = ({ row }) => {
  const until = row.security_until ?? row.updates_until ?? '9';
  return until === 'ended' ? '0' : until;
};
const earliest = (a, b) => (cutoff(b) < cutoff(a) ? b : a);

/**
 * Joins stock rows onto our devices by brand and name, exact names before yearless ones, and a
 * device's own name before its aliases. Aliases that hit several phones give the earliest cut-off,
 * since the page covers all of them. When two releases squash to the same key the plainer label
 * wins, so "Galaxy S6" beats "Galaxy S6 (USA)"
 */
export function join(devices, releases) {
  const index = {};
  for (const release of releases) {
    const byName = (index[release.brand] ??= {});
    const { full } = nameKeys(release.label);
    if (!byName[full] || release.label.length < byName[full].label.length) byName[full] = release;
  }
  const rows = {};
  for (const { brand, id, data } of devices) {
    const [own, ...aliases] = [data.name, ...(data.aliases ?? [])].map(String).map(nameKeys);
    const tiers = [
      [own.full],
      aliases.map(({ full }) => full),
      [own.yearless],
      aliases.map(({ yearless }) => yearless),
    ];
    const hits = tiers
      .map((names) => names.map((name) => index[brand]?.[name]).filter(Boolean))
      .find((found) => found.length);
    if (hits) rows[id] = hits.reduce(earliest).row;
  }
  return rows;
}

/** Pixels endoflife.date doesn't list get CalyxOS's manufacturer support date instead */
export function fromCalyxos(devices, rows, ends) {
  const source = 'https://calyxos.org/docs/guide/device-support/';
  const extra = {};
  for (const { brand, id, data } of devices) {
    if (brand !== 'google' || rows[id]) continue;
    const end = data.codenames.map((codename) => ends[codename]).find(Boolean);
    if (end) extra[id] = { security_until: end, source };
  }
  return extra;
}

export default async function stock() {
  const brands = new Set([...Object.values(products), 'xiaomi', 'lg']);
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
  const xiaomi = await xiaomiReleases().catch(() => {
    failed.push('xiaomi');
    return [];
  });
  releases.push(...xiaomi);
  const onePlus = await fetchText(ONEPLUS)
    .then(onePlusReleases)
    .catch(() => []);
  if (!onePlus.length) failed.push('oneplus.com');
  releases.push(...onePlus);
  for (const page of motorolaPages) {
    const found = await fetchText(page.replace(/(\/web\/\d+)\//, '$1id_/'))
      .then((html) => motorolaReleases(html, page))
      .catch(() => []);
    if (!found.length) failed.push(page.includes('archive.org') ? `${page} (archived)` : page);
    releases.push(...found);
  }

  const rows = { ...join(devices, releases), ...lgRows(devices) };
  const ends = await fetchText(`${CALYXOS}/devices.yml`).then(supportEnds).catch(() => ({}));
  const extra = fromCalyxos(devices, rows, ends);
  const notes = [
    `matched ${Object.keys(rows).length} of ${devices.length} devices`,
    ...(Object.keys(extra).length ? [`${Object.keys(extra).length} more from CalyxOS`] : []),
    ...(failed.length ? [`couldn't read ${failed.join(', ')}`] : []),
  ];
  return { devices: { ...rows, ...extra }, note: notes.join(', ') };
}
