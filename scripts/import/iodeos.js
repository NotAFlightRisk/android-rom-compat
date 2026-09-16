import { fetchText, report, upsertDevice, writeSupport, withoutBrand } from './lib.js';

const source = 'https://iode.tech/iodeos-official-supported-devices/';
const html = await fetchText(source);
const table = html.match(/<table id="tablepress-1"[\s\S]*?<tbody[^>]*>([\s\S]*?)<\/tbody>/)[1];

const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (text) =>
  text
    .replace(/&#(x?)([0-9a-f]+);/gi, (_, hex, code) =>
      String.fromCodePoint(parseInt(code, hex ? 16 : 10)),
    )
    .replace(/&(\w+);/g, (entity, name) => entities[name] ?? entity);
const cellsOf = (row) =>
  [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(([, cell]) =>
    decode(cell.replace(/<br\s*\/?>/g, ';').replace(/<[^>]+>/g, '')).trim(),
  );
for (const [, row] of table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
  const [brand, model, variants, version, , locked, calls] = cellsOf(row);
  const [, fullName, codename] = model.match(/^(.*?)\s*\(([^()]+)\)$/) ?? [];
  if (!codename || brand.startsWith('GSI')) continue;

  const key = upsertDevice(brand, {
    name: withoutBrand(fullName, brand).replace(/\s+/g, ' '),
    codenames: [codename.toLowerCase()],
    aliases: variants
      .split(/[;,\n]/)
      .map((variant) => variant.trim())
      .filter(Boolean),
    ...(locked === 'yes' && { bootloader: { relock: 'yes' } }),
  });
  if (!key) continue;

  writeSupport(key, 'iodeos', {
    status: 'active',
    android: Number(version.match(/Android (\d+)/)?.[1]) || undefined,
    source,
    install: 'https://iode.tech/installation/',
    ...(calls === 'yes' && { features: { volte: 'working', vowifi: 'working' } }),
  });
}

report('iodeos');
