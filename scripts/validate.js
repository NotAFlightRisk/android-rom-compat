import { parseArgs } from 'node:util';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadData } from '../src/lib/data/load.js';
import { check, fileCount } from '../src/lib/data/check.js';

const { values: args } = parseArgs({
  options: { file: { type: 'string' }, data: { type: 'string' } },
});
const data = loadData(args.data ?? fileURLToPath(new URL('../data', import.meta.url)));
const problems = check(data).filter(
  (problem) => !args.file || resolve(problem.file) === resolve(args.file),
);

const byFile = Map.groupBy(problems, (problem) => relative(process.cwd(), problem.file));
for (const [file, list] of byFile) {
  console.log(`✗ ${file}`);
  for (const { path, message } of list) {
    const line = `${path ? `${path}: ` : ''}${message}`;
    console.log(`  ${line}`);
    if (process.env.GITHUB_ACTIONS) console.log(`::error file=${file}::${line}`);
  }
}

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;
if (problems.length) {
  console.log(`\n${plural(problems.length, 'problem')} in ${plural(byFile.size, 'file')}`);
  process.exitCode = 1;
} else {
  console.log(
    `✓ ${args.file ?? `All ${plural(fileCount(data), 'file')}`} look${args.file ? 's' : ''} good`,
  );
}
