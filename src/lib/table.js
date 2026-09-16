import { labelOf, yesNo } from './labels.js';

const toneRank = { working: 0, partial: 1, broken: 2, unknown: 3, 'n/a': 4 };

export const featureColumns = (features) =>
  features.map(({ key, name, description }) => ({ key, label: name, description }));

export const romColumns = [
  { key: 'base', label: 'Based on' },
  { key: 'google', label: 'Google apps' },
  { key: 'app_store', label: 'App store' },
  { key: 'focus', label: 'Focus' },
  { key: 'org', label: 'Run by' },
  { key: 'relockable', label: 'Relockable bootloader' },
  { key: 'verified_boot', label: 'Verified boot' },
  { key: 'patches', label: 'Monthly patches' },
  { key: 'install', label: 'Install with' },
  { key: 'root', label: 'Root' },
];

const text = (value) => ({ text: value, sort: value });

export const romCells = (rom) => ({
  base: text(labelOf(rom.base)),
  google: text(labelOf(rom.google)),
  app_store: text(labelOf(rom.app_store)),
  focus: text(rom.focus.map(labelOf).join(', ')),
  org: text(labelOf(rom.org)),
  relockable: text(yesNo(rom.security.relockable_bootloader)),
  verified_boot: text(yesNo(rom.security.verified_boot)),
  patches: text(yesNo(rom.security.monthly_patches)),
  install: text(rom.install.map(labelOf).join(', ')),
  root: text(yesNo(rom.root)),
});

/** Android version, last check and one status cell per feature, for a single support file */
export const supportCells = (row, features) => ({
  android: { text: row.android ?? '?', sort: row.android ?? 0 },
  verified: { date: row.verified, stale: row.stale, sort: row.verified },
  ...Object.fromEntries(
    features.map(({ key }) => {
      const cell = row.cells[key];
      return [key, { tone: cell.tone, text: labelOf(cell.value), note: cell.note, sort: toneRank[cell.tone] }];
    }),
  ),
});

/** Skips features nobody has reported for these rows, rather than a column of question marks */
export const reportedFeatures = (features, rows) =>
  features.filter(({ key }) => rows.some((row) => row.cells[key].value !== 'unknown'));

export const supportColumns = (features) => [
  { key: 'android', label: 'Android' },
  { key: 'verified', label: 'Last checked' },
  ...featureColumns(features),
];

export const deviceSearchText = (device) =>
  [device.title, ...device.codenames, ...(device.aliases ?? [])].join(' ').toLowerCase();

export const splitByActive = (rows) => [rows.filter((row) => row.active), rows.filter((row) => !row.active)];

export const deviceColumns = (roms) => [
  { key: 'brand', label: 'Brand' },
  { key: 'released', label: 'Released' },
  { key: 'unlock', label: 'Bootloader unlock' },
  ...roms.map((rom) => ({ key: rom.key, label: rom.name })),
];

const romStatus = (device, rom) => {
  const row = device.support.find((entry) => entry.rom === rom);
  if (!row) return { tone: 'n/a', text: 'No', sort: 2 };
  return row.active ? { tone: 'working', text: 'Official', sort: 0 } : { tone: 'unknown', text: 'Ended', sort: 1 };
};

const unlockTone = { yes: 'working', conditional: 'partial', no: 'broken' };

export const deviceRows = (devices, roms) =>
  devices.map((device) => ({
    key: device.key,
    brand: device.brand.key,
    search: deviceSearchText(device),
    head: { label: device.title, href: device.url, code: device.codenames.join(', ') },
    cells: {
      brand: text(device.brand.name),
      released: { text: device.released ?? '?', sort: device.released ?? 0 },
      unlock: { tone: unlockTone[device.bootloader.unlock], text: labelOf(device.bootloader.unlock) },
      ...Object.fromEntries(roms.map((rom) => [rom.key, romStatus(device, rom)])),
    },
  }));
