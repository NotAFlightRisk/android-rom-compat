import { labelOf, yesNo } from './labels.js';
import { issueUrl } from './site.js';
import { isLink } from './text.js';

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
  relockable: text(yesNo(rom.security.relockable_bootloader)),
  verified_boot: text(yesNo(rom.security.verified_boot)),
  patches: text(labelOf(rom.security.patches)),
  install: text(rom.install.map(labelOf).join(', ')),
  root: text(yesNo(rom.root)),
});

/** Fresh builds read as working, anything past six months as broken */
export const ageTone = (date) => {
  const days = (Date.now() - Date.parse(date)) / 864e5;
  if (days < 60) return 'working';
  return days < 180 ? 'partial' : 'broken';
};

export const latestCell = ({ latest }, detailed = false) => {
  if (!latest) return {};
  const { version, date, patch } = latest;
  const note = [version && `Version ${version}`, patch && `security patch ${patch}`]
    .filter(Boolean)
    .join(', ');
  return { date, tone: ageTone(date), note: (detailed && note) || undefined };
};

const lockTone = { yes: 'working', conditional: 'partial', no: 'broken', unknown: 'unknown' };

export const relockCell = ({ relock }) => {
  if (!relock) return {};
  const { status, note } = typeof relock === 'string' ? { status: relock } : relock;
  return { tone: lockTone[status], text: labelOf(status), note };
};

export const needsCell = ({ firmware, channel }) => {
  const chips = [
    firmware && (/^\d/.test(firmware) ? `Stock Android ${firmware} first` : firmware),
    channel && channel !== 'stable' && labelOf(channel),
  ].filter(Boolean);
  return chips.length ? { chips } : {};
};

const suffixes = { upstream: 'docs', rom: 'ROM' };

export const originSuffix = ({ origin, inferred }) =>
  [suffixes[origin], inferred && 'inferred'].filter(Boolean).join(', ') || undefined;

/** Where a cell's answer came from, in words, e.g. "Reported 2026-09-17 on Android 16" */
const originLead = (rom, { origin, inferred, checked, android, build, variant }) => {
  const leads = {
    report: [
      ['Reported', checked, android && `on Android ${android}`].filter(Boolean).join(' '),
      build && `build ${build}`,
      variant && `on the ${labelOf(variant)} build`,
    ],
    upstream: [`${rom.name} docs`],
    rom: [`${rom.name}, every device`],
  };
  return leads[origin] && [...leads[origin], inferred && 'inferred'].filter(Boolean).join(', ');
};

const featureCell = (row, cell, detailed) => {
  const lead = detailed && originLead(row.rom, cell);
  return {
    tone: cell.tone,
    text: labelOf(cell.value),
    suffix: originSuffix(cell),
    stale: cell.stale,
    note: [lead, cell.note].filter(Boolean).join(': ') || undefined,
    source: lead && isLink(cell.source) ? cell.source : undefined,
  };
};

/** Build facts and one status cell per feature, for a device and ROM pair */
export const supportCells = (row, features, detailed = false) => ({
  android: { text: row.android ?? '?', code: true },
  latest: latestCell(row, detailed),
  version: text(row.latest?.version),
  patch: text(row.latest?.patch),
  relock: relockCell(row),
  needs: needsCell(row),
  ...Object.fromEntries(
    features.map(({ key }) => [key, featureCell(row, row.cells[key], detailed)]),
  ),
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

export const reportUrl = (device, rom) =>
  `${issueUrl('report-feature')}&device=${device.key}${rom ? `&rom=${rom.key}` : ''}`;

export const deviceSearchText = (device) =>
  [device.title, ...device.codenames, ...(device.aliases ?? [])].join(' ').toLowerCase();

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

const romStatus = (device, rom) => {
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
    brand: device.brand.key,
    ended: device.activeCount === 0,
    search: deviceSearchText(device),
    head: { label: device.title, href: device.url, code: device.codenames.join(', ') },
    cells: {
      brand: text(device.brand.name),
      released: { text: device.released ?? '?' },
      unlock: {
        tone: lockTone[device.bootloader.unlock],
        text: labelOf(device.bootloader.unlock),
      },
      ...Object.fromEntries(roms.map((rom) => [rom.key, romStatus(device, rom)])),
    },
  }));
