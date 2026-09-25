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
  expectProblem(/imported: "2026-02-30" isn't a real date/);
});

test('a brand policy has to say where it came from', () => {
  expectProblem(/^brands\.yml \[0\]\.bootloader\.source: is missing/);
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
  expectProblem(/^upstream\/tidyos\.yml devices\.nobody: there's no device/);
});

test('feature values are checked against features.yml', () => {
  expectProblem(/features\.nfc: "partial" needs a note/);
  expectProblem(/features\.widevine: "L2" isn't allowed/);
  expectProblem(/features\.jetpack: "jetpack" isn't a feature/);
  expectProblem(/hardware\[1\]: "lasers" isn't used by any feature/);
});

test('support files only hold features when an importer covers the device', () => {
  expectProblem(/^support\/comet\/tidyos\.yml status: comes from data\/upstream\/tidyos\.yml/);
  expectProblem(/^support\/rocket\/tidyos\.yml status: is missing/);
});

test('ROM features need a source, and variants must exist', () => {
  expectProblem(/^roms\/tidyos\.yml features\.push\.source: is missing/);
  expectProblem(/^upstream\/tidyos-nope\.yml tidyos has no "nope" build/);
  expectProblem(/features\.volte\.variant: there's no "turbo" build/);
});

test('ROM and variant keys stay hyphen-free, so imports split on the right one', () => {
  expectProblem(/^roms\/proton-aosp\.yml "proton-aosp" can only use lowercase letters/);
  expectProblem(/^roms\/tidyos\.yml variants\[0\]\.key: "turbo-x" can only use lowercase letters/);
});

test('a codename can never be a brand name, wherever it is in the list', () => {
  expectProblem(/rocket\.yml codenames\[2\]: "tidy" is a brand name/);
});

test('builds from the future are caught', () => {
  expectProblem(/devices\.comet\.latest\.date: can't be in the future/);
});
