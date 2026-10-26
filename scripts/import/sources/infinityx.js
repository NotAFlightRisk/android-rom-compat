import { fetchJson, fetchPatchLevel, mapLimit } from '../fetch.js';
import { rowsFor, upsertDevice } from '../store.js';
import { freshest } from './crdroid.js';
import { dateOf, namesOf, typeOfName } from './evolutionx.js';

const REPO = 'ProjectInfinity-X/official_devices';
const API = `https://api.github.com/repos/${REPO}`;
const RAW = `https://raw.githubusercontent.com/${REPO}`;
// The mirror behind the site's own download buttons
const MIRROR = 'https://mirror.tejas101k.workers.dev/0:';
const DAY = 24 * 60 * 60 * 1000;

/** Branches are Android versions, bar master, which holds the Android 15 builds */
export const androidOf = (branch) => (branch === 'master' ? 15 : Number(branch) || undefined);

const makers = { pixel: 'Google', redmi: 'Xiaomi', poco: 'Xiaomi', mi: 'Xiaomi' };

/** The maker a model name opens with, since "Pixel 9" and "Redmi Note 8" leave it out */
export const vendorOf = (model) => {
  const [first] = model.trim().split(/\s+/);
  return makers[first.toLowerCase()] ?? first;
};

/** The newest build across a phone's gapps and vanilla feeds */
export const newestBuild = (feeds) =>
  feeds.flatMap((feed) => feed?.response ?? []).toSorted((a, b) => b.timestamp - a.timestamp)[0];

/** The build's date, from the zip's name when a typo puts its timestamp in the future */
export function builtOn({ timestamp, filename = '' }, now = Date.now()) {
  if (timestamp * 1000 <= now) return dateOf(timestamp);
  const [, day, month, year] = filename.match(/-(\d\d)\.(\d\d)\.(\d{4})-/) ?? [];
  return year && `${year}-${month}-${day}`;
}

/** Brand, device and row from one devices/<codename>.json and its newest build */
export function parse(info, build, { codename, branch, paths }, now = Date.now()) {
  const vendor = vendorOf(info.devicemodel);
  const { name } = namesOf(info.devicemodel, vendor);
  const type = typeOfName(info.devicemodel);
  const built = build && builtOn(build, now);
  const fresh = built && now - Date.parse(built) < 180 * DAY;
  const guide = `flashguide/${codename}.txt`;
  const row = {
    status: info.maintainer && fresh ? 'active' : 'discontinued',
    android: androidOf(branch),
    ...(info.maintainer && {
      maintainer: info.maintainerurl?.startsWith('https://')
        ? { name: info.maintainer, link: info.maintainerurl }
        : info.maintainer,
    }),
    ...(built && {
      latest: { ...(build.version && { version: String(build.version) }), date: built },
    }),
    source: `https://projectinfinity-x.com/downloads/${codename}`,
    ...(paths.has(guide) && { install: `https://github.com/${REPO}/blob/${branch}/${guide}` }),
  };
  // Names like "Motorola G54/G64" make poor model numbers, so other sources fill those
  const device = { name, codenames: [codename.toLowerCase()], ...(type && { type }) };
  return { vendor, device, row };
}

/** Each codename on the newest branch that lists it, as the site picks them */
export function newestBranches(branches, trees) {
  const newest = new Map();
  branches.forEach((branch, i) => {
    for (const path of trees[i]) {
      const [, codename] = path.match(/^devices\/([^/]+)\.json$/) ?? [];
      const lower = codename?.toLowerCase();
      if (lower && !newest.has(lower)) newest.set(lower, { codename, branch, paths: trees[i] });
    }
  });
  return [...newest.values()];
}

export default async function infinityx({ previous }) {
  const branches = (await fetchJson(`${API}/branches?per_page=100`))
    .map(({ name }) => name)
    .filter(androidOf)
    .sort((a, b) => androidOf(b) - androidOf(a));
  const trees = await Promise.all(
    branches.map(async (branch) => {
      const { tree } = await fetchJson(`${API}/git/trees/${branch}?recursive=1`);
      return new Set(tree.map(({ path }) => path));
    }),
  );

  const devices = {};
  const failed = [];
  await mapLimit(newestBranches(branches, trees), 5, async (entry) => {
    const { codename, branch, paths } = entry;
    const feeds = ['gapps', 'vanilla']
      .filter((variant) => paths.has(`${variant}/${codename}.json`))
      .map((variant) => `${RAW}/${branch}/${variant}/${codename}.json`);
    const [info, ...builds] =
      (await Promise.all(
        [`${RAW}/${branch}/devices/${codename}.json`, ...feeds].map((url) => fetchJson(url)),
      ).catch(() => undefined)) ?? [];
    if (!info?.devicemodel) {
      failed.push(codename);
      Object.assign(devices, rowsFor(previous, codename.toLowerCase()));
      return;
    }
    const build = newestBuild(builds);
    const parsed = parse(info, build, entry);
    const zip = parsed.row.status === 'active' && `${MIRROR}/${build.filename}`;
    const patch = zip && (await fetchPatchLevel(zip).catch(() => undefined));
    if (patch) parsed.row.latest.patch = patch;
    const key = upsertDevice(parsed.vendor, parsed.device);
    if (key) devices[key] = freshest(devices[key], parsed.row);
  });
  return { devices, ...(failed.length && { note: `couldn't read ${failed.join(', ')}` }) };
}
