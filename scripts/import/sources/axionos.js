import { fetchJson, mapLimit } from '../fetch.js';
import { brandKey, known, upsertDevice } from '../store.js';
import { dateOf, namesOf, typeOfName } from './evolutionx.js';

const REPO = 'https://raw.githubusercontent.com/AxionAOSP/official_devices/HEAD';
const MANIFEST = 'https://api.github.com/repos/AxionAOSP/android';

/** Xiaomi for POCO and Redmi, else the name's first word when it spells Axion's brand key or that's "other" */
export function vendorOf({ brand, name }) {
  if (brandKey(brand) === 'xiaomi') return 'Xiaomi';
  const [first] = name.trim().split(/\s+/);
  return brand === 'other' || brandKey(first) === brandKey(brand) ? first : brand;
}

/** lineage-23.2 is Android 16, same sums as LineageOS's own branches */
export const androidOfBranch = (branch) => {
  const lineage = Number(branch.match(/^lineage-(\d+)/)?.[1]);
  return lineage ? lineage - 7 : undefined;
};

const major = (version) => parseInt(version ?? '');

/** The newest build in an OTA json, or undefined when there isn't one */
export const newestBuild = (json) =>
  json?.response?.toSorted((a, b) => b.datetime - a.datetime)[0];

/** The GMS build, or the vanilla one when a phone only has that */
async function buildOf({ gms, vanilla }) {
  for (const url of [gms, vanilla].filter(Boolean)) {
    const json = await fetchJson(url).catch((error) => {
      if (error.status !== 404) throw error;
    });
    if (json) return newestBuild(json);
  }
}

const maintainersOf = ({ maintainers }) =>
  new Map(
    maintainers.map(({ id, name, github_username: github }) => [
      id,
      /^[a-z\d-]+$/i.test(github ?? '') ? { name, link: `https://github.com/${github}` } : name,
    ]),
  );

/** Brand, device and row for one entry in api/downloads.json, Android only for current builds */
export function parse(entry, { build, maintainers, android, current }) {
  const vendor = vendorOf(entry);
  const { name } = namesOf(entry.name, vendor);
  const type = typeOfName(entry.name);
  const [maintainer] = entry.maintainer_ids.map((id) => maintainers.get(id)).filter(Boolean);
  const row = {
    status: entry.status === 'active' ? 'active' : 'discontinued',
    ...(build && major(build.version) === current && android && { android }),
    ...(maintainer && { maintainer }),
    ...(build?.datetime > 0 && {
      latest: { ...(build.version && { version: build.version }), date: dateOf(build.datetime) },
    }),
    source: `https://www.axionos.org/download/${entry.codename}`,
    ...(entry.guide && {
      install: `https://github.com/AxionAOSP/official_devices/blob/main/Wiki/${entry.codename}.md`,
    }),
  };
  // Names like "Realme C25/S/N50A" make poor model numbers, so other sources fill those
  const device = { name, codenames: [entry.codename.toLowerCase()], ...(type && { type }) };
  return { vendor, device, row };
}

export default async function axionos({ previous }) {
  const [{ devices: entries }, team, repo] = await Promise.all([
    fetchJson(`${REPO}/api/downloads.json`),
    fetchJson(`${REPO}/api/maintainers.json`),
    fetchJson(MANIFEST),
  ]);
  const maintainers = maintainersOf(team);
  const android = androidOfBranch(repo.default_branch);

  const failed = [];
  const builds = await mapLimit(entries, 5, ({ codename, ota }) =>
    buildOf(ota).catch(() => void failed.push(codename)),
  );
  const current = Math.max(...builds.map((build) => major(build?.version)).filter(Boolean));

  const devices = {};
  entries.forEach((entry, i) => {
    const parsed = parse(entry, { build: builds[i], maintainers, android, current });
    const id = `${brandKey(parsed.vendor)}/${parsed.device.codenames[0]}`;
    // A phone Axion dropped before we ever listed it isn't worth a page of its own
    if (parsed.row.status !== 'active' && !known(id)) return;
    const key = upsertDevice(parsed.vendor, parsed.device);
    if (key) devices[key] = (failed.includes(entry.codename) && previous[key]) || parsed.row;
  });
  return { devices, ...(failed.length && { note: `couldn't read ${failed.join(', ')}` }) };
}
