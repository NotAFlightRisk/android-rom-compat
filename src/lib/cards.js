import { buildFact, lockTone, unlockFact } from './facts.js';
import { filterData, romStatus } from './table.js';

/** Splits items into one group per brand, in brand order, for a CardGrid */
export const byBrand = (list, brandOf, toItem) =>
  [...Map.groupBy(list, brandOf)]
    .sort(([a], [b]) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))
    .map(([brand, items]) => ({ brand, items: items.map(toItem) }));

/** A card's meta line, e.g. "Android 16 · Built 2 Oct 2026", skipping what's missing */
const metaLine = (...parts) => parts.filter(Boolean).join(' · ');

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
  title: device.name,
  code: device.codenames[0],
  meta: metaLine(device.released),
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
    title: row.device.name,
    code: row.device.codenames[0],
    meta: metaLine(row.android && `Android ${row.android}`, build && `Built ${build.text}`),
    status: build?.old && { tone: 'partial', text: build.old },
    chips: [],
    data: filterData(row.device, false),
  };
};
