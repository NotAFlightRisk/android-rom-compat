import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { parse } from 'yaml';

const logos = (kind) =>
  readdirSync(`src/assets/logos/${kind}`).map((file) => [file.replace(/\.svg$/, ''), file]);

test('every logo is named after a brand or ROM, so none silently falls back to initials', () => {
  const brands = new Set(parse(readFileSync('data/brands.yml', 'utf8')).map(({ key }) => key));
  const roms = new Set(readdirSync('data/roms').map((file) => file.replace(/\.yml$/, '')));
  for (const [key, file] of logos('brands')) assert.ok(brands.has(key), `brands/${file}`);
  for (const [key, file] of logos('roms')) assert.ok(roms.has(key), `roms/${file}`);
});

test('logos are plain single-colour marks with a viewBox and nothing that runs', () => {
  for (const kind of ['brands', 'roms']) {
    for (const [, file] of logos(kind)) {
      const svg = readFileSync(`src/assets/logos/${kind}/${file}`, 'utf8');
      assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="[\d. -]+">/, file);
      assert.doesNotMatch(svg, /script|foreignObject|href|\son\w+=|style=/i, file);
    }
  }
});
