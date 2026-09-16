import { parse } from 'yaml';
import { fetchText, mapLimit, report, upsertDevice, writeSupport, withoutBrand } from './lib.js';

const paths = [];
const DOCS = 'https://doc.e.foundation/devices';
let page =
  'https://gitlab.e.foundation/api/v4/projects/464/repository/tree?path=data/devices' +
  '&per_page=100&pagination=keyset&order_by=path&sort=asc';
while (page) {
  const response = await fetch(page);
  if (!response.ok) throw new Error(`${response.status} from ${page}`);
  paths.push(
    ...(await response.json()).map((file) => file.path).filter((path) => path.endsWith('.yaml')),
  );
  page = response.headers.get('link')?.match(/<([^>]+)>;\s*rel="next"/)?.[1];
}

const androidOf = (version) => Number(version?.match(/\d+/)?.[0]) || undefined;

await mapLimit(paths, 3, async (path) => {
  const device = parse(
    await fetchText(`https://gitlab.e.foundation/e/documentation/user/-/raw/main/${path}`),
  );
  const { vendor, compatibility = {} } = device;
  const codename = String(device.codename);
  if (compatibility.release_type === 'test') return;

  const [name, ...aliases] = String(device.name)
    .replace(/[[\]]/g, '')
    .split(/\s+\/\s+/)
    .map((part) => withoutBrand(part, vendor));
  const models = (device.models ?? []).map(String).filter((model) => !/serial number/i.test(model));
  const key = upsertDevice(vendor, {
    name,
    codenames: [codename.toLowerCase()],
    aliases: [...aliases, ...models].filter((alias) => alias !== name),
    released: Number(JSON.stringify(device.release ?? '').match(/\b(20\d\d)\b/)?.[1]) || undefined,
    soc: device.soc || undefined,
    ...(compatibility.bootloader === 'lockable' && { bootloader: { relock: 'yes' } }),
  });
  if (!key) return;

  writeSupport(key, 'eos', {
    status: 'active',
    android: androidOf(device.build_version_stable) ?? androidOf(device.build_version_dev),
    maintainer: device.maintainers?.join(', ') || undefined,
    source: `${DOCS}/${codename}/`,
    install: `${DOCS}/${codename}/install/`,
    ...(compatibility.play_integrity === 'basic' && { features: { integrity: 'basic' } }),
  });
});

report('eos');
