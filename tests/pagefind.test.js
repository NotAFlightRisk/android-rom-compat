import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const astroFiles = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return astroFiles(path);
    return path.endsWith('.astro') ? [path] : [];
  });

const outputPattern = (file) =>
  file
    .replace(/^src\/pages\//, '')
    .replace(/\.astro$/, '')
    .split('/')
    .map((segment) => (segment.startsWith('[') ? '*' : segment))
    .concat('index.html')
    .join('/');

const scannedPatterns = () => {
  const { build } = JSON.parse(readFileSync('package.json', 'utf8')).scripts;
  const [, glob] = build.match(/--glob "([^"]+)"/);
  const [, alternatives, suffix] = glob.match(/^\{([^}]+)\}(.*)$/);
  return alternatives.split(',').map((alternative) => `${alternative}${suffix}`);
};

test('pagefind scans exactly the pages that carry data-pagefind-body', () => {
  const searchable = astroFiles('src/pages')
    .filter((file) => readFileSync(file, 'utf8').includes('data-pagefind-body'))
    .map(outputPattern);

  assert.ok(searchable.length > 0, 'no page carries data-pagefind-body any more');
  assert.deepEqual([...new Set(searchable)].sort(), scannedPatterns().sort());
});
