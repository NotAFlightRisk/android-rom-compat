export const STATUSES = ['working', 'partial', 'broken', 'unknown', 'n/a'];
export const NEEDS_NOTE = ['partial', 'broken'];

export const allowedValues = (feature) =>
  feature.values ? [...feature.values, 'unknown', 'n/a'] : STATUSES;

export const cellValue = (raw) =>
  typeof raw === 'string' ? { value: raw } : { value: raw?.status, note: raw?.note };

/** Custom values are listed best first, so the first reads as working and the last as broken */
export function toneOf(feature, value) {
  if (!feature.values || value === 'unknown' || value === 'n/a') return value;
  const rank = feature.values.indexOf(value);
  if (rank === 0) return 'working';
  return rank === feature.values.length - 1 ? 'broken' : 'partial';
}
