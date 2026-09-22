import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { clone, fetchJson, mapLimit } from '../fetch.js';
import { hardwareOf, typeOf } from '../hardware.js';
import { upsertDevice, withoutBrand } from '../store.js';
import { isoDate } from '../../../src/lib/dates.js';

const DOCS = 'https://doc.e.foundation/devices';
const OTA = 'https://ota.ecloud.global/api/v1';
const channels = { official: 'stable', community: 'community' };

const androidOf = (version) => Number(String(version ?? '').match(/\d+/)?.[0]) || undefined;

const bandsOf = (network) =>
  [network ?? []].flat().map((band) => (band?.tech === '5G' ? '5G NR' : band?.tech));

/** /e/ lists bands as { tech } objects and spells peripherals freehand, so tidy both first */
const hardware = ({ network, peripherals }) =>
  hardwareOf({
    network: bandsOf(network),
    peripherals: [peripherals ?? []].flat().map((item) =>
      /fingerprint/i.test(item) ? 'Fingerprint reader' : /\be-?sim\b/i.test(item) ? 'eSIM' : item,
    ),
  });

/** A device file from the /e/ docs, or null for test builds nobody can download */
export function parseDevice(text) {
  const file = parse(text);
  const { vendor, compatibility = {} } = file;
  const channel = channels[compatibility.release_type];
  if (!channel) return null;

  const codename = String(file.codename);
  const [name, ...aliases] = String(file.name)
    .replace(/[[\]]/g, '')
    .split(/\s+\/\s+/)
    .map((part) => withoutBrand(part, vendor));
  const models = (file.models ?? []).map(String).filter((model) => !/serial number/i.test(model));
  const android = androidOf(file.build_version_stable) ?? androidOf(file.build_version_dev);
  const firmware = file.before_install_args?.version;
  const integrity = String(compatibility.play_integrity ?? '');
  // a userdebug build doesn't count, whatever the bootloader says
  const { bootloader, build_variant: variant } = compatibility;
  const relockable = bootloader === 'lockable' && variant === 'user';
  const source = `${DOCS}/${codename}/`;

  return {
    vendor,
    codename,
    device: {
      name,
      codenames: [codename.toLowerCase()],
      aliases: [...aliases, ...models].filter((alias) => alias !== name),
      released: Number(JSON.stringify(file.release ?? '').match(/\b20\d\d\b/)?.[0]) || undefined,
      soc: file.soc || undefined,
      type: typeOf(file.type),
      hardware: hardware(file),
    },
    row: {
      status: 'active',
      channel,
      ...(android && { android }),
      ...(file.maintainers?.length && { maintainer: file.maintainers.join(', ') }),
      relock: relockable ? 'yes' : 'no',
      ...(firmware && { firmware: String(firmware) }),
      source,
      install: `${source}install/`,
      ...(integrity.startsWith('basic') && {
        features: {
          integrity: /to be confirmed/i.test(integrity)
            ? { status: 'basic', note: 'To be confirmed' }
            : 'basic',
        },
      }),
    },
  };
}

/** Patch level per release and branch from releases.yaml, keyed like `v4.2/A16` */
export function patchLevels(text) {
  const { releases = [] } = parse(text) ?? {};
  return new Map(
    releases.flatMap(({ eos_release, branches = [] }) =>
      branches
        .filter((branch) => /^\d{4}-\d\d$/.test(branch.android_security_bulletin))
        .map(({ branch, android_security_bulletin: bulletin }) => [
          `${eos_release}/${branch}`,
          `${bulletin}-01`,
        ]),
    ),
  );
}

/** Newest build on the newest Android branch, since older branches keep getting builds too */
export function latestBuild({ response = [] }, patches) {
  const [build] = response.toSorted(
    (a, b) => b.android_version - a.android_version || b.datetime - a.datetime,
  );
  if (!build) return undefined;
  const version = String(build.version);
  const patch = patches.get(`v${version}/A${build.android_version}`);
  return {
    android: androidOf(build.android_version),
    latest: {
      version,
      date: isoDate(build.datetime * 1000),
      ...(patch && { patch }),
    },
  };
}

export default async function eos({ previous }) {
  const docs = clone('https://gitlab.e.foundation/e/documentation/user', [
    'data/devices',
    'data/security_updates',
  ]);
  const dir = join(docs, 'data/devices');
  const releases = join(docs, 'data/security_updates/releases.yaml');
  const patches = patchLevels(readFileSync(releases, 'utf8'));
  const found = readdirSync(dir)
    .filter((file) => file.endsWith('.yaml'))
    .map((file) => parseDevice(readFileSync(join(dir, file), 'utf8')))
    .flatMap((entry) => {
      const key = entry && upsertDevice(entry.vendor, entry.device);
      return key ? [{ key, ...entry }] : [];
    });

  const failures = [];
  const devices = {};
  await mapLimit(found, 6, async ({ key, codename, row }) => {
    const feed = row.channel === 'stable' ? 'stable' : 'dev';
    let build = previous[key]?.latest && { latest: previous[key].latest };
    try {
      build = latestBuild(await fetchJson(`${OTA}/${codename}/${feed}/x`), patches);
    } catch (error) {
      failures.push(error.message);
    }
    const { source, install, features, ...head } = row;
    devices[key] = {
      ...head,
      ...(build?.android && { android: build.android }),
      ...(build && { latest: build.latest }),
      source,
      install,
      ...(features && { features }),
    };
  });

  const note = failures.length && `OTA feed failed ${failures.length} times (${failures[0]})`;
  return { devices, ...(note && { note }) };
}
