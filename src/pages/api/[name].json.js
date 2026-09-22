import { getModel } from '../../lib/data/model.js';

const strip = ({ file, support, ...rest }) => rest;
const known = (cells) =>
  Object.fromEntries(
    Object.entries(cells)
      .filter(([, cell]) => cell.origin !== 'none')
      .map(([key, { tone, ...cell }]) => [key, cell]),
  );

const dumps = {
  devices: ({ devices }) =>
    devices.map(({ brand, title, activeCount, ...device }) => ({
      ...strip(device),
      brand: brand.key,
    })),
  roms: ({ roms }) => roms.map(strip),
  support: ({ support }) =>
    support.map(({ file, device, rom, cells, variants, active, ...row }) => ({
      device: device.key,
      rom: rom.key,
      ...row,
      variants: variants.map(({ key, status, latest, source }) => ({
        key,
        status,
        latest,
        source,
      })),
      cells: known(cells),
    })),
  features: ({ features }) => features,
};

export const getStaticPaths = () => Object.keys(dumps).map((name) => ({ params: { name } }));

export const GET = ({ params }) => Response.json(dumps[params.name](getModel()));
