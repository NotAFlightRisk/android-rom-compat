import { readdirSync, writeFileSync } from 'node:fs';
import { readUpstream, stats, writeUpstream } from './store.js';

const first = ['lineageos', 'eos'];
const sources = readdirSync(new URL('./sources/', import.meta.url))
  .map((file) => file.replace(/\.js$/, ''))
  .sort();
const available = [...first, ...sources.filter((name) => !first.includes(name))];
const force = process.argv.includes('--force');
const picked = process.argv.slice(2).filter((arg) => arg !== '--force');
const names = picked.length ? available.filter((name) => picked.includes(name)) : available;

const upstream = {};
const lines = [];
for (const name of names) {
  try {
    const { default: run } = await import(`./sources/${name}.js`);
    const rowsOf = (source) => upstream[source] ?? readUpstream(source).devices ?? {};
    const ctx = { previous: rowsOf(name), rowsOf };
    const { devices, note } = await run(ctx);
    const { rows, added, ended } = writeUpstream(name, devices, {
      schema: name === 'stock' ? 'stock' : 'upstream',
      force,
    });
    upstream[name] = devices;
    lines.push(
      `${name}: ok, ${rows} rows (${added} new, ${ended} ended)${note ? `, ${note}` : ''}`,
    );
  } catch (error) {
    lines.push(`${name}: FAILED, ${error.message}`);
  }
  console.log(lines.at(-1));
}

lines.push('', `${stats.devices} new devices`, ...stats.skipped.map((line) => `skipped ${line}`));
writeFileSync('import-summary.md', `${lines.join('\n')}\n`);
if (names.length && lines.filter((line) => line.includes(': FAILED,')).length === names.length) {
  process.exitCode = 1;
}
