import { unlockWords } from './facts.js';

export const deviceSearchText = (device) =>
  [device.title, ...device.codenames, ...(device.aliases ?? [])].join(' ').toLowerCase();

/** What FilterBar matches and sorts on, spread onto a device's card and its table row alike */
export const filterData = (device, ended = device.activeCount === 0) => ({
  'data-search': deviceSearchText(device),
  'data-brand': device.brand.key,
  'data-rom': device.support
    .filter((row) => row.active)
    .map((row) => row.rom.key)
    .join(' '),
  'data-unlock': device.bootloader.unlock,
  'data-type': device.type ?? 'phone',
  'data-hardware': device.hardware?.join(' '),
  'data-released': device.released,
  'data-ended': ended ? '' : undefined,
});

const types = { phone: 'Phones', tablet: 'Tablets', handheld: 'Handhelds' };
const hardware = { '5g': 'With 5G', esim: 'With eSIM', nfc: 'With NFC' };

/**
 * FilterBar's dropdowns for a list of devices, with logos for brands and ROMs. Each keeps only
 * the choices that narrow the list, so a page of Pixels that all unlock gets no bootloader dropdown
 */
export function deviceFilters(devices, roms = []) {
  const items = devices.map((device) => filterData(device));
  const narrows = (name, value) => {
    const hits = items.filter((data) =>
      (data[`data-${name}`] ?? '').split(' ').includes(value),
    ).length;
    return hits > 0 && hits < items.length;
  };
  const brands = [...new Set(devices.map((device) => device.brand))]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((brand) => [brand.key, brand.name]);
  return [
    ['brand', 'Brand', 'All brands', brands, 'brands'],
    ['rom', 'ROM', 'Any ROM', roms.map((rom) => [rom.key, rom.name]), 'roms'],
    ['unlock', 'Bootloader', 'Any bootloader', Object.entries(unlockWords)],
    ['type', 'Type', 'All devices', Object.entries(types)],
    ['hardware', 'Hardware', 'Any hardware', Object.entries(hardware)],
  ]
    .map(([name, label, any, options, logos]) => ({
      name,
      label,
      any,
      logos,
      options: options.filter(([value]) => narrows(name, value)),
    }))
    .filter(({ options }) => options.length > 0);
}
