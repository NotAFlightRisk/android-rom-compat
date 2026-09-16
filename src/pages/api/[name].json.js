import { getModel } from '../../lib/data/model.js';

const strip = ({ file, support, url, ...rest }) => rest;

const dumps = {
  devices: ({ devices }) =>
    devices.map(({ brand, title, activeCount, ...device }) => ({
      ...strip(device),
      brand: brand.key,
    })),
  roms: ({ roms }) => roms.map(strip),
  support: ({ support }) =>
    support.map(({ file, device, rom, cells, active, ...row }) => ({
      device: device.key,
      rom: rom.key,
      ...row,
    })),
  features: ({ features }) => features,
};

export const getStaticPaths = () => Object.keys(dumps).map((name) => ({ params: { name } }));

export const GET = ({ params }) => Response.json(dumps[params.name](getModel()));
