import { fetchJson, mapLimit } from '../fetch.js';
import { upsertDevice } from '../store.js';
import { dateOf, namesOf, typeOfName } from './evolutionx.js';

const API = 'https://raw.githubusercontent.com/PixelOS-AOSP/official_devices/HEAD/API';

/** Pulls 16.2 out of PixelOS_RMX2020-16.2-20260618-2032.zip */
export const versionOf = (link) => String(link ?? '').match(/-(\d+(?:\.\d+)+)-\d{8}/)?.[1];

const codenamesOf = ({ codename, codename_alt }) => {
  const names = [codename, ...String(codename_alt ?? '').split('/')];
  return [...new Set(names.map((name) => name.trim().toLowerCase()))].filter(Boolean);
};

/** Brand, device and row per device, active ones first so a stale duplicate can't win */
export function parse({ devices }) {
  const claimed = new Set();
  return devices
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
      const maintainer = entry.maintainer_name?.replace(/\s*&&\s*/g, ' & ');
      const row = {
        status: entry.active ? 'active' : 'discontinued',
        ...(typeof entry.version === 'number' && { android: entry.version }),
        ...(maintainer && { maintainer }),
        ...(entry.last_updated > 0 && { latest: { date: dateOf(entry.last_updated) } }),
        source: `https://pixelos.net/download/${entry.codename}`,
      };
      const device = { name, codenames: codenamesOf(entry), aliases, ...(type && { type }) };
      return { codename: entry.codename, brand: entry.vendor, device, row };
    });
}

/** The version and XDA thread from API/devices/<codename>.json */
export const detailOf = (json) => ({ version: versionOf(json.download_link), install: json.xda });

export const withDetail = (row, { version, install }) => ({
  ...row,
  ...(version && row.latest && { latest: { version, ...row.latest } }),
  ...(install?.startsWith('http') && { install }),
});

export default async function pixelos({ previous }) {
  const parsed = parse(await fetchJson(`${API}/devices.json`));

  const devices = {};
  const failed = [];
  await mapLimit(parsed, 5, async ({ codename, brand, device, row }) => {
    const key = upsertDevice(brand, device);
    if (!key) return;
    if (row.status !== 'active') return void (devices[key] = row);
    const url = `${API}/devices/${codename}.json`;
    const json = await fetchJson(url).catch(() => void failed.push(codename));
    const { latest, install } = previous[key] ?? {};
    const version = row.latest && latest?.date === row.latest.date ? latest.version : undefined;
    devices[key] = withDetail(row, json ? detailOf(json) : { version, install });
  });
  return { devices, ...(failed.length && { note: `couldn't read ${failed.join(', ')}` }) };
}
