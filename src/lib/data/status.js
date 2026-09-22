export const STATUSES = ['working', 'partial', 'broken', 'unknown', 'n/a'];
export const NEEDS_NOTE = ['partial', 'broken'];

export const allowedValues = (feature) =>
  feature.values ? [...feature.values, 'unknown', 'n/a'] : STATUSES;

export function cellValue(raw) {
  if (typeof raw === 'string') return { value: raw };
  const { status, ...rest } = raw ?? {};
  return { ...rest, value: status };
}

/** Custom values are listed best first, so the first reads as working and the last as broken */
export function toneOf(feature, value) {
  if (!feature.values || value === 'unknown' || value === 'n/a') return value;
  const rank = feature.values.indexOf(value);
  if (rank === 0) return 'working';
  return rank === feature.values.length - 1 ? 'broken' : 'partial';
}

const lacks = (feature, device) =>
  Boolean(feature.requires && device.hardware && !device.hardware.includes(feature.requires));

/**
 * Picks a cell from a report, the ROM's own docs for the device, missing hardware, then
 * ROM-wide facts. Anything stated outright beats anything inferred
 */
export function resolveCell(feature, { report, upstream, device, rom, android, staleBefore }) {
  const { key } = feature;
  const layers = [
    ['report', report?.[key]],
    ['upstream', upstream?.[key]],
    ['hardware', lacks(feature, device) ? 'n/a' : undefined],
    ['rom', rom.features?.[key]],
  ];
  const candidates = layers
    .filter(([, raw]) => raw !== undefined)
    .map(([origin, raw]) => ({ origin, ...cellValue(raw) }));
  const picked = candidates.find((cell) => !cell.inferred) ?? candidates[0];
  if (!picked) return { value: 'unknown', tone: 'unknown', origin: 'none', inferred: false };

  const outdated = picked.android && android > picked.android;
  const expired = picked.checked && picked.checked < staleBefore;
  const stale = picked.origin === 'report' && Boolean(outdated || expired);
  return {
    ...picked,
    tone: toneOf(feature, picked.value),
    inferred: Boolean(picked.inferred),
    stale,
  };
}
