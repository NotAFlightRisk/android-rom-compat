import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'yaml';
import { loadData } from '../src/lib/data/load.js';
import { check } from '../src/lib/data/check.js';

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
    'NFC partial and Widevine none on the Acme Rocket 2 with TidyOS Plus',
  );

  const tested = { variant: 'plus', android: 15, checked: today, source: ISSUE_URL };
  const reported = { ...tested, build: '2026091000' };
  assert.deepEqual(supportFile('tidyos'), {
    features: {
      widevine: { status: 'none', ...reported },
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
