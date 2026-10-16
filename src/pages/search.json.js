import { getModel } from '../lib/data/model.js';

const working = (row, features) =>
  features.filter(({ key }) => row.cells[key].tone === 'working').map(({ key }) => key);

/** Everything /search/ looks through, small enough to search in the browser */
export const GET = () => {
  const { devices, roms, brands, features } = getModel();
  return Response.json({
    roms: roms.map(({ key, name }) => ({ key, name })),
    brands: brands.map(({ key, name }) => ({ key, name })),
    features: features.map(({ key, name }) => ({ key, name })),
    devices: devices.map((device) => ({
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
          .map((row) => [row.rom.key, working(row, features)]),
      ),
    })),
  });
};
