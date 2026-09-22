import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { getModel } from './src/lib/data/model.js';
import { getData } from './src/lib/data/load.js';
import { site } from './src/lib/site.js';

const data = getData();
const { devices, roms, brands } = getModel();
const imported = new Map(data.upstream.map((file) => [file.name, file.data.imported]));
const newest = (dates) => dates.filter(Boolean).sort().at(-1);
const lastmodOf = (rows) =>
  newest(rows.map((row) => row.latest?.date)) ??
  newest(rows.map((row) => imported.get(row.rom.key)));

const lastChanged = new Map([
  ...devices.map((device) => [device.url, lastmodOf(device.support)]),
  ...roms.map((rom) => [rom.url, lastmodOf(rom.support)]),
  ...brands.map((brand) => [
    brand.url,
    lastmodOf(brand.devices.flatMap((device) => device.support)),
  ]),
]);

const codenameRedirects = Object.fromEntries(
  devices.flatMap((device) =>
    device.codenames.map((codename) => [`/devices/${codename}/`, device.url]),
  ),
);

export default defineConfig({
  site: site.url,
  trailingSlash: 'always',
  redirects: codenameRedirects,
  vite: { build: { assetsInlineLimit: 0 } },
  integrations: [
    sitemap({
      serialize: (item) => {
        const lastmod = lastChanged.get(new URL(item.url).pathname);
        return lastmod ? { ...item, lastmod } : item;
      },
    }),
  ],
});
