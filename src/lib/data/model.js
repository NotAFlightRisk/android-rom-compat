import { getData } from './load.js';
import { resolveCell } from './status.js';
import { slugify } from '../text.js';

const STALE_AFTER_DAYS = 365;
const byName = (key) => (a, b) => a[key].localeCompare(b[key], 'en', { sensitivity: 'base' });

/** Joins the raw files into brands, ROMs and devices that point at each other */
export function buildModel(data = getData(), now = new Date()) {
  const staleBefore = new Date(now - STALE_AFTER_DAYS * 864e5).toISOString().slice(0, 10);
  const features = data.features.data;
  const brands = new Map(
    data.brands.data.map((brand) => [
      brand.key,
      { ...brand, url: `/devices/${brand.key}/`, devices: [] },
    ]),
  );

  const roms = new Map(
    data.roms.map(({ file, key, data: rom }) => [
      key,
      { ...rom, key, file, url: `/roms/${key}/`, support: [] },
    ]),
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

  const upstream = new Map();
  for (const { name, data: file } of data.upstream) {
    for (const [codename, row] of Object.entries(file.devices ?? {})) {
      if (name === 'stock') {
        if (devices.has(codename)) devices.get(codename).stock = row;
      } else upstream.set(`${codename}/${name}`, row);
    }
  }
  const reports = new Map(data.support.map((entry) => [`${entry.codename}/${entry.rom}`, entry]));

  const pairs = [...upstream.keys(), ...reports.keys()].filter((pair) => {
    const [codename, name] = pair.split('/');
    return devices.has(codename) && roms.has(name);
  });

  const support = [...new Set(pairs)].map((pair) => {
    const [codename, romKey] = pair.split('/');
    const device = devices.get(codename);
    const rom = roms.get(romKey);
    const docs = upstream.get(pair);
    const report = reports.get(pair);
    const { features: reported, ...facts } = report?.data ?? {};
    const { features: documented, ...row } = docs ?? facts;
    const variants = (rom.variants ?? []).flatMap((variant) => {
      const build = upstream.get(`${codename}/${romKey}-${variant.key}`);
      return build ? [{ ...variant, ...build }] : [];
    });
    const entry = {
      ...row,
      file: report?.file,
      generated: Boolean(docs),
      device,
      rom,
      variants,
      active: row.status === 'active' && rom.status === 'active',
      cells: Object.fromEntries(
        features.map((feature) => [
          feature.key,
          resolveCell(feature, {
            report: reported,
            upstream: documented,
            device,
            rom,
            android: row.android,
            staleBefore,
          }),
        ]),
      ),
    };
    device.support.push(entry);
    rom.support.push(entry);
    return entry;
  });

  for (const device of devices.values()) {
    device.support.sort((a, b) => a.rom.name.localeCompare(b.rom.name));
    device.activeCount = device.support.filter((row) => row.active).length;
    device.latestBuild = device.support
      .map((row) => row.latest?.date)
      .filter(Boolean)
      .sort()
      .at(-1);
  }
  for (const rom of roms.values())
    rom.support.sort((a, b) => a.device.title.localeCompare(b.device.title));
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
