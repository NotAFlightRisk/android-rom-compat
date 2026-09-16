import { loadData } from './load.js';
import { cellValue, toneOf } from './status.js';
import { slugify } from '../slug.js';

const STALE_AFTER_DAYS = 365;
const byName = (key) => (a, b) => a[key].localeCompare(b[key], 'en', { sensitivity: 'base' });

function resolveCell(feature, raw, device) {
  if (raw === undefined) {
    const lacksIt = feature.requires && device.hardware && !device.hardware.includes(feature.requires);
    const value = lacksIt ? 'n/a' : 'unknown';
    return { value, tone: value };
  }
  const { value, note } = cellValue(raw);
  return { value, note, tone: toneOf(feature, value) };
}

/** Joins the raw files into brands, ROMs and devices that point at each other */
export function buildModel(data = loadData(), now = new Date()) {
  const staleBefore = new Date(now - STALE_AFTER_DAYS * 864e5).toISOString().slice(0, 10);
  const features = data.features.data;
  const brands = new Map(
    data.brands.data.map((brand) => [brand.key, { ...brand, url: `/devices/${brand.key}/`, devices: [] }]),
  );

  const roms = new Map(
    data.roms.map(({ file, key, data: rom }) => [key, { ...rom, key, file, url: `/roms/${key}/`, support: [] }]),
  );

  const devices = new Map(
    data.devices.map(({ file, brand: brandKey, key, data: device }) => {
      const brand = brands.get(brandKey);
      const prefixed = device.name.toLowerCase().startsWith(brand.name.toLowerCase());
      const slug = device.slug ?? slugify(device.name);
      const entry = {
        ...device,
        key,
        file,
        brand,
        slug,
        title: prefixed ? device.name : `${brand.name} ${device.name}`,
        url: `/devices/${brandKey}/${slug}/`,
        support: [],
      };
      brand.devices.push(entry);
      return [key, entry];
    }),
  );

  const support = data.support.map(({ file, codename, rom: romKey, data: entry }) => {
    const device = devices.get(codename);
    const rom = roms.get(romKey);
    const row = {
      ...entry,
      file,
      device,
      rom,
      stale: entry.verified < staleBefore,
      active: entry.status === 'active' && rom.status === 'active',
      cells: Object.fromEntries(
        features.map((feature) => [feature.key, resolveCell(feature, entry.features?.[feature.key], device)]),
      ),
    };
    device.support.push(row);
    rom.support.push(row);
    return row;
  });

  for (const device of devices.values()) {
    device.support.sort((a, b) => a.rom.name.localeCompare(b.rom.name));
    device.activeCount = device.support.filter((row) => row.active).length;
  }
  for (const rom of roms.values()) rom.support.sort((a, b) => a.device.title.localeCompare(b.device.title));
  for (const brand of brands.values()) brand.devices.sort(byName('title'));

  return {
    features,
    brands: [...brands.values()].sort(byName('name')),
    roms: [...roms.values()].sort(byName('name')),
    devices: [...devices.values()].sort(byName('title')),
    support,
  };
}

let cached;
export const getModel = () => (cached ??= buildModel());
