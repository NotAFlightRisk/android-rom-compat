/** Lower case, no accents, "+" spelt out and split at every gap and digit: "S23+" is s 23 plus */
export const wordsOf = (text) =>
  text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\+/g, ' plus ')
    .replace(/([a-z])(?=\d)|(\d)(?=[a-z])/g, '$1$2 ')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

const compact = (text) => wordsOf(text).join('');

/** One typo apart: a letter swapped, added, dropped or two of them flipped */
export function nearly(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let at = 0;
  while (at < a.length && a[at] === b[at]) at++;
  const [x, y] = [a.slice(at), b.slice(at)];
  return (
    x.slice(1) === y.slice(1) ||
    x.slice(1) === y ||
    x === y.slice(1) ||
    (x[0] === y[1] && x[1] === y[0] && x.slice(2) === y.slice(2))
  );
}

const phrasesOf = ({ key, name }) => [wordsOf(name), wordsOf(key)];

/** What /search.json serves: every device with the features known to work on each live ROM */
export function buildIndex({ devices, roms, brands, features }) {
  const entries = devices.map((device) => ({
    name: device.title,
    url: device.url,
    brand: device.brand.key,
    codenames: device.codenames,
    aliases: device.aliases,
    type: device.type ?? 'phone',
    hardware: device.hardware,
    released: device.released,
    unlock: device.bootloader.unlock,
    ended: device.ended,
    roms: Object.fromEntries(
      device.support
        .filter((row) => row.active)
        .map((row) => [
          row.rom.key,
          features.filter(({ key }) => row.cells[key].tone === 'working').map(({ key }) => key),
        ]),
    ),
  }));
  const countOf = (key) =>
    entries.filter((entry) => Object.values(entry.roms).some((works) => works.includes(key)))
      .length;
  return {
    roms: roms.map(({ key, name }) => ({ key, name })),
    brands: brands.map(({ key, name }) => ({ key, name })),
    features: features
      .map(({ key, name }) => ({ key, name, devices: countOf(key) }))
      .filter((feature) => feature.devices > 0),
    devices: entries,
  };
}

/** The index from /search.json, with each device's words and codes worked out once */
export function prepare(index) {
  const vocabulary = new Set();
  const devices = index.devices.map((device) => {
    // An alias with a space is another name, like "Redmi Note 9S", and the rest are model numbers
    const aliases = device.aliases ?? [];
    const isName = (alias) => /\s/.test(alias);
    const words = wordsOf(device.name);
    const otherWords = wordsOf(aliases.filter(isName).join(' '));
    const codes = [...device.codenames, ...aliases.filter((alias) => !isName(alias))].map(compact);
    for (const word of [...words, ...otherWords, ...codes]) vocabulary.add(word);
    return { ...device, words, otherWords, codes, whole: compact(device.name) };
  });
  const withPhrases = (items) => items.map((item) => ({ ...item, phrases: phrasesOf(item) }));
  return {
    ...index,
    devices,
    roms: withPhrases(index.roms),
    features: withPhrases(index.features),
    vocabulary,
  };
}

const spliceOut = (words, phrase) => {
  const at = words.findIndex((_, i) => phrase.every((word, j) => words[i + j] === word));
  if (at < 0) return false;
  words.splice(at, phrase.length);
  return true;
};

/**
 * Splits a query into the words a device's name has to match, and the ROMs and features it names,
 * e.g. "pixel 7 lineage volte". A name that's also part of a device's name only counts on its
 * own, so "5G" is the feature but "Galaxy S20 5G" is a phone
 */
export function readQuery(query, { roms, features, vocabulary }) {
  const words = wordsOf(query);
  const whole = words.join(' ');
  const known = [...vocabulary];
  const halfTyped = (word) => known.some((own) => own.startsWith(word));
  const picks = (items) =>
    items.filter(
      ({ phrases, name }) =>
        phrases.some(
          (phrase) =>
            (phrase.join(' ') === whole || phrase.some((word) => !vocabulary.has(word))) &&
            spliceOut(words, phrase),
        ) ||
        words.some(
          (word, i) =>
            word.length > 3 &&
            compact(name).startsWith(word) &&
            !halfTyped(word) &&
            words.splice(i, 1),
        ),
    );
  return { words, roms: picks(roms), features: picks(features) };
}

/** How well one query word fits a device, or 0 if it doesn't */
function fit(word, { words, otherWords, codes }) {
  if (codes.includes(word)) return 6;
  if (words.includes(word)) return 4;
  if (otherWords.includes(word)) return 3;
  if (words.some((own) => own.startsWith(word))) return 2;
  if (otherWords.some((own) => own.startsWith(word))) return 1;
  if (word.length > 2 && codes.some((code) => code.startsWith(word))) return 1;
  return word.length > 3 && words.some((own) => nearly(word, own)) ? 1 : 0;
}

/** Every word has to fit, unless the whole query is the device's name or a code run together */
function score(words, device) {
  const whole = words.join('');
  if (device.whole === whole || device.codes.includes(whole)) return 100;
  const fits = words.map((word) => fit(word, device));
  if (fits.every(Boolean)) return fits.reduce((sum, points) => sum + points, 0);
  return whole.length > 3 && device.codes.some((code) => code.includes(whole)) ? 5 : 0;
}

/** The ROMs a device runs that fit what a search names, e.g. the ones where VoLTE works */
export const fittingRoms = (device, roms, features) =>
  Object.keys(device.roms).filter(
    (rom) =>
      (!roms.length || roms.includes(rom)) &&
      features.every((feature) => device.roms[rom].includes(feature)),
  );

const supports = (device, roms, features) =>
  roms.every((rom) => rom in device.roms) &&
  (!features.length || fittingRoms(device, roms, features).length >= Math.max(roms.length, 1));

const matchesFilters = (device, filters) =>
  (!filters.brand || device.brand === filters.brand) &&
  (!filters.unlock || device.unlock === filters.unlock) &&
  (!filters.type || device.type === filters.type) &&
  (!filters.hardware || (device.hardware ?? []).includes(filters.hardware)) &&
  (!filters.active || Object.keys(device.roms).length > 0);

/** The best first: closest name, then still supported, then plainest name, most ROMs and newest */
const ranking = (a, b) =>
  b.score - a.score ||
  a.device.ended - b.device.ended ||
  a.size - b.size ||
  Object.keys(b.device.roms).length - Object.keys(a.device.roms).length ||
  (b.device.released ?? 0) - (a.device.released ?? 0);

const startsAny = (words, name) => {
  const own = compact(name);
  return words.some((word) => own === word || (word.length > 2 && own.startsWith(word)));
};

/**
 * Everything that fits a query and the dropdowns: ROMs, brands and features by name, and the
 * devices that fit, best first. A ROM or feature picked from a dropdown counts as if typed
 */
export function search(catalogue, query, filters = {}) {
  const { words, roms, features } = readQuery(query, catalogue);
  const romKeys = [...new Set([...roms.map(({ key }) => key), filters.rom].filter(Boolean))];
  const featureKeys = [
    ...new Set([...features.map(({ key }) => key), filters.works].filter(Boolean)),
  ];
  const asked = wordsOf(query).length > 0 || Object.values(filters).some(Boolean);
  const candidates = catalogue.devices.filter(
    (device) => matchesFilters(device, filters) && supports(device, romKeys, featureKeys),
  );
  const fitting = (text) =>
    candidates
      .map((device) =>
        text.length
          ? { device, score: score(text, device), size: device.words.length }
          : { device, score: 0, size: 0 },
      )
      .filter((hit) => hit.score > 0 || !text.length)
      .sort(ranking)
      .map(({ device }) => device);
  // Halfway through typing a ROM or feature, like "pixel 7 li", the rest still shows
  const last = words.at(-1);
  const typing =
    words.length > 1 &&
    /^[a-z]/.test(last) &&
    [...catalogue.roms, ...catalogue.features].some(({ name }) => compact(name).startsWith(last));
  const full = fitting(words);
  const devices = full.length || !typing ? full : fitting(words.slice(0, -1));

  const pickedOr = (picked, items) => [
    ...new Set([...picked, ...items.filter((item) => startsAny(words, item.name))]),
  ];
  return {
    words,
    roms: pickedOr(roms, catalogue.roms).map(({ key }) => key),
    features: pickedOr(features, catalogue.features).map(({ key }) => key),
    brands: catalogue.brands.filter((brand) => startsAny(words, brand.name)).map(({ key }) => key),
    named: { roms: romKeys, features: featureKeys },
    devices: asked ? devices : [],
  };
}
