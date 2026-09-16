import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { parseArgs } from 'node:util';
import { Document, parse, visit } from 'yaml';
import { slugify } from '../../src/lib/slug.js';

export const DATA = process.env.DATA_DIR ?? new URL('../../data/', import.meta.url).pathname;
export const { values: args } = parseArgs({ options: { force: { type: 'boolean' } }, strict: false });
export const today = new Date().toISOString().slice(0, 10);

const brandAliases = { poco: 'xiaomi', redmi: 'xiaomi', mi: 'xiaomi', moto: 'motorola', 'f-x-tec': 'fxtec' };
export const brandKey = (vendor) => brandAliases[slugify(vendor)] ?? slugify(vendor);

export const withoutBrand = (text, brand) =>
  text.trim().replace(new RegExp(`^${brand.replace(/\W/g, '\\$&')}\\s+(?=\\w)`, 'i'), '');

const token = process.env.GITHUB_TOKEN;

export async function fetchText(url, tries = 5) {
  const headers = { 'user-agent': 'android-rom-compat importer' };
  if (token && url.startsWith('https://api.github.com/')) headers.authorization = `Bearer ${token}`;
  const response = await fetch(url, { headers });
  if (response.status === 429 && tries > 1) {
    await new Promise((resolve) => setTimeout(resolve, (Number(response.headers.get('retry-after')) || 10) * 1000));
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
if (existsSync(devicesDir)) {
  for (const path of readdirSync(devicesDir, { recursive: true }).filter((path) => path.endsWith('.yml'))) {
    const [brand, file] = path.split('/');
    const device = read(join(devicesDir, path));
    const entry = { brand, key: file.replace('.yml', ''), device };
    device.codenames.forEach((codename) => existing.set(codename, entry));
    [...device.codenames, ...(device.aliases ?? [])].forEach((name) => claimed.add(name.toLowerCase()));
    slugs.add(`${brand}/${device.slug ?? slugify(device.name)}`);
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

/**
 * Finds or creates a device, filling only fields that are missing or unknown.
 * Returns its primary codename, or null when another brand already owns the codename
 */
export function upsertDevice(brandName, device) {
  const brand = brandKey(brandName);
  const found = existing.get(device.codenames[0]);
  if (found && found.brand !== brand) {
    stats.skipped.push(`${device.codenames[0]} (${brandName} ${device.name}) clashes with ${found.brand}/${found.key}`);
    return null;
  }
  ensureBrand(brand, brandName);

  const unclaimed = (names) => names.filter((name) => !claimed.has(name.toLowerCase()));
  if (!found) {
    const aliases = [...new Set(unclaimed(device.aliases ?? []))];
    let slug = slugify(device.name);
    const clash = slugs.has(`${brand}/${slug}`);
    if (clash) slug = `${slug}-${slugify(device.codenames[0])}`;
    const entry = { brand, key: device.codenames[0], device: {
      name: device.name,
      ...(clash && { slug }),
      codenames: [device.codenames[0], ...unclaimed(device.codenames.slice(1))],
      ...(aliases.length && { aliases }),
      ...(device.released && { released: device.released }),
      ...(device.soc && { soc: device.soc }),
      bootloader: { unlock: 'unknown', relock: 'unknown', ...device.bootloader },
    } };
    [...entry.device.codenames, ...aliases].forEach((name) => claimed.add(name.toLowerCase()));
    entry.device.codenames.forEach((codename) => existing.set(codename, entry));
    slugs.add(`${brand}/${slug}`);
    save(join(devicesDir, brand, `${entry.key}.yml`), entry.device, 'device');
    stats.devices++;
    return entry.key;
  }

  const current = found.device;
  const before = JSON.stringify(current);
  for (const field of ['released', 'soc']) current[field] ??= device[field];
  const { unlock, relock, notes } = device.bootloader ?? {};
  if (current.bootloader.unlock === 'unknown' && unlock && unlock !== 'unknown') {
    Object.assign(current.bootloader, { unlock }, notes && { notes });
  }
  if (current.bootloader.relock === 'unknown' && relock) current.bootloader.relock = relock;
  const aliases = unclaimed(device.aliases ?? []);
  if (aliases.length) {
    current.aliases = [...(current.aliases ?? []), ...new Set(aliases)];
    aliases.forEach((alias) => claimed.add(alias.toLowerCase()));
  }
  if (JSON.stringify(current) !== before) save(join(devicesDir, found.brand, `${found.key}.yml`), current, 'device');
  return found.key;
}

export function writeSupport(codename, rom, support) {
  const file = join(DATA, 'support', codename, `${rom}.yml`);
  if (existsSync(file) && !args.force) return void stats.kept++;
  const { status, android, maintainer, source, install, features } = support;
  save(file, { official: true, status, android, maintainer, verified: today, source, install, features }, 'support');
  stats.support++;
}

export function report(rom) {
  console.log(`${rom}: ${stats.devices} new devices, ${stats.support} support files, ${stats.kept} kept as they were`);
  for (const line of stats.skipped) console.log(`  skipped ${line}`);
}
