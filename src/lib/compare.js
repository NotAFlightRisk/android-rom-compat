import { romGlance } from './cards.js';
import { everywhereCells, statusText } from './facts.js';
import { slugify } from './text.js';

const MIN_SHARED = 10;
const unknown = { tone: 'unknown', text: 'Unknown' };
const perDevice = { tone: 'unknown', text: 'Depends on the device' };

const activeDevices = (rom) =>
  new Set(rom.support.filter((row) => row.active).map((row) => row.device));

/** Every pair of active ROMs with enough devices in common to be worth a page, keys in order */
export function romPairs(roms) {
  const live = roms
    .filter((rom) => rom.status === 'active')
    .toSorted((a, b) => a.key.localeCompare(b.key, 'en'));
  return live.flatMap((first, i) =>
    live.slice(i + 1).flatMap((second) => {
      const [a, b] = [first, second].map(activeDevices);
      const both = [...a].filter((device) => b.has(device));
      if (both.length < MIN_SHARED) return [];
      const key = `${first.key}-vs-${second.key}`;
      return {
        key,
        url: `/compare/${key}/`,
        title: `${first.name} vs ${second.name}`,
        roms: [first, second],
        both,
        only: [
          [...a].filter((device) => !b.has(device)),
          [...b].filter((device) => !a.has(device)),
        ],
      };
    }),
  );
}

/** What a ROM's page says about the ROM as a whole: its glance cards, then ROM-wide features */
function romFacts(rom, roms, features) {
  const cells = everywhereCells(features, rom);
  const glance = Object.values(romGlance(rom, roms))
    .flat()
    .map(({ label, tone, text, href }) => ({
      label,
      tone,
      text: Array.isArray(text) ? text.join(', ') : text,
      href,
    }));
  const known = features.map(({ key, name }) =>
    ['unknown', 'n/a'].includes(cells[key].value)
      ? { label: name, blank: perDevice }
      : { label: name, tone: cells[key].tone, text: statusText(cells[key]) },
  );
  return [...glance, ...known];
}

/** Two ROMs' facts as table rows, keyed by ROM, with the rows that differ first */
export function compareRows(pair, roms, features) {
  const [first, second] = pair.map((rom) => romFacts(rom, roms, features));
  const rows = first
    .map((fact, i) => [fact, second[i]])
    .filter((facts) => facts.some((fact) => fact.text))
    .map((facts) => ({
      key: slugify(facts[0].label),
      head: { label: facts[0].label },
      same: facts[0].text === facts[1].text,
      cells: Object.fromEntries(
        facts.map((fact, i) => [pair[i].key, fact.text ? fact : (fact.blank ?? unknown)]),
      ),
    }));
  return rows.toSorted((a, b) => a.same - b.same);
}
