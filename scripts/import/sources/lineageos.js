import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { clone, fetchJson, mapLimit } from '../fetch.js';
import { hardwareOf, typeOf } from '../hardware.js';
import { upsertDevice } from '../store.js';

const WIKI = 'https://wiki.lineageos.org/devices';
const BUILDS = 'https://download.lineageos.org/api/v2/devices';

const quirks = {
  ims: ['volte', 'No IMS on LineageOS here, so whether calls work depends on your carrier'],
  esim: ['esim', "LineageOS can't set up eSIMs on this device, physical SIMs are fine"],
};

/** One entry per codename from the wiki's device files, variants folded into the first */
export function parseWiki(texts) {
  const files = texts
    .map((text) => parse(text))
    .filter((file) => !file.migrated_to)
    .sort((a, b) => (a.variant ?? 0) - (b.variant ?? 0));
  const groups = Map.groupBy(files, (file) => file.codename);
  const codenames = new Set([...groups.keys()].map((codename) => codename.toLowerCase()));
  return [...groups].map(([codename, group]) => parseDevice(codename, group, codenames));
}

function parseDevice(codename, [first, ...variants], codenames) {
  const names = [...new Set([first, ...variants].map((file) => file.name))];
  const models = [first, ...variants].flatMap((file) => file.models ?? []).map(String);
  const aliases = [...names.slice(1), ...models].filter(
    (alias) => !codenames.has(alias.toLowerCase()),
  );
  const source = `${WIKI}/${codename}/`;
  const maintainers = first.maintainers ?? [];
  const branch = Number.parseFloat(first.current_branch);
  const firmware = first.before_install?.version;
  const features = Object.fromEntries(
    (first.quirks ?? [])
      .filter((quirk) => quirks[quirk])
      .map((quirk) => [quirks[quirk][0], { status: 'partial', note: quirks[quirk][1], source }]),
  );

  return {
    vendor: first.vendor,
    device: {
      name: names[0],
      codenames: [codename.toLowerCase()],
      aliases,
      released: Number(String(first.release).slice(0, 4)) || undefined,
      soc: [first.soc].flat().join(' / ') || undefined,
      type: typeOf(first.type),
      hardware: hardwareOf(first),
      bootloader: first.is_unlockable === false ? { unlock: 'no' } : {},
    },
    row: {
      status: maintainers.length ? 'active' : 'discontinued',
      ...(branch && { android: Math.floor(branch) - 7 }),
      ...(maintainers.length && { maintainer: maintainers.join(', ') }),
      relock: 'no',
      ...(firmware && { firmware: String(firmware) }),
      source,
      install: `${source}install/${first.variant ? `variant${first.variant}/` : ''}`,
      ...(Object.keys(features).length && { features }),
    },
  };
}

/** The codename as the wiki spells it, which is what the download servers want */
export const wikiCodename = (row) => row.source.split('/').at(-2);

/** The newest build from a builds response, or undefined when there isn't one */
export function latestBuild(builds) {
  const [build] = builds.toSorted((a, b) => b.datetime - a.datetime);
  if (!build) return undefined;
  const patch = build.files?.[0]?.os_patch_level;
  return { version: build.version, date: build.date, ...(patch && { patch }) };
}

export default async function lineageos({ previous }) {
  const wiki = clone('https://github.com/LineageOS/lineage_wiki', ['_data/devices']);
  const dir = join(wiki, '_data/devices');
  const texts = readdirSync(dir)
    .filter((file) => file.endsWith('.yml'))
    .map((file) => readFileSync(join(dir, file), 'utf8'));

  const found = parseWiki(texts).flatMap(({ vendor, device, row }) => {
    const key = upsertDevice(vendor, device);
    return key ? [{ key, row }] : [];
  });

  const failures = [];
  const devices = {};
  await mapLimit(found, 6, async ({ key, row }) => {
    let latest = previous[key]?.latest;
    if (row.status === 'active') {
      try {
        latest = latestBuild(await fetchJson(`${BUILDS}/${wikiCodename(row)}/builds`));
      } catch (error) {
        failures.push(error.message);
      }
    }
    const { source, install, features, ...head } = row;
    devices[key] = {
      ...head,
      ...(latest && { latest }),
      source,
      install,
      ...(features && { features }),
    };
  });

  const note = failures.length && `builds feed failed ${failures.length} times (${failures[0]})`;
  return { devices, ...(note && { note }) };
}
