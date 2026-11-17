import { fetchJson, fetchMetadata, mapLimit, patchOf } from '../fetch.js';
import { brandKey, known, upsertDevice } from '../store.js';
import { freshest } from './crdroid.js';
import { dateOf, namesOf, typeOfName } from './evolutionx.js';

// The list the site's devices and downloads pages read
const INDEX =
  'https://raw.githubusercontent.com/RisingOS-Revived-devices/RisingOS_Web/refs/heads/main/devices.json';
const SITE = 'https://risingos-revived-devices.github.io';
const DAY = 24 * 60 * 60 * 1000;

/** Android version from a build's SDK level, as in post-sdk-level=37 */
export const androidOf = (metadata) => {
  const sdk = Number(metadata?.['post-sdk-level']);
  return sdk >= 34 ? sdk - 20 : undefined;
};

/** A codename's variants (GAPPS, CORE, VANILLA, MICROG), newest build first */
export function byCodename(index) {
  const groups = new Map();
  for (const entry of index) {
    if (!entry.codename || !entry.download) continue;
    const lower = entry.codename.toLowerCase();
    groups.set(lower, [...(groups.get(lower) ?? []), entry]);
  }
  return [...groups.values()].map((builds) =>
    builds.toSorted((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0)),
  );
}

/** Brand, device and row from a codename's builds, newest first */
export function parse([build], now = Date.now()) {
  if (!build?.oem || !build.device || !(build.timestamp > 0)) return;
  const { name, aliases } = namesOf(build.device, build.oem);
  const type = typeOfName(build.device);
  const fresh = now - build.timestamp * 1000 < 180 * DAY;
  const row = {
    status: build.status === 'active' && build.maintainer && fresh ? 'active' : 'discontinued',
    ...(build.maintainer && { maintainer: build.maintainer }),
    latest: {
      ...(build.version && { version: build.version.split('-')[0] }),
      date: dateOf(build.timestamp),
    },
    source: `${SITE}/downloads/?codename=${encodeURIComponent(build.codename)}`,
  };
  const codenames = [build.codename.toLowerCase()];
  const device = { name, codenames, aliases, ...(type && { type }) };
  return { brand: build.oem, device, row };
}

const majorOf = (build) => String(build.version ?? '').match(/^\d+/)?.[0];

/** Metadata from the newest zip that still downloads, out of builds of the newest release */
async function newestMetadata(builds) {
  for (const build of builds.filter((build) => majorOf(build) === majorOf(builds[0]))) {
    const metadata = await fetchMetadata(build.download).catch(() => undefined);
    if (metadata) return { metadata, newest: build === builds[0] };
  }
  return {};
}

export default async function risingos() {
  const index = await fetchJson(INDEX);
  const devices = {};
  const unread = [];
  // SourceForge throttles parallel reads, so only a couple at once
  await mapLimit(byCodename(index), 2, async (builds) => {
    const parsed = parse(builds);
    if (!parsed) return;
    const { status, ...rest } = parsed.row;
    // Phones we don't list yet only come in with a live build
    const id = `${brandKey(parsed.brand)}/${parsed.device.codenames[0]}`;
    if (status !== 'active' && !known(id)) return;
    const { metadata, newest } = status === 'active' ? await newestMetadata(builds) : {};
    const android = androidOf(metadata);
    const patch = newest && patchOf(metadata);
    if (patch) rest.latest.patch = patch;
    if (status === 'active' && !newest) unread.push(builds[0].codename);
    const row = { status, ...(android && { android }), ...rest };
    const key = upsertDevice(parsed.brand, parsed.device);
    if (key) devices[key] = freshest(devices[key], row);
  });
  const note = unread.length && `couldn't read the zip for ${unread.join(', ')}`;
  return { devices, ...(note && { note }) };
}
