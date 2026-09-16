import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { getModel } from './src/lib/data/model.js';
import { site } from './src/lib/site.js';

const { devices, roms, brands } = getModel();
const latest = (rows) =>
  rows
    .map((row) => row.verified)
    .sort()
    .at(-1);

const lastChecked = new Map([
  ...devices.map((device) => [device.url, latest(device.support)]),
  ...roms.map((rom) => [rom.url, latest(rom.support)]),
  ...brands.map((brand) => [brand.url, latest(brand.devices.flatMap((device) => device.support))]),
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
        const lastmod = lastChecked.get(new URL(item.url).pathname);
        return lastmod ? { ...item, lastmod } : item;
      },
    }),
  ],
});
