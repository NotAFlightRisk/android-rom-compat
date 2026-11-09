import { fetchJson, fetchPatchLevel, mapLimit } from '../fetch.js';
import { upsertDevice } from '../store.js';
import { namesOf, typeOfName } from './evolutionx.js';

const REPO = 'PixelOS-AOSP/official_devices';
const API = `https://raw.githubusercontent.com/${REPO}/HEAD/API`;
const LISTING = `https://api.github.com/repos/${REPO}/contents/API/devices`;

/** Pulls 16.2 out of PixelOS_RMX2020-16.2-20260618-2032.zip */
export const versionOf = (link) => String(link ?? '').match(/-(\d+(?:\.\d+)+)-\d{8}/)?.[1];

/** Pulls 2026-06-18 out of the same zip name */
const dateOfLink = (link) =>
  String(link ?? '')
    .match(/-(\d{4})(\d\d)(\d\d)-\d{4}\.zip$/)
    ?.slice(1)
    .join('-');

const codenamesOf = ({ codename, codename_alt }) => {
  const names = [codename, ...String(codename_alt ?? '').split('/')];
  return [...new Set(names.map((name) => name.trim().toLowerCase()))].filter(Boolean);
};

/** Maintainers' display names from team.json, or their GitHub login if they're not on it */
const namerOf = ({ team }) => {
  const names = new Map(team.map((person) => [person.github?.toLowerCase(), person.name]));
  return (login) => names.get(login.toLowerCase()) ?? login;
};

/** Brand, device and row per device file, active ones first so a stale duplicate can't win */
export function parse(files, team) {
  const nameOf = namerOf(team);
  const claimed = new Set();
  return files
    .toSorted((a, b) => Number(b.active) - Number(a.active))
    .filter((entry) => {
      const codenames = codenamesOf(entry);
      if (!entry.vendor || !entry.model) return false;
      if (codenames.some((name) => claimed.has(name))) return false;
      codenames.forEach((name) => claimed.add(name));
      return true;
    })
    .map((entry) => {
      const { name, aliases } = namesOf(entry.model, entry.vendor);
      const type = typeOfName(entry.model);
      const zip = entry.download_link || undefined;
      const version = versionOf(zip);
      const date = dateOfLink(zip);
      const maintainer = (entry.maintainers ?? []).map(nameOf).join(' & ');
      const row = {
        status: entry.active ? 'active' : 'discontinued',
        ...(version && { android: Number(version.split('.')[0]) }),
        ...(maintainer && { maintainer }),
        ...(date && { latest: { ...(version && { version }), date } }),
        source: `https://pixelos.net/download/${entry.codename}`,
        ...(entry.xda?.startsWith('http') && entry.active && { install: entry.xda }),
      };
      const device = { name, codenames: codenamesOf(entry), aliases, ...(type && { type }) };
      return { codename: entry.codename, brand: entry.vendor, device, row, zip };
    });
}

export const withPatch = (row, patch) =>
  patch ? { ...row, latest: { ...row.latest, patch } } : row;

export default async function pixelos({ previous }) {
  const listing = await fetchJson(LISTING);
  const names = listing.map(({ name }) => name).filter((name) => name.endsWith('.json'));
  const files = await mapLimit(names, 5, (name) => fetchJson(`${API}/devices/${name}`));
  const parsed = parse(files, await fetchJson(`${API}/team.json`));

  const devices = {};
  const failed = [];
  await mapLimit(parsed, 5, async ({ codename, brand, device, row, zip }) => {
    const key = upsertDevice(brand, device);
    if (!key) return;
    if (row.status !== 'active' || !zip) return void (devices[key] = row);
    const { latest } = previous[key] ?? {};
    const known = latest?.date === row.latest.date ? latest.patch : undefined;
    const patch = known ?? (await fetchPatchLevel(zip).catch(() => void failed.push(codename)));
    devices[key] = withPatch(row, patch);
  });
  return { devices, ...(failed.length && { note: `couldn't read ${failed.join(', ')}` }) };
}
