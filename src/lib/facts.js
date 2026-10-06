import { labelOf, yesNo } from './labels.js';
import { formatDate, formatMonth, today } from './dates.js';
import { isLink } from './text.js';
import { resolveCell } from './data/status.js';

/** Builds read as fresh under two months old, ageing up to six, and old after that */
export const ageTone = (date, now = Date.now()) => {
  const days = (now - Date.parse(date)) / 864e5;
  if (days < 60) return 'working';
  return days < 180 ? 'partial' : 'broken';
};

export const lockTone = {
  yes: 'working',
  conditional: 'partial',
  no: 'broken',
  unknown: 'unknown',
};

const unlockWords = {
  yes: 'Unlocks',
  conditional: 'Unlocks, with conditions',
  no: "Doesn't unlock",
  unknown: 'Unknown',
};

/** The bootloader answer, with the device's own note, or the brand policy it shares */
export function unlockFact({ bootloader, brand }) {
  const own = bootloader.notes || bootloader.source ? bootloader : undefined;
  const policy = brand.bootloader?.unlock === bootloader.unlock ? brand.bootloader : undefined;
  const { notes, source } = own ?? policy ?? {};
  return {
    tone: lockTone[bootloader.unlock],
    text: unlockWords[bootloader.unlock],
    note: notes,
    source,
  };
}

/** Official updates from the manufacturer, e.g. "Security updates until Apr 2032" */
export function stockFact(stock, now = today) {
  if (!stock) return undefined;
  const { android, security_until, updates_until, source } = stock;
  const until = security_until ?? updates_until;
  const note = android && `Android ${android.replace(' - ', ' to ')}`;
  if (!until) return note && { text: note, source };
  if (until === 'ended' || until < now) {
    return { tone: 'ended', text: 'Updates have ended', note, source };
  }
  const kind = security_until ? 'Security updates' : 'Updates';
  return { tone: 'working', text: `${kind} until ${formatMonth(until)}`, note, source };
}

/** The newest build, worded so its age reads without the colour */
export function buildFact(latest, now) {
  if (!latest) return undefined;
  const { date, version, patch } = latest;
  const tone = ageTone(date, now);
  return {
    date,
    tone,
    text: formatDate(date),
    old: tone === 'broken' ? 'Over 6 months old' : undefined,
    version,
    patch: patch && formatMonth(patch),
  };
}

export const relockOf = ({ relock }) =>
  typeof relock === 'string' ? { status: relock } : (relock ?? { status: 'unknown' });

/** Whether a ROM relocks the bootloader, allowing for devices whose own page says otherwise */
export const romRelock = (rom) => {
  const relockable = rom.security.relockable_bootloader;
  const differs = rom.support.some(
    (row) => row.active && relockOf(row).status === (relockable ? 'no' : 'yes'),
  );
  return differs ? 'On some devices' : yesNo(relockable);
};

const relockWords = { yes: 'Bootloader relocks', no: "Can't relock the bootloader" };

/** Only says something when the ROM's device page does */
export function relockFact(row) {
  const { status, note } = relockOf(row);
  return relockWords[status] && { tone: lockTone[status], text: relockWords[status], note };
}

/** What has to happen before installing, e.g. "Stock Android 16 first" or "Beta build" */
export const needsOf = ({ firmware, channel }) =>
  [
    firmware && (/^\d/.test(firmware) ? `Stock Android ${firmware} first` : firmware),
    channel && channel !== 'stable' && `${labelOf(channel)} build`,
  ].filter(Boolean);

const googleWords = {
  none: 'No Google apps',
  microg: 'microG instead of Google',
  sandboxed: 'Sandboxed Google Play',
  optional: 'Add Google apps yourself',
  bundled: 'Google apps built in',
};

export const googleApps = (build) => googleWords[build.google];

const statusWords = {
  working: 'Works',
  partial: 'Partly works',
  broken: "Doesn't work",
  unknown: 'Unknown',
  'n/a': 'N/A',
};

/** Lower-cases a leading capital, but leaves acronyms like L1 alone */
const midSentence = (text) =>
  /^[A-Z][a-z]/.test(text) ? text[0].toLowerCase() + text.slice(1) : text;

/** A cell in words, e.g. "Works", "Basic" or "Likely doesn't work" */
export const statusText = ({ value, inferred }) => {
  const text = statusWords[value] ?? labelOf(value);
  return inferred ? `Likely ${midSentence(text)}` : text;
};

/** When and on what a report was made, e.g. "Reported 17 Sep 2026 on Android 16" */
export const reportContext = ({ origin, checked, android, build, variant }) => {
  if (origin !== 'report' || !(checked || android || build || variant)) return undefined;
  const when = ['Reported', checked && formatDate(checked), android && `on Android ${android}`];
  return [
    when.filter(Boolean).join(' '),
    build && `build ${build}`,
    variant && `${labelOf(variant)} build`,
  ]
    .filter(Boolean)
    .join(', ');
};

/** A report the ROM has moved on from, e.g. "Last checked Jan 2026 on Android 15" */
export const staleText = ({ stale, android, checked }) =>
  stale
    ? ['Last checked', checked && formatMonth(checked), android && `on Android ${android}`]
        .filter(Boolean)
        .join(' ')
    : undefined;

/** Features with a real answer, in features.yml order. Unknown and missing hardware are left out */
export const knownFeatures = (features, cells) =>
  features.flatMap(({ key, name }) => {
    const cell = cells[key];
    if (!cell || ['unknown', 'n/a'].includes(cell.value)) return [];
    return [
      {
        key,
        name,
        tone: cell.tone,
        text: statusText(cell),
        note: [reportContext(cell), cell.note].filter(Boolean).join(': ') || undefined,
        stale: staleText(cell),
        source: isLink(cell.source) ? cell.source : undefined,
      },
    ];
  });

/** What a ROM, or one of its builds, says holds on every device */
export const everywhereCells = (features, build) =>
  Object.fromEntries(
    features.map((feature) => [feature.key, resolveCell(feature, { device: {}, rom: build })]),
  );
