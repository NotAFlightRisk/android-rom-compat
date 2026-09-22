import { fetchText, mapLimit } from '../fetch.js';
import { upsertDevice } from '../store.js';
import { isoDate } from '../../../src/lib/dates.js';

const SITE = 'https://raw.githubusercontent.com/GrapheneOS/grapheneos.org/main/static';

const pixel = {
  unlock: 'conditional',
  notes: "Carrier models, like Verizon's, can't be unlocked.",
};

export const parseSupported = (installer) =>
  installer.match(/supportedDevices\s*=\s*\[([^\]]*)\]/)[1].match(/[a-z0-9]+/g);

export const parseAndroid = (releases) =>
  Number(releases.match(/initial release of GrapheneOS based on Android (\d+)/)[1]);

const named = /((?:Pixel|Nexus|Samsung Galaxy)[\w ]*?(?: \(5G\))?) \((?:<code>)?([a-z0-9]+)(?:<\/code>)?\)/g;
/** Codename -> name for every device the FAQ has ever mentioned */
export const parseNamed = (faq) =>
  new Map([...faq.matchAll(named)].map(([, name, codename]) => [codename, name]));

/** `2026091000 1789042775 tegu stable` from releases.grapheneos.org */
export function parseBuild(text) {
  const [version, time] = text.trim().split(/\s+/);
  return { version, date: isoDate(Number(time) * 1000) };
}

/** Brand, device and row for each device the FAQ names, latest being codename -> build */
export function parse({ installer, faq, releases, latest = {} }) {
  const supported = parseSupported(installer);
  const android = parseAndroid(releases);
  return [...parseNamed(faq)].map(([codename, fullName]) => {
    const active = supported.includes(codename);
    const [brand, name] = fullName.startsWith('Samsung ')
      ? ['Samsung', fullName.slice(8)]
      : ['Google', fullName.replace(' (5G)', ' 5G')];
    const bootloader = name.startsWith('Pixel') ? pixel : {};
    const device = { name, codenames: [codename], bootloader };
    const row = {
      status: active ? 'active' : 'discontinued',
      channel: 'stable',
      ...(active && { android }),
      maintainer: 'GrapheneOS',
      ...(brand === 'Google' && { relock: 'yes' }),
      ...(latest[codename] && { latest: latest[codename] }),
      source: 'https://grapheneos.org/faq#supported-devices',
      ...(active && { install: 'https://grapheneos.org/install/web' }),
    };
    return { brand, device, row };
  });
}

export default async function grapheneos({ previous }) {
  const [installer, faq, releases] = await Promise.all([
    fetchText(`${SITE}/js/web-install.js`),
    fetchText(`${SITE}/faq.html`),
    fetchText('https://grapheneos.org/releases'),
  ]);

  const latest = {};
  await mapLimit([...parseNamed(faq).keys()], 5, async (codename) => {
    latest[codename] = await fetchText(`https://releases.grapheneos.org/${codename}-stable`)
      .then(parseBuild)
      .catch(() => previous[codename]?.latest);
  });

  const devices = {};
  for (const { brand, device, row } of parse({ installer, faq, releases, latest })) {
    const key = upsertDevice(brand, device);
    if (key) devices[key] = row;
  }
  return { devices };
}
