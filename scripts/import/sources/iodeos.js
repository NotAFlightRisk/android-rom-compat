import { BROWSER_UA, fetchText, mapLimit } from '../fetch.js';
import { upsertDevice, withoutBrand } from '../store.js';

const SOURCE = 'https://iode.tech/iodeos-official-supported-devices/';
const INSTALL = 'https://iode.tech/installation/';
const OTA = 'https://ota.iode.tech';

const columns = {
  brand: /^brand$/i,
  model: /^model$/i,
  variants: /^variants$/i,
  version: /version/i,
  locked: /bootloader/i,
  calls: /volte/i,
  fiveG: /^5g/i,
};

const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (text) =>
  text
    .replace(/&#(x?)([0-9a-f]+);/gi, (_, hex, code) =>
      String.fromCodePoint(parseInt(code, hex ? 16 : 10)),
    )
    .replace(/&(\w+);/g, (entity, name) => entities[name] ?? entity);

const cellsOf = (row, tag) =>
  [...row.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'g'))].map(([, cell]) =>
    decode(cell.replace(/<br\s*\/?>/g, ';').replace(/<[^>]+>/g, '')).trim(),
  );

const rowsOf = (html) => [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map(([, row]) => row);

/** The table's columns by header name, so a reshuffle on their end doesn't scramble ours */
function headerOf(table) {
  const head = cellsOf(rowsOf(table.match(/<thead[\s\S]*?<\/thead>/)[0])[0], 'th');
  return Object.fromEntries(
    Object.entries(columns).map(([key, pattern]) => {
      const index = head.findIndex((name) => pattern.test(name));
      if (index < 0) throw new Error(`no ${key} column in the iodéOS table (${head.join(', ')})`);
      return [key, index];
    }),
  );
}

function callFeatures(answer, name) {
  if (answer === 'yes') return { volte: 'working', vowifi: 'working' };
  if (answer !== 'no' || /\bwi-?fi\b/i.test(name)) return {};
  const note = 'iodéOS lists VoLTE and VoWiFi as not working here';
  const broken = () => ({ status: 'broken', note });
  return { volte: broken(), vowifi: broken() };
}

/** A no on a phone without 5G is missing hardware, so only one with 5G in its name gets broken */
function fiveGFeatures(answer, name) {
  if (answer === 'yes') return { '5g': 'working' };
  if (answer !== 'no' || !/\b5G\b/i.test(name)) return {};
  return { '5g': { status: 'broken', note: 'iodéOS lists 5G as not working here' } };
}

/** One entry per device row in iodéOS's TablePress table, GSIs left out */
export function parseTable(html) {
  const table = html.match(/<table id="tablepress-1"[\s\S]*?<\/table>/)[0];
  const at = headerOf(table);
  const body = table.match(/<tbody[\s\S]*?<\/tbody>/)[0];

  return rowsOf(body).flatMap((tr) => {
    const cells = cellsOf(tr, 'td');
    const cell = (key) => cells[at[key]] ?? '';
    const brand = cell('brand');
    const [, fullName, codename] = cell('model').match(/^(.*?)\s*\(([^()]+)\)$/) ?? [];
    if (!codename || brand.startsWith('GSI')) return [];

    const name = withoutBrand(fullName, brand).replace(/\s+/g, ' ');
    const locked = cell('locked').toLowerCase();
    const android = Number(cell('version').match(/Android (\d+)/)?.[1]);
    const major = cell('version').match(/^\d+/)?.[0];
    const features = {
      ...callFeatures(cell('calls').toLowerCase(), fullName),
      ...fiveGFeatures(cell('fiveG').toLowerCase(), fullName),
    };

    return [
      {
        brand,
        device: {
          name,
          codenames: [codename.toLowerCase()],
          aliases: cell('variants')
            .split(/[;,\n]/)
            .map((variant) => variant.trim())
            .filter(Boolean),
        },
        row: {
          status: 'active',
          ...(android && { android }),
          ...(['yes', 'no'].includes(locked) && { relock: locked }),
          source: SOURCE,
          install: INSTALL,
          ...(Object.keys(features).length && { features }),
        },
        ...(major && { feed: { codename, major } }),
      },
    ];
  });
}

const buildFile = /^iode-([\d.]+)-(\d{4})(\d\d)(\d\d)-/;

/** The newest build in an OTA feed, which comes in LineageOS's old shape or its newer one */
export function latestBuild(text) {
  // the newer feeds leave out the comma after "files"
  const feed = JSON.parse(text.replace(/\]\s*"/g, '], "'));
  const [build] = (feed.response ?? feed).toSorted((a, b) => b.datetime - a.datetime);
  const file = build?.files?.[0] ?? build;
  const [, version, year, month, day] = file?.filename?.match(buildFile) ?? [];
  if (!version) return undefined;
  const patch = file.os_patch_level;
  return { version, date: `${year}-${month}-${day}`, ...(patch && { patch }) };
}

/** Release channel URLs, with the codename as the table spells it and then in lowercase */
export const feedUrls = ({ codename, major }) =>
  [...new Set([codename, codename.toLowerCase()])].map(
    (name) => `${OTA}/v${major}-release/${name}.json`,
  );

async function fetchBuild(feed) {
  for (const url of feedUrls(feed)) {
    try {
      return latestBuild(await fetchText(url));
    } catch (error) {
      if (error.status !== 404) throw error;
    }
  }
}

const majorOf = (build) => build?.version.split('.')[0];

/** The newest build, from the next version's feed when the old one offers an upgrade */
async function fetchLatest(feed) {
  const build = await fetchBuild(feed);
  const major = majorOf(build);
  return major && major !== feed.major ? ((await fetchBuild({ ...feed, major })) ?? build) : build;
}

export default async function iodeos({ previous }) {
  const html = await fetchText(SOURCE, { headers: { 'user-agent': BROWSER_UA } });
  const entries = parseTable(html);
  const androidOf = Object.fromEntries(entries.map(({ row, feed }) => [feed?.major, row.android]));
  const found = entries.flatMap(({ brand, device, row, feed }) => {
    const key = upsertDevice(brand, device);
    return key ? [{ key, row, feed }] : [];
  });

  const failures = [];
  const devices = {};
  await mapLimit(found, 6, async ({ key, row, feed }) => {
    let latest = previous[key]?.latest;
    try {
      latest = feed && (await fetchLatest(feed));
    } catch (error) {
      failures.push(error.message);
    }
    const { source, install, features, ...head } = row;
    const android = androidOf[majorOf(latest)];
    devices[key] = {
      ...head,
      ...(android && { android }),
      ...(latest && { latest }),
      source,
      install,
      ...(features && { features }),
    };
  });

  const note = failures.length && `OTA feed failed ${failures.length} times (${failures[0]})`;
  return { devices, ...(note && { note }) };
}
