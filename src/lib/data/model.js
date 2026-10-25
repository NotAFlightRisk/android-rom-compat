import { getData } from './load.js';
import { resolveCell } from './status.js';
import { slugify } from '../text.js';

const STALE_AFTER_DAYS = 365;
const cantRelock = { status: 'no', origin: 'rom' };
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
    data.devices.map(({ file, brand: brandKey, key, id, data: device }) => {
      const brand = brands.get(brandKey);
      const prefixed = device.name.toLowerCase().startsWith(brand.name.toLowerCase());
      const slug = device.slug ?? slugify(device.name);
      const policy = device.bootloader.unlock === 'unknown' && brand.bootloader?.unlock;
      const entry = {
        ...device,
        bootloader: policy
          ? { ...device.bootloader, unlock: policy, origin: 'brand' }
          : device.bootloader,
        key,
        id,
        file,
        brand,
        slug,
        title: prefixed ? device.name : `${brand.name} ${device.name}`,
        url: `/devices/${brandKey}/${slug}/`,
        support: [],
      };
      brand.devices.push(entry);
      return [id, entry];
    }),
  );

  const upstream = new Map();
  for (const { name, data: file } of data.upstream) {
    for (const [id, row] of Object.entries(file.devices ?? {})) {
      if (name === 'stock') {
        if (devices.has(id)) devices.get(id).stock = row;
      } else upstream.set(`${id}:${name}`, row);
    }
  }
  const reports = new Map(data.support.map((entry) => [`${entry.device}:${entry.rom}`, entry]));

  const pairs = [...upstream.keys(), ...reports.keys()].filter((pair) => {
    const [id, name] = pair.split(':');
    return devices.has(id) && roms.has(name);
  });

  const support = [...new Set(pairs)].map((pair) => {
    const [id, romKey] = pair.split(':');
    const device = devices.get(id);
    const rom = roms.get(romKey);
    const docs = upstream.get(pair);
    const report = reports.get(pair);
    const { features: reported, ...facts } = report?.data ?? {};
    const { features: documented, ...row } = docs ?? facts;
    const listed = row.status === 'active' && rom.status === 'active';
    const stalled = listed && row.latest?.date < staleBefore;
    const variants = (rom.variants ?? []).flatMap((variant) => {
      const build = upstream.get(`${id}:${romKey}-${variant.key}`);
      return build ? [{ ...variant, ...build }] : [];
    });
    const entry = {
      ...row,
      relock: row.relock ?? (rom.security.relockable_bootloader ? undefined : cantRelock),
      file: report?.file,
      generated: Boolean(docs),
      device,
      rom,
      variants,
      active: listed && !stalled,
      stalled,
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
    device.ended = device.activeCount === 0 && device.support.length > 0;
    device.latestBuild = device.support
      .map((row) => row.latest?.date)
      .filter(Boolean)
      .sort()
      .at(-1);
  }
  for (const rom of roms.values()) {
    rom.support.sort((a, b) => a.device.title.localeCompare(b.device.title));
    rom.activeCount = rom.support.filter((row) => row.active).length;
  }
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
