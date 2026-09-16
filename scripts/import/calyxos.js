import { parse } from 'yaml';
import { fetchText, report, upsertDevice, writeSupport, withoutBrand } from './lib.js';

const devices = parse(await fetchText('https://gitlab.com/CalyxOS/calyxos.org/-/raw/main/pages/_data/devices.yml'));
const brands = { pixel: 'Google', oneplus: 'OnePlus' };
const brandName = (brand) => brands[brand] ?? brand[0].toUpperCase() + brand.slice(1);

const lists = { upcoming: 'active', modern: 'active', extended: 'active', previous: 'discontinued' };

for (const [list, status] of Object.entries(lists)) {
  for (const codename of devices[`${list}_codenames`]) {
    const { brand, model, android } = devices[codename];
    const active = status === 'active';
    const [name, ...aliases] = model
      .replace(/^The\s+|\s+\(beta\)$/gi, '')
      .split(/\s+and\s+/)
      .map((part) => withoutBrand(part, brandName(brand)));
    const key = upsertDevice(brandName(brand), {
      name,
      codenames: [codename.toLowerCase()],
      aliases,
      ...(active && { bootloader: { relock: 'yes' } }),
    });
    if (!key) continue;

    writeSupport(key, 'calyxos', {
      status,
      android,
      source: 'https://calyxos.org/docs/guide/device-support/',
      install: active ? `https://calyxos.org/install/devices/${codename}/` : undefined,
    });
  }
}

report('calyxos');
