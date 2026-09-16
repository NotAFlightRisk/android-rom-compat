import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../src/lib/data/load.js';
import { check } from '../src/lib/data/check.js';

const problemsIn = (fixture) =>
  check(loadData(`tests/fixtures/${fixture}`)).map(
    ({ file, path, message }) =>
      `${file.split(`/${fixture}/`)[1]} ${path ? `${path}: ` : ''}${message}`,
  );

const bad = problemsIn('bad');
const expectProblem = (pattern) =>
  assert.ok(
    bad.some((line) => pattern.test(line)),
    `nothing matched ${pattern}\n${bad.join('\n')}`,
  );

test('clean data has no problems', () => {
  assert.deepEqual(problemsIn('good'), []);
});

test('broken YAML is reported instead of crashing', () => {
  expectProblem(/^roms\/broken\.yml this file won't parse/);
  expectProblem(/^devices\/acme\/loop\.yml this file has an anchor that points back at itself/);
});

test('schema errors read like English', () => {
  expectProblem(
    /rocket\.yml bootloader\.unlock: "maybe" isn't allowed\. Use yes, no, conditional or unknown/,
  );
  expectProblem(/comet\.yml bootloader\.notes: is missing/);
  expectProblem(/verified: "2026-02-30" isn't a real date/);
});

test('codenames, aliases and web addresses must be unique', () => {
  expectProblem(/rocket\.yml codenames\[0\]: "rocket_eea" should match the file name/);
  expectProblem(/rocket\.yml aliases\[0\]: "rk-2" is already used/);
  expectProblem(/rocket\.yml name: same web address/);
});

test('files must point at a real brand, device and ROM', () => {
  expectProblem(/nope\/acme\.yml brand folder "nope" isn't in/);
  expectProblem(/ghost\/tidyos\.yml there's no device with the codename "ghost"/);
  expectProblem(/rocket\/missingos\.yml there's no ROM called "missingos"/);
  expectProblem(/^roms\/nested\/deep\.yml ROMs live at data\/roms/);
});

test('feature values are checked against features.yml', () => {
  expectProblem(/features\.nfc: "partial" needs a note/);
  expectProblem(/features\.widevine: "L2" isn't allowed/);
  expectProblem(/features\.jetpack: "jetpack" isn't a feature/);
  expectProblem(/hardware\[1\]: "lasers" isn't used by any feature/);
});
