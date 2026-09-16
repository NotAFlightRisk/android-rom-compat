import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { parseArgs } from 'node:util';
import { Document, parse, visit } from 'yaml';
import { slugify } from '../../src/lib/text.js';

export const DATA = process.env.DATA_DIR ?? new URL('../../data/', import.meta.url).pathname;
export const { values: args } = parseArgs({
  options: { force: { type: 'boolean' } },
  strict: false,
});
export const today = new Date().toISOString().slice(0, 10);

const brandAliases = {
  poco: 'xiaomi',
  redmi: 'xiaomi',
  mi: 'xiaomi',
  moto: 'motorola',
  'f-x-tec': 'fxtec',
};
export const brandKey = (vendor) => brandAliases[slugify(vendor)] ?? slugify(vendor);

export const withoutBrand = (text, brand) =>
  text.trim().replace(new RegExp(`^${brand.replace(/\W/g, '\\$&')}\\s+(?=\\w)`, 'i'), '');

const token = process.env.GITHUB_TOKEN;

export async function fetchText(url, tries = 5) {
  const headers = { 'user-agent': 'android-rom-compat importer' };
  if (token && url.startsWith('https://api.github.com/')) headers.authorization = `Bearer ${token}`;
  const response = await fetch(url, { headers });
  if (response.status === 429 && tries > 1) {
    await new Promise((resolve) =>
      setTimeout(resolve, (Number(response.headers.get('retry-after')) || 10) * 1000),
    );
    return fetchText(url, tries - 1);
  }
  if (!response.ok) throw new Error(`${response.status} from ${url}`);
  return response.text();
}

export const fetchJson = async (url) => JSON.parse(await fetchText(url));

/** Runs an async function over items, a few at a time, so nobody's server gets hammered */
export async function mapLimit(items, limit, run) {
  const results = [];
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await run(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

const read = (file) => parse(readFileSync(file, 'utf8'));

function save(file, value, schema) {
  const doc = new Document(value);
  visit(doc, { Seq: (_, node) => void (node.flow = true) });
  const depth = relative(DATA, file).split('/').length;
  const hint = `# yaml-language-server: $schema=${'../'.repeat(depth)}schema/${schema}.json\n`;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, hint + doc.toString({ lineWidth: 0, flowCollectionPadding: false }));
}

const devicesDir = join(DATA, 'devices');
const existing = new Map();
const slugs = new Set();
const claimed = new Set();
const claim = (names) => names.forEach((name) => claimed.add(name.toLowerCase()));
const unclaimed = (names = []) => [...new Set(names)].filter((name) => !claimed.has(name.toLowerCase()));

function track(entry) {
  entry.device.codenames.forEach((codename) => existing.set(codename, entry));
  claim([...entry.device.codenames, ...(entry.device.aliases ?? [])]);
  slugs.add(`${entry.brand}/${entry.device.slug ?? slugify(entry.device.name)}`);
}

if (existsSync(devicesDir)) {
  const files = readdirSync(devicesDir, { recursive: true }).filter((path) => path.endsWith('.yml'));
  for (const path of files) {
    const [brand, file] = path.split('/');
    track({ brand, key: file.replace('.yml', ''), device: read(join(devicesDir, path)) });
  }
}

export const stats = { devices: 0, support: 0, kept: 0, skipped: [] };

export function ensureBrand(key, name) {
  const file = join(DATA, 'brands.yml');
  const brands = existsSync(file) ? (read(file) ?? []) : [];
  if (brands.some((brand) => brand.key === key)) return;
  brands.push({ key, name });
  brands.sort((a, b) => a.key.localeCompare(b.key));
  save(file, brands, 'brands');
}

function createDevice(brand, { name, codenames, aliases, released, soc, bootloader }) {
  const slug = slugify(name);
  const clash = slugs.has(`${brand}/${slug}`);
  const newAliases = unclaimed(aliases);
  const entry = {
    brand,
    key: codenames[0],
    device: {
      name,
      ...(clash && { slug: `${slug}-${slugify(codenames[0])}` }),
      codenames: [codenames[0], ...unclaimed(codenames.slice(1))],
      ...(newAliases.length && { aliases: newAliases }),
      ...(released && { released }),
      ...(soc && { soc }),
      bootloader: { unlock: 'unknown', relock: 'unknown', ...bootloader },
    },
  };
  track(entry);
  stats.devices++;
  return entry;
}

function fillGaps(current, { released, soc, aliases, bootloader = {} }) {
  current.released ??= released;
  current.soc ??= soc;
  const { unlock, relock, notes } = bootloader;
  if (current.bootloader.unlock === 'unknown' && unlock && unlock !== 'unknown') {
    Object.assign(current.bootloader, { unlock }, notes && { notes });
  }
  if (current.bootloader.relock === 'unknown' && relock) current.bootloader.relock = relock;
  const newAliases = unclaimed(aliases);
  if (newAliases.length) current.aliases = [...(current.aliases ?? []), ...newAliases];
  claim(newAliases);
}

/**
 * Finds or creates a device, only ever filling fields that are missing or unknown.
 * Returns its primary codename, or null when another brand already owns the codename
 */
export function upsertDevice(brandName, device) {
  const brand = brandKey(brandName);
  const found = existing.get(device.codenames[0]);
  if (found && found.brand !== brand) {
    const who = `${brandName} ${device.name}`;
    stats.skipped.push(`${device.codenames[0]} (${who}) clashes with ${found.brand}/${found.key}`);
    return null;
  }
  ensureBrand(brand, brandName);

  const entry = found ?? createDevice(brand, device);
  const before = found && JSON.stringify(entry.device);
  if (found) fillGaps(entry.device, device);
  if (!found || JSON.stringify(entry.device) !== before) {
    save(join(devicesDir, brand, `${entry.key}.yml`), entry.device, 'device');
  }
  return entry.key;
}

export function writeSupport(codename, rom, support) {
  const file = join(DATA, 'support', codename, `${rom}.yml`);
  if (existsSync(file) && !args.force) return void stats.kept++;
  const { status, android, maintainer, source, install, features } = support;
  save(
    file,
    { official: true, status, android, maintainer, verified: today, source, install, features },
    'support',
  );
  stats.support++;
}

export function report(rom) {
  const { devices, support, kept } = stats;
  console.log(`${rom}: ${devices} new devices, ${support} support files, ${kept} kept as they were`);
  for (const line of stats.skipped) console.log(`  skipped ${line}`);
}
