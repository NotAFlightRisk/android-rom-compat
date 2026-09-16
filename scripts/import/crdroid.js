import { brandKey, fetchJson, mapLimit, report, stats, upsertDevice, writeSupport, withoutBrand } from './lib.js';

const repo = 'crdroidandroid/android_vendor_crDroidOTA';
const branches = (await fetchJson(`https://api.github.com/repos/${repo}/branches?per_page=100`))
  .map((branch) => branch.name)
  .sort((a, b) => parseFloat(b) - parseFloat(a));

const newest = new Map();
for (const branch of branches) {
  const { tree } = await fetchJson(`https://api.github.com/repos/${repo}/git/trees/${branch}`);
  for (const { path } of tree.filter((file) => file.path.endsWith('.json'))) {
    const codename = path.replace('.json', '');
    if (!newest.has(codename.toLowerCase())) newest.set(codename.toLowerCase(), { codename, branch });
  }
}

await mapLimit([...newest.values()], 5, async ({ codename, branch }) => {
  const build = await fetchJson(`https://raw.githubusercontent.com/${repo}/${branch}/${codename}.json`)
    .then((json) => json.response[0])
    .catch((error) => void stats.skipped.push(`${codename} (${error.message})`));
  if (!build) return;
  const brand = brandKey(build.oem) === 'xiaomi' ? 'Xiaomi' : build.oem;
  const [name, ...aliases] = build.device.split(/\s+[/&]\s+/).map((part) => withoutBrand(part, brand));
  const key = upsertDevice(brand, { name, codenames: [codename.toLowerCase()], aliases });
  if (!key) return;

  writeSupport(key, 'crdroid', {
    status: ['16.0', '15.0'].includes(branch) ? 'active' : 'discontinued',
    android: parseInt(branch),
    maintainer: build.maintainer || undefined,
    source: `https://crdroid.net/downloads#${codename}`,
    install: build.forum?.startsWith('http') ? build.forum : undefined,
  });
});

report('crdroid');
