import { fetchJson, mapLimit } from '../fetch.js';
import { brandKey, upsertDevice, withoutBrand } from '../store.js';
import { isoDate } from '../../../src/lib/dates.js';

const REPO = 'crdroidandroid/android_vendor_crDroidOTA';
const API = `https://api.github.com/repos/${REPO}`;
const DAY = 24 * 60 * 60 * 1000;

/** Lowercase codename -> its upstream spelling and the newest branch that has it */
export function newestBranches(trees) {
  const newest = new Map();
  const branches = Object.keys(trees).sort((a, b) => parseFloat(b) - parseFloat(a));
  for (const branch of branches) {
    for (const { path } of trees[branch].filter((file) => file.path.endsWith('.json'))) {
      const codename = path.replace('.json', '');
      const lower = codename.toLowerCase();
      if (!newest.has(lower)) newest.set(lower, { codename, branch });
    }
  }
  return newest;
}

const patchOf = (level) => {
  const [, month, day = '01'] = String(level).match(/^(\d{4}-\d{2})(?:-(\d{2}))?/) ?? [];
  return month && `${month}-${day}`;
};

/** Brand, device and row from one <codename>.json, or undefined when it has no builds */
export function parse(json, { codename, branch }, now = Date.now()) {
  const build = json.response?.[0];
  if (!build) return;
  const brand = brandKey(build.oem) === 'xiaomi' ? 'Xiaomi' : build.oem;
  const [name, ...aliases] = build.device
    .split(/\s+[/&]\s+/)
    .map((part) => withoutBrand(part, brand));
  const released = build.timestamp * 1000;
  const patch = patchOf(build.os_patch_level);
  const row = {
    status: now - released < 180 * DAY ? 'active' : 'discontinued',
    channel: /alpha|beta|nightly/i.test(build.buildtype) ? 'beta' : 'stable',
    android: parseInt(branch),
    ...(build.maintainer && { maintainer: build.maintainer }),
    latest: {
      ...(build.version && { version: String(build.version) }),
      date: isoDate(released),
      ...(patch && { patch }),
    },
    source: `https://github.com/${REPO}/blob/${branch}/${codename}.json`,
    ...(build.forum?.startsWith('http') && { install: build.forum }),
  };
  return { brand, device: { name, codenames: [codename.toLowerCase()], aliases }, row };
}

export default async function crdroid({ previous }) {
  const branches = await fetchJson(`${API}/branches?per_page=100`);
  const trees = {};
  for (const { name } of branches) trees[name] = (await fetchJson(`${API}/git/trees/${name}`)).tree;

  const devices = {};
  const failed = [];
  await mapLimit([...newestBranches(trees).values()], 5, async (entry) => {
    const lower = entry.codename.toLowerCase();
    const url = `https://raw.githubusercontent.com/${REPO}/${entry.branch}/${entry.codename}.json`;
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
