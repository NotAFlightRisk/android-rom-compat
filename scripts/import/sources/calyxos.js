import { parse as parseYaml } from 'yaml';
import { fetchText } from '../fetch.js';
import { upsertDevice, withoutBrand } from '../store.js';

export const DATA = 'https://raw.githubusercontent.com/CalyxOS/calyxos.org/main/pages/_data';

const lists = {
  upcoming: 'active',
  modern: 'active',
  extended: 'active',
  previous: 'discontinued',
};
const brands = { pixel: 'Google', oneplus: 'OnePlus' };
const brandName = (brand) => brands[brand] ?? brand[0].toUpperCase() + brand.slice(1);

const offPixel = { status: 'yes', note: "Check CalyxOS's device page before relocking" };

/** Lowercase codename -> the month the manufacturer stops updating it, as YYYY-MM-01 */
export function supportEnds(devicesYml) {
  const ends = {};
  for (const [codename, device] of Object.entries(parseYaml(devicesYml))) {
    const month = String(device?.manufacturer_support_ends).match(/^\d{4}-\d{2}$/)?.[0];
    if (month) ends[codename.toLowerCase()] = `${month}-01`;
  }
  return ends;
}

/** Brand, device and row for every codename in the device lists */
export function parse(devicesYml, downloadsYml) {
  const devices = parseYaml(devicesYml);
  const builds = new Map(parseYaml(downloadsYml).stable.map((build) => [build.codename, build]));

  return Object.entries(lists).flatMap(([list, status]) =>
    devices[`${list}_codenames`].map((codename) => {
      const { brand, model, android } = devices[codename];
      const build = builds.get(codename);
      const [name, ...aliases] = model
        .replace(/^The\s+|\s+\(beta\)$/gi, '')
        .split(/\s+and\s+/)
        .map((part) => withoutBrand(part, brandName(brand)));
      const row = {
        status,
        channel: list === 'upcoming' || /\(beta\)$/i.test(model) ? 'beta' : 'stable',
        android,
        relock: brand === 'pixel' ? 'yes' : { ...offPixel },
        ...(build && { latest: { version: String(build.version), date: String(build.date) } }),
        source: 'https://calyxos.org/docs/guide/device-support/',
        ...(build && { install: `https://calyxos.org/install/devices/${codename}/` }),
      };
      const device = { name, codenames: [codename.toLowerCase()], aliases };
      return { brand: brandName(brand), device, row };
    }),
  );
}

export default async function calyxos() {
  const [devicesYml, downloadsYml] = await Promise.all([
    fetchText(`${DATA}/devices.yml`),
    fetchText(`${DATA}/downloads.yml`),
  ]);

  const devices = {};
  for (const { brand, device, row } of parse(devicesYml, downloadsYml)) {
    const key = upsertDevice(brand, device);
    if (key) devices[key] = row;
  }
  return { devices };
}
