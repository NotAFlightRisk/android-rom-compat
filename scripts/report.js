import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { Document, parse, parseDocument } from 'yaml';
import { loadData } from '../src/lib/data/load.js';
import { buildModel } from '../src/lib/data/model.js';
import { NEEDS_NOTE, allowedValues } from '../src/lib/data/status.js';
import { isLink, listOf } from '../src/lib/text.js';
import { today } from '../src/lib/dates.js';

const { values: args } = parseArgs({ options: { data: { type: 'string' } } });
const root = args.data ?? fileURLToPath(new URL('../data', import.meta.url));
const form = new URL('../.github/ISSUE_TEMPLATE/report-feature.yml', import.meta.url);
const fields = parse(readFileSync(form, 'utf8')).body.filter((field) => field.id);
const model = buildModel(loadData(root));

const tidy = (text) => String(text).toLowerCase().replace(/\s+/g, ' ').trim();
const sameAs = (query) => (name) => tidy(name) === tidy(query);

function distance(a, b) {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const swap = previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, swap);
    }
    previous = current;
  }
  return previous[b.length];
}

// GitHub writes the form out as "### Label" blocks, with placeholders for skipped fields
function readAnswers(body) {
  const ids = new Map(fields.map((field) => [field.attributes.label, field.id]));
  const answers = body
    .replace(/\r\n/g, '\n')
    .split(/^### /m)
    .slice(1)
    .map((block) => {
      const [label, ...value] = block.split('\n');
      const id = ids.get(label.trim());
      const text = value.join('\n').trim();
      return [id, id === 'notes' ? text : text.replace(/\s+/g, ' ').slice(0, 200)];
    });
  return Object.fromEntries(
    answers.filter(([id, value]) => id && !['_No response_', 'None', ''].includes(value)),
  );
}

function findDevice(query, errors) {
  const names = (device) => [device.name, device.title];
  const device = model.devices.find((entry) =>
    [...names(entry), ...entry.codenames, ...(entry.aliases ?? [])].some(sameAs(query)),
  );
  if (device) return device;
  const gap = (entry) => Math.min(...names(entry).map((name) => distance(tidy(query), tidy(name))));
  const nearest = model.devices.toSorted((a, b) => gap(a) - gap(b)).slice(0, 3);
  const guesses = listOf(nearest.map((entry) => entry.title));
  errors.push(`Couldn't find a device called "${query}". Did you mean ${guesses}?`);
}

function findRom(query, errors) {
  const options = model.roms.flatMap((rom) => [
    { rom, names: [rom.key, rom.name] },
    ...(rom.variants ?? []).map((variant) => ({
      rom,
      variant,
      names: [variant.name, `${rom.name} for ${variant.name}`, `${rom.name} for ${variant.key}`],
    })),
  ]);
  const match = options.find((option) => option.names.some(sameAs(query)));
  if (match) return match;
  const known = listOf(model.roms.map((rom) => rom.name));
  errors.push(`Couldn't find a ROM called "${query}". Try ${known}`);
  return {};
}

function readNotes(text = '') {
  const notes = new Map();
  for (const line of text.split('\n')) {
    const [name, ...rest] = line.replace(/^\s*[-*]\s*/, '').split(':');
    const note = rest.join(':').trim();
    const feature = model.features.find((entry) => [entry.key, entry.name].some(sameAs(name)));
    if (feature && note) notes.set(feature.key, note);
  }
  return notes;
}

function report(answers) {
  const errors = [];
  const device = findDevice(answers.device ?? '', errors);
  const { rom, variant } = findRom(answers.rom ?? '', errors);
  if (device && rom && !device.support.some((row) => row.rom === rom)) {
    errors.push(`${rom.name} isn't listed for the ${device.title}, so there's nothing to add to`);
  }

  const android = Number(answers.android?.match(/\d+/)?.[0]);
  if (!android) errors.push('Android version should be a number, like 16');
  const linked = isLink(answers.source);
  const source = linked ? answers.source : (process.env.ISSUE_URL ?? 'tested');
  const notes = readNotes(answers.notes);
  const reported = model.features.filter((feature) => answers[feature.key]);
  if (!reported.length) errors.push('Pick a status for at least one feature');

  const cells = reported.map((feature) => {
    const status = answers[feature.key];
    const note = notes.get(feature.key);
    if (!allowedValues(feature).includes(status)) {
      errors.push(`${feature.name} should be one of ${listOf(allowedValues(feature))}`);
    }
    if (NEEDS_NOTE.includes(status) && !note) {
      const example = `${feature.name}: what's up`;
      errors.push(`${feature.name} is ${status}, so add a line to Notes like "${example}"`);
    }
    const tested = { variant: variant?.key, android, build: answers.build, checked: today };
    return [feature, { status, note, ...tested, source }];
  });
  if (errors.length) return { errors };

  const file = join(root, 'support', device.key, `${rom.key}.yml`);
  const fresh = !existsSync(file);
  const doc = fresh ? new Document({}) : parseDocument(readFileSync(file, 'utf8'));
  for (const [feature, cell] of cells) {
    const node = doc.createNode(cell);
    node.flow = true;
    doc.setIn(['features', feature.key], node);
  }
  mkdirSync(dirname(file), { recursive: true });
  const hint = fresh ? '# yaml-language-server: $schema=../../../schema/support.json\n' : '';
  writeFileSync(file, hint + doc.toString({ lineWidth: 0 }));

  const statuses = listOf(
    cells.map(([feature, cell]) => `${feature.name} ${cell.status}`),
    'and',
  );
  return { summary: `${statuses} on the ${device.title} with ${variant?.name ?? rom.name}` };
}

// Random delimiter, so nothing in the value can end the block early
const output = (name, value) => {
  const delimiter = `EOF_${randomUUID()}`;
  const target = process.env.GITHUB_OUTPUT;
  if (target) appendFileSync(target, `${name}<<${delimiter}\n${value}\n${delimiter}\n`);
};

const { summary, errors } = report(readAnswers(process.env.ISSUE_BODY ?? ''));
if (errors) {
  const error = errors.map((line) => `- ${line}`).join('\n');
  console.error(error);
  output('error', error);
  process.exitCode = 1;
} else {
  console.log(summary);
  output('summary', summary);
}
