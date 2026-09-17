import { BROWSER_UA, fetchText } from '../fetch.js';
import { upsertDevice, withoutBrand } from '../store.js';

const SOURCE = 'https://iode.tech/iodeos-official-supported-devices/';
const INSTALL = 'https://iode.tech/installation/';

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
    const features = {
      ...callFeatures(cell('calls').toLowerCase(), fullName),
      ...(cell('fiveG').toLowerCase() === 'yes' && { '5g': 'working' }),
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
      },
    ];
  });
}

export default async function iodeos() {
  const html = await fetchText(SOURCE, { headers: { 'user-agent': BROWSER_UA } });
  const devices = {};
  for (const { brand, device, row } of parseTable(html)) {
    const key = upsertDevice(brand, device);
    if (key) devices[key] = row;
  }
  return { devices };
}
