import { fetchJson, mapLimit } from '../fetch.js';
import { wikiCodename } from './lineageos.js';

const SITE = 'https://download.lineage.microg.org';

/** A row from a microG builds response, or undefined when there are no builds */
export function parseBuilds(builds, codename) {
  const [build] = builds.toSorted((a, b) => b.datetime - a.datetime);
  if (!build) return undefined;
  const [file] = build.files;
  const version = build.version ?? file.filename.match(/^lineage-([\d.]+)-/)?.[1];
  const latest = {
    ...(version && { version }),
    date: new Date(build.datetime * 1000).toISOString().slice(0, 10),
    ...(file.os_patch_level && { patch: file.os_patch_level }),
  };
  return { status: 'active', latest, source: `${SITE}/${codename}/` };
}

export default async function lineageosMicrog({ previous, rowsOf }) {
  const active = Object.entries(rowsOf('lineageos')).filter(([, row]) => row.status === 'active');
  const failures = [];
  const devices = {};
  await mapLimit(active, 6, async ([key, row]) => {
    const codename = wikiCodename(row);
    try {
      const builds = await fetchJson(`${SITE}/api/v2/devices/${codename}/builds`);
      const found = parseBuilds(builds, codename);
      if (found) devices[key] = found;
    } catch (error) {
      if (error.status === 404) return;
      failures.push(error.message);
      if (previous[key]) devices[key] = previous[key];
    }
  });

  const note = failures.length && `builds feed failed ${failures.length} times (${failures[0]})`;
  return { devices, ...(note && { note }) };
}
