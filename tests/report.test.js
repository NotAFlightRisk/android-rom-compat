import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'yaml';
import { loadData } from '../src/lib/data/load.js';
import { check } from '../src/lib/data/check.js';
import { allowedValues } from '../src/lib/data/status.js';
import { reportUrl } from '../src/lib/table.js';

const ISSUE_URL = 'https://github.com/NotAFlightRisk/android-rom-compat/issues/7';
const today = new Date().toISOString().slice(0, 10);

// Runs the script over a scratch copy of the good fixture, like the workflow would
function report(t, issue) {
  const dir = mkdtempSync(join(tmpdir(), 'report-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const data = join(dir, 'data');
  const outputs = join(dir, 'outputs');
  cpSync('tests/fixtures/good', data, { recursive: true });

  const env = {
    ...process.env,
    ISSUE_BODY: readFileSync(`tests/fixtures/issues/${issue}.md`, 'utf8'),
    ISSUE_URL,
    GITHUB_OUTPUT: outputs,
  };
  const run = spawnSync(process.execPath, ['scripts/report.js', '--data', data], { env });
  const written = existsSync(outputs) ? readFileSync(outputs, 'utf8') : '';
  const blocks = written.matchAll(/^(\w+)<<(\S+)\n([\s\S]*?)\n\2$/gm);
  const output = Object.fromEntries([...blocks].map(([, name, , value]) => [name, value]));
  const supportFile = (rom) =>
    parse(readFileSync(join(data, 'support/rocket', `${rom}.yml`), 'utf8'));
  return { status: run.status, output, data, supportFile };
}

test('a good report merges into the support file and still validates', (t) => {
  const { status, output, data, supportFile } = report(t, 'good');
  assert.equal(status, 0);
  assert.equal(
    output.summary,
    'NFC partial and Widevine unsupported on the Acme Rocket 2 with TidyOS Plus',
  );

  const tested = { variant: 'plus', android: 15, checked: today, source: ISSUE_URL };
  const reported = { ...tested, build: '2026091000' };
  assert.deepEqual(supportFile('tidyos'), {
    features: {
      widevine: { status: 'unsupported', ...reported },
      push: { ...tested, status: 'working', checked: '2026-01-10', source: 'tested' },
      nfc: { status: 'partial', note: "Tags work, payments don't", ...reported },
    },
  });
  assert.deepEqual(check(loadData(data)), []);
});

test('an unknown device fails with the nearest names and writes nothing', (t) => {
  const { status, output, supportFile } = report(t, 'unknown-device');
  assert.equal(status, 1);
  assert.match(output.error, /device called "Rocket 3"\. Did you mean Acme Rocket 2\?/);
  assert.equal(output.summary, undefined);
  assert.deepEqual(Object.keys(supportFile('tidyos').features), ['widevine', 'push']);
});

test('partial or broken without a note fails, naming only the feature missing one', (t) => {
  const { status, output } = report(t, 'partial-no-note');
  assert.equal(status, 1);
  assert.match(output.error, /VoLTE is partial, so add a line to Notes/);
  assert.doesNotMatch(output.error, /NFC/);
});

test("report links fill in the form's own fields", () => {
  const form = parse(readFileSync('.github/ISSUE_TEMPLATE/report-feature.yml', 'utf8'));
  const ids = new Set(form.body.map((field) => field.id));
  const device = { key: 'rocket', title: 'Acme Rocket' };
  const link = new URL(reportUrl(device, { rom: { name: 'TidyOS' }, android: 16 }));
  const { template, title, ...fields } = Object.fromEntries(link.searchParams);
  assert.equal(template, 'report-feature.yml');
  assert.equal(title, '[Report]: Acme Rocket (rocket) on TidyOS');
  assert.deepEqual(fields, { device: 'rocket', rom: 'TidyOS', android: '16' });
  assert.ok(Object.keys(fields).every((id) => ids.has(id)));
  assert.deepEqual(
    [...new URL(reportUrl(device)).searchParams.keys()],
    ['template', 'title', 'device'],
  );
});

test("the form offers each feature's own values, never the None GitHub keeps for blanks", () => {
  const form = parse(readFileSync('.github/ISSUE_TEMPLATE/report-feature.yml', 'utf8'));
  const features = parse(readFileSync('data/features.yml', 'utf8'));
  const dropdowns = form.body.filter((field) => field.type === 'dropdown');
  assert.deepEqual(
    dropdowns.map((field) => field.id),
    features.map((feature) => feature.key),
  );
  for (const [i, { id, attributes }] of dropdowns.entries()) {
    const options = allowedValues(features[i]).filter((value) => value !== 'unknown');
    assert.deepEqual(attributes.options, options, id);
    assert.ok(!options.some((option) => /^none$/i.test(option)), id);
  }
});
