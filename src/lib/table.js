import { labelOf, yesNo } from './labels.js';
import { issueUrl } from './site.js';
import { isLink } from './text.js';
import { formatMonth } from './dates.js';
import {
  ageTone,
  buildFact,
  lockTone,
  needsOf,
  relockOf,
  romRelock,
  reportContext,
  staleText,
  statusText,
} from './facts.js';

const text = (value) => ({ text: value });

export const featureColumns = (features) =>
  features.map(({ key, group, name, description }) => ({ key, group, label: name, description }));

export const romColumns = [
  { key: 'base', label: 'Based on' },
  { key: 'google', label: 'Google apps' },
  { key: 'app_store', label: 'App store' },
  { key: 'focus', label: 'Focus' },
  { key: 'org', label: 'Run by' },
  { key: 'relockable', label: 'Relockable bootloader' },
  { key: 'verified_boot', label: 'Verified boot' },
  { key: 'patches', label: 'Patches' },
  { key: 'install', label: 'Install with' },
  { key: 'root', label: 'Root' },
];

export const romCells = (rom) => ({
  base: text(labelOf(rom.base)),
  google: text(labelOf(rom.google)),
  app_store: text(labelOf(rom.app_store)),
  focus: text(rom.focus.map(labelOf).join(', ')),
  org: text(labelOf(rom.org)),
  relockable: text(romRelock(rom)),
  verified_boot: text(yesNo(rom.security.verified_boot)),
  patches: text(labelOf(rom.security.patches)),
  install: text(rom.install.map(labelOf).join(', ')),
  root: text(yesNo(rom.root)),
});

export const latestCell = ({ latest }, detailed = false) => {
  const build = buildFact(latest);
  if (!build) return {};
  const note = [build.version && `Version ${build.version}`, build.patch && `${build.patch} patch`]
    .filter(Boolean)
    .join(', ');
  return {
    date: build.date,
    text: build.text,
    tone: build.tone,
    note: (detailed && note) || undefined,
  };
};

export const relockCell = (row) => {
  if (!row.relock) return {};
  const { status, note } = relockOf(row);
  return { tone: lockTone[status], text: labelOf(status), note };
};

export const needsCell = (row) => {
  const chips = needsOf(row);
  return chips.length ? { chips } : {};
};

const featureCell = (cell, detailed) => ({
  tone: cell.tone,
  text: statusText(cell),
  stale: staleText(cell),
  note: [reportContext(cell), cell.note].filter(Boolean).join(': ') || undefined,
  source: detailed && isLink(cell.source) ? cell.source : undefined,
});

/** Build facts and one status cell per feature, for a device and ROM pair */
export const supportCells = (row, features, detailed = false) => ({
  android: { text: row.android ?? '?', code: true },
  latest: latestCell(row, detailed),
  version: text(row.latest?.version),
  patch: row.latest?.patch ? { date: row.latest.patch, text: formatMonth(row.latest.patch) } : {},
  relock: relockCell(row),
  needs: needsCell(row),
  ...Object.fromEntries(features.map(({ key }) => [key, featureCell(row.cells[key], detailed)])),
});

const buildColumn = (key, label, hidden = false) => ({ key, label, group: 'build', hidden });

/** Device pages keep version and patch in the date's popover, ROM pages get columns instead */
export const supportColumns = (features, detailed = false) => [
  buildColumn('android', 'Android'),
  buildColumn('latest', 'Latest build'),
  ...(detailed
    ? []
    : [buildColumn('version', 'Version', true), buildColumn('patch', 'Patch', true)]),
  buildColumn('relock', 'Relock'),
  buildColumn('needs', 'Needs'),
  ...featureColumns(features),
];

const filled = (cell) => Boolean(cell.text || cell.date || cell.chips || cell.tone);

/** Drops columns that would be blank on every row */
export const usedColumns = (columns, rows) =>
  columns.filter(({ key }) => rows.some((row) => filled(row.cells[key])));

export const sameOnEveryRow = (rows, key) =>
  new Set(rows.map((row) => JSON.stringify(row.cells[key]))).size === 1;

/** Features somebody has actually written down for these rows, rather than a column of guesses */
export const reportedFeatures = (features, rows) =>
  features.filter(({ key }) =>
    rows.some((row) => ['report', 'upstream'].includes(row.cells[key].origin)),
  );

export const featuresFrom = (features, rows, origin) =>
  features.filter(({ key }) => rows.every((row) => row.cells[key].origin === origin));

export const reportUrl = (device, rom) => {
  const title = `[Report]: ${device.title} (${device.key})${rom ? ` on ${rom.name}` : ''}`;
  return `${issueUrl('report-feature')}&title=${encodeURIComponent(title)}`;
};

export const deviceSearchText = (device) =>
  [device.title, ...device.codenames, ...(device.aliases ?? [])].join(' ').toLowerCase();

/** What FilterBar matches on, spread onto a device's card and its table row alike */
export const filterData = (device, ended = device.activeCount === 0) => ({
  'data-search': deviceSearchText(device),
  'data-brand': device.brand.key,
  'data-rom': device.support
    .filter((row) => row.active)
    .map((row) => row.rom.key)
    .join(' '),
  'data-unlock': device.bootloader.unlock,
  'data-ended': ended ? '' : undefined,
});

export const splitByActive = (rows) => [
  rows.filter((row) => row.active),
  rows.filter((row) => !row.active),
];

export const deviceColumns = (roms) => [
  { key: 'brand', label: 'Brand' },
  { key: 'released', label: 'Released' },
  { key: 'unlock', label: 'Bootloader unlock' },
  ...roms.map((rom) => ({ key: rom.key, label: rom.name })),
];

/** Whether a ROM supports a device, for its column on device lists and its chip on cards */
export const romStatus = (device, rom) => {
  const row = device.support.find((entry) => entry.rom === rom);
  if (!row) return { tone: 'n/a', text: 'No' };
  if (!row.active) return { tone: 'ended', text: 'Ended' };
  return !row.latest || ageTone(row.latest.date) !== 'broken'
    ? { tone: 'working', text: 'Active' }
    : { tone: 'partial', text: 'Old build' };
};

export const deviceRows = (devices, roms) =>
  devices.map((device) => ({
    key: device.key,
    data: filterData(device),
    head: { label: device.title, href: device.url, code: device.codenames.join(', ') },
    cells: {
      brand: text(device.brand.name),
      released: { text: device.released ?? '?' },
      unlock: { tone: lockTone[device.bootloader.unlock], text: labelOf(device.bootloader.unlock) },
      ...Object.fromEntries(roms.map((rom) => [rom.key, romStatus(device, rom)])),
    },
  }));
