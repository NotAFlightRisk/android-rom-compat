import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const BROWSER_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';

const token = process.env.GITHUB_TOKEN;
const githubHosts = ['https://api.github.com/', 'https://raw.githubusercontent.com/'];
const BACKOFF = 500;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchText(url, { headers = {}, tries = 5 } = {}) {
  const sent = { 'user-agent': 'android-rom-compat importer', ...headers };
  if (token && githubHosts.some((host) => url.startsWith(host)))
    sent.authorization = `Bearer ${token}`;
  const again = async (wait) => {
    await sleep(wait);
    return fetchText(url, { headers, tries: tries - 1 });
  };

  let response;
  try {
    response = await fetch(url, { headers: sent });
  } catch (error) {
    if (tries <= 1) throw error;
    return again(BACKOFF);
  }
  if (tries > 1) {
    if (response.status === 429)
      return again((Number(response.headers.get('retry-after')) || 10) * 1000);
    if (response.status >= 500) return again(BACKOFF);
  }
  if (!response.ok) {
    throw Object.assign(new Error(`${response.status} from ${url}`), { status: response.status });
  }
  return response.text();
}

export const fetchJson = async (url, options) => JSON.parse(await fetchText(url, options));

/** Runs an async function over items, a few at a time, so nobody's server gets hammered */
export async function mapLimit(items, limit, run) {
  const results = [];
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await run(items[i], i).catch((error) => {
        next = items.length;
        throw error;
      });
    }
  };
  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

let scratch;

/** Sparse, blobless clone of just the paths we read, since the wikis are mostly images */
export function clone(repo, paths) {
  if (!scratch) {
    scratch = mkdtempSync(join(tmpdir(), 'rom-import-'));
    process.once('exit', () => rmSync(scratch, { recursive: true, force: true }));
  }
  const dir = mkdtempSync(join(scratch, 'repo-'));
  const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' });
  git('clone', '--depth', '1', '--filter=blob:none', '--sparse', repo, '.');
  git('sparse-checkout', 'set', ...paths);
  return dir;
}
