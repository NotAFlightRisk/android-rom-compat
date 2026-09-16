import { parse } from 'yaml';
import { fetchJson, fetchText, mapLimit, report, upsertDevice, writeSupport } from './lib.js';

const WIKI = 'https://wiki.lineageos.org/devices';
const RAW = 'https://raw.githubusercontent.com/LineageOS/lineage_wiki/main';

const { tree } = await fetchJson('https://api.github.com/repos/LineageOS/lineage_wiki/git/trees/main?recursive=1');
const paths = tree.map((item) => item.path).filter((path) => /^_data\/devices\/[^/]+\.yml$/.test(path));
const files = await mapLimit(paths, 8, async (path) => parse(await fetchText(`${RAW}/${path}`)));

const byCodename = Map.groupBy(
  files.filter((file) => !file.migrated_to).sort((a, b) => (a.variant ?? 0) - (b.variant ?? 0)),
  (file) => file.codename,
);

const codenames = new Set([...byCodename.keys()].map((codename) => codename.toLowerCase()));

for (const [codename, [first, ...variants]] of byCodename) {
  const names = [...new Set([first, ...variants].map((file) => file.name))];
  const models = [first, ...variants].flatMap((file) => file.models ?? []).map(String);
  const aliases = [...names.slice(1), ...models].filter((alias) => !codenames.has(alias.toLowerCase()));
  const key = upsertDevice(first.vendor, {
    name: names[0],
    codenames: [codename.toLowerCase()],
    aliases,
    released: Number(String(first.release).slice(0, 4)) || undefined,
    soc: [first.soc].flat().join(' / ') || undefined,
    bootloader: first.is_unlockable === false ? { unlock: 'no' } : {},
  });
  if (!key) continue;

  const maintainers = first.maintainers ?? [];
  const branch = Number.parseFloat(first.current_branch);
  writeSupport(key, 'lineageos', {
    status: maintainers.length ? 'active' : 'discontinued',
    android: branch ? Math.floor(branch) - 7 : undefined,
    maintainer: maintainers.join(', ') || undefined,
    source: `${WIKI}/${codename}/`,
    install: `${WIKI}/${codename}/install/${first.variant ? `variant${first.variant}/` : ''}`,
  });
}

report('lineageos');
