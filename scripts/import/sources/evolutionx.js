import { fetchJson, mapLimit } from '../fetch.js';
import { brandKey, upsertDevice, withoutBrand } from '../store.js';
import { isoDate } from '../../../src/lib/dates.js';

const INDEX = 'https://raw.githubusercontent.com/Evolution-X/www_gitres/HEAD/devices/devices.json';
const OTA = 'https://raw.githubusercontent.com/Evolution-X/OTA';

/** Branches are Android codenames, newest first */
export const androidOf = { cnb: 17, bka: 16, vic: 15, udc: 14 };

export const newestBranch = (branches) =>
  Object.keys(androidOf).find((branch) => branches.includes(branch));

/** Splits "Redmi Note 12 5G/Poco X5 5G" into a name and aliases, minus bare suffixes like "8T" */
export function namesOf(model, brand) {
  const [name, ...aliases] = model
    .split(/\s*(?:[/,]|&+)\s*(?![^(]*\))/)
    .map((part) => withoutBrand(part, brand))
    .filter(Boolean);
  return { name, aliases: aliases.filter((alias) => /^[a-z][^/]*\d[^/]*$/i.test(alias)) };
}

export const typeOfName = (name) => (/\b(pad|tab|tablet)\b/i.test(name) ? 'tablet' : undefined);

export const dateOf = (seconds) => isoDate(seconds * 1000);

/** Brand, device and row from one builds/<codename>.json, or undefined when it has no builds */
export function parse(json, { codename, branch }) {
  const build = json.response?.[0];
  if (!build?.oem || !build.device) return;
  const brand = brandKey(build.oem) === 'xiaomi' ? 'Xiaomi' : build.oem;
  const { name, aliases } = namesOf(build.device, brand);
  const type = typeOfName(build.device);
  const row = {
    status: build.currently_maintained ? 'active' : 'discontinued',
    android: androidOf[branch],
    ...(build.maintainer && { maintainer: build.maintainer }),
    ...(build.timestamp > 0 && {
      latest: {
        ...(build.version && { version: String(build.version) }),
        date: dateOf(build.timestamp),
      },
    }),
    source: `https://evolution-x.org/device/${codename}`,
    ...(build.forum?.startsWith('http') && { install: build.forum }),
  };
  const device = { name, codenames: [codename.toLowerCase()], aliases, ...(type && { type }) };
  return { brand, device, row };
}

export default async function evolutionx({ previous }) {
  const index = await fetchJson(INDEX);
  const entries = index
    .map(({ codename, branches }) => ({ codename, branch: newestBranch(branches) }))
    .filter((entry) => entry.branch);

  const devices = {};
  const failed = [];
  await mapLimit(entries, 5, async (entry) => {
    const lower = entry.codename.toLowerCase();
    const url = `${OTA}/${entry.branch}/builds/${entry.codename}.json`;
    const json = await fetchJson(url).catch(() => void failed.push(entry.codename));
    const parsed = json && parse(json, entry);
    if (!parsed) {
      if (previous[lower]) devices[lower] = previous[lower];
      return;
    }
    const key = upsertDevice(parsed.brand, parsed.device);
    if (key) devices[key] = parsed.row;
  });
  return { devices, ...(failed.length && { note: `couldn't read ${failed.join(', ')}` }) };
}
