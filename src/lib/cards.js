import {
  buildFact,
  deviceType,
  googleApps,
  lockTone,
  romLatest,
  romSecurity,
  unlockFact,
} from './facts.js';
import { labelOf } from './labels.js';
import { filterData } from './filters.js';
import { romStatus } from './table.js';

/** Splits items into one group per brand, in brand order, for a CardGrid */
export const byBrand = (list, brandOf, toItem) =>
  [...Map.groupBy(list, brandOf)]
    .sort(([a], [b]) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))
    .map(([brand, items]) => ({ brand, items: items.map(toItem) }));

/** Cards leave out the brand their group's heading shows, so a sorted list puts it back */
const prefixOf = (device) => (device.title === device.name ? undefined : device.brand.name);

/** What follows the codename on a card, e.g. [2023, "Handheld"], skipping gaps */
const metaOf = (...parts) => parts.filter(Boolean);

const unlockStatus = (device) => {
  const { unlock } = device.bootloader;
  return unlock === 'unknown'
    ? undefined
    : { tone: lockTone[unlock], text: unlockFact(device).text };
};

/** A device on the device lists: its bootloader and the ROMs that still build for it */
export const deviceCard = (device, roms, showUnlock = true) => ({
  key: device.key,
  href: device.url,
  prefix: prefixOf(device),
  title: device.name,
  code: device.codenames[0],
  meta: metaOf(device.released, deviceType(device)),
  status: showUnlock ? unlockStatus(device) : undefined,
  chips: roms.flatMap((rom) => {
    const { tone, text } = romStatus(device, rom);
    if (tone === 'working') return [{ text: rom.name }];
    return tone === 'partial' ? [{ text: rom.name, tone, note: text.toLowerCase() }] : [];
  }),
  empty: device.activeCount === 0 ? 'Support has ended' : undefined,
  data: filterData(device),
});

/** A device on a ROM's page: which Android it gets and how fresh the build is */
export const romDeviceCard = (row) => {
  const build = buildFact(row.latest);
  return {
    key: row.device.key,
    href: row.device.url,
    prefix: prefixOf(row.device),
    title: row.device.name,
    code: row.device.codenames[0],
    meta: metaOf(row.android && `Android ${row.android}`),
    status: build && {
      tone: build.old && 'partial',
      text: `${build.old ? 'Last built' : 'Built'} ${build.text}`,
    },
    chips: [],
    data: filterData(row.device, false),
  };
};

/** A ROM's app store or base by name, with its logo: one of our ROMs' own, or from logos/software */
const software = (key, ours) => {
  const item = { key, name: labelOf(key) };
  if (key === 'none' || key === 'other') return { text: item.name };
  return { text: item.name, logo: { kind: ours.has(key) ? 'roms' : 'software', item } };
};

/** The two cards atop a ROM's page, six facts apiece where the data allows */
export function romGlance(rom, roms) {
  const ours = new Map(roms.map((other) => [other.key, other]));
  const security = romSecurity(rom);
  const latest = romLatest(rom);
  return {
    Security: [
      { label: 'Relockable bootloader', ...security.relockable },
      { label: 'Verified boot', ...security.verified_boot },
      { label: 'Built-in root', ...security.root },
      { label: 'Security patches', ...security.patches },
      { label: 'Latest patch', ...latest.patch },
      { label: 'Latest build', ...latest.built },
    ],
    Software: [
      { label: 'Android', text: latest.android },
      { label: 'Google apps', text: googleApps(rom) },
      { label: 'App store', ...software(rom.app_store, ours) },
      { label: 'Based on', ...software(rom.base, ours), href: ours.get(rom.base)?.url },
      { label: 'Install with', text: rom.install.map(labelOf) },
      { label: 'Focus', text: rom.focus.map(labelOf) },
    ],
  };
}
