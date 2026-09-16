import { fetchText, report, upsertDevice, writeSupport } from './lib.js';

const SITE = 'https://raw.githubusercontent.com/GrapheneOS/grapheneos.org/main/static';
const [installer, faq, releases] = await Promise.all([
  fetchText(`${SITE}/js/web-install.js`),
  fetchText(`${SITE}/faq.html`),
  fetchText('https://grapheneos.org/releases'),
]);

const supported = installer.match(/supportedDevices\s*=\s*\[([^\]]*)\]/)[1].match(/[a-z0-9]+/g);
const android = Number(releases.match(/initial release of GrapheneOS based on Android (\d+)/)[1]);
const named = new Map(
  [...faq.matchAll(/((?:Pixel|Nexus|Samsung Galaxy)[\w ]*?(?: \(5G\))?) \((?:<code>)?([a-z0-9]+)(?:<\/code>)?\)/g)]
    .map(([, name, codename]) => [codename, name]),
);

// Carrier Pixels stay locked, but every GrapheneOS Pixel relocks once it's installed
const pixel = { unlock: 'conditional', relock: 'yes', notes: "Carrier models, like Verizon's, can't be unlocked." };

for (const [codename, fullName] of named) {
  const active = supported.includes(codename);
  const [brand, name] = fullName.startsWith('Samsung ')
    ? ['Samsung', fullName.slice(8)]
    : ['Google', fullName.replace(' (5G)', ' 5G')];
  const key = upsertDevice(brand, {
    name,
    codenames: [codename],
    bootloader: name.startsWith('Pixel') ? pixel : {},
  });
  if (!key) continue;
  writeSupport(key, 'grapheneos', {
    status: active ? 'active' : 'discontinued',
    android: active ? android : undefined,
    maintainer: 'GrapheneOS',
    source: 'https://grapheneos.org/faq#supported-devices',
    install: active ? 'https://grapheneos.org/install/web' : undefined,
  });
}

report('grapheneos');
