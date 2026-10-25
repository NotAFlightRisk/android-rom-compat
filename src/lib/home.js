/** Up to `size` items in order, one per group until the groups run dry, each id only once */
function spread(items, size, groupOf, idOf = (item) => item) {
  const picks = new Map();
  const groups = new Set();
  const fill = (skip) => {
    for (const item of items) {
      if (picks.size === size || picks.has(idOf(item)) || skip(item)) continue;
      picks.set(idOf(item), item);
      groups.add(groupOf(item));
    }
  };
  fill((item) => groups.has(groupOf(item)));
  fill(() => false);
  return items.filter((item) => picks.get(idOf(item)) === item);
}

const bySupport = (a, b) =>
  b.activeCount - a.activeCount || (b.released ?? 0) - (a.released ?? 0);
const byNewest = (a, b) =>
  b.date.localeCompare(a.date) || a.device.title.localeCompare(b.device.title);

/** Each brand's best-supported phone, before any brand gets a second go */
export const mostSupported = (devices, size) =>
  spread(
    devices.filter((device) => device.activeCount > 0).toSorted(bySupport),
    size,
    (device) => device.brand,
  );

/** Each ROM's newest build, on phones that aren't already in `skip` */
export function recentlyBuilt(devices, skip, size) {
  const builds = devices
    .filter((device) => !skip.includes(device))
    .flatMap((device) =>
      device.support
        .filter((row) => row.active && row.latest?.date)
        .map((row) => ({ device, rom: row.rom, date: row.latest.date })),
    )
    .toSorted(byNewest);
  return spread(builds, size, (build) => build.rom, (build) => build.device);
}
