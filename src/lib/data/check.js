import { readFileSync } from 'node:fs';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { slugify, listOf } from '../text.js';
import { explain, pathOf } from './explain.js';
import { NEEDS_NOTE, allowedValues, cellValue } from './status.js';

const SCHEMAS = ['brands', 'features', 'rom', 'device', 'upstream', 'stock', 'support'];
const ajv = addFormats(new Ajv({ allErrors: true, verbose: true }));
for (const name of SCHEMAS) {
  ajv.addSchema(
    JSON.parse(readFileSync(new URL(`../../../schema/${name}.json`, import.meta.url), 'utf8')),
  );
}
const schemas = Object.fromEntries(SCHEMAS.map((name) => [name, ajv.getSchema(`${name}.json`)]));

/** The first schema problem in a value, or undefined when it's fine */
export function schemaProblem(schema, value) {
  if (schemas[schema](value)) return undefined;
  const [error] = schemas[schema].errors;
  return `${pathOf(error.instancePath) || 'file'} ${explain(error)}`;
}

const strings = (value) =>
  Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Runs every rule over the loaded data and returns a flat list of problems */
export function check(data) {
  const problems = [...data.errors];
  const report = (file, path, message) => problems.push({ file, path, message });

  const validate = (schema, { file, data: value }) => {
    if (schemas[schema](value)) return true;
    const seen = new Set();
    for (const error of schemas[schema].errors) {
      if (error.keyword === 'if' || error.schemaPath.includes('/anyOf/')) continue;
      const path = pathOf(error.instancePath, error.params.missingProperty);
      const message = explain(error);
      if (!seen.has(path + message)) report(file, path, message);
      seen.add(path + message);
    }
    return false;
  };

  const keyed = (schema, record, label) => {
    validate(schema, record);
    const items = new Map();
    for (const item of Array.isArray(record.data) ? record.data : []) {
      if (typeof item?.key !== 'string') continue;
      if (items.has(item.key))
        report(record.file, item.key, `${label} "${item.key}" is listed twice`);
      items.set(item.key, item);
    }
    return items;
  };

  const brands = keyed('brands', data.brands, 'brand');
  const features = keyed('features', data.features, 'feature');
  const hardware = new Set([...features.values()].map((feature) => feature.requires));

  for (const rom of data.roms) {
    if (rom.misplaced) report(rom.file, '', 'ROMs live at data/roms/<rom>.yml');
    else validate('rom', rom);
  }
  const roms = new Map(
    data.roms
      .filter((rom) => !rom.misplaced && isObject(rom.data))
      .map((rom) => [rom.key, rom.data]),
  );

  const names = new Map();
  const slugs = new Map();
  const claim = (id, file, path) => {
    const owner = names.get(id);
    if (owner && owner !== file) report(file, path, `"${id}" is already used by ${owner}`);
    else names.set(id, file);
  };

  for (const device of data.devices) {
    const { file, brand, key } = device;
    if (device.misplaced) {
      report(file, '', 'devices live at data/devices/<brand>/<codename>.yml');
      continue;
    }
    if (!brands.has(brand)) report(file, '', `brand folder "${brand}" isn't in data/brands.yml`);
    if (brands.has(key)) report(file, '', `"${key}" is a brand name, so it can't be a codename`);
    validate('device', device);

    const { name, slug, ...fields } = isObject(device.data) ? device.data : {};
    const codenames = strings(fields.codenames);
    if (codenames.length && codenames[0] !== key) {
      report(file, 'codenames[0]', `"${codenames[0]}" should match the file name "${key}"`);
    }
    codenames.forEach((codename, i) => claim(codename, file, `codenames[${i}]`));
    strings(fields.aliases).forEach((alias, i) =>
      claim(alias.toLowerCase(), file, `aliases[${i}]`),
    );
    strings(fields.hardware).forEach((item, i) => {
      if (!hardware.has(item)) {
        report(file, `hardware[${i}]`, `"${item}" isn't used by any feature in data/features.yml`);
      }
    });

    if (typeof name !== 'string') continue;
    const url = `${brand}/${slug ?? slugify(name)}`;
    if (slugs.has(url)) report(file, 'name', `same web address as ${slugs.get(url)}, add a slug`);
    slugs.set(url, file);
  }

  const primaries = new Set(data.devices.map((device) => device.key));
  const today = new Date().toISOString().slice(0, 10);

  const checkCells = (file, prefix, cells, rom) => {
    for (const [key, raw] of Object.entries(isObject(cells) ? cells : {})) {
      const feature = features.get(key);
      const path = `${prefix}.${key}`;
      if (!feature) {
        report(file, path, `"${key}" isn't a feature in data/features.yml`);
        continue;
      }
      const { value, note, variant } = cellValue(raw);
      if (variant && !rom?.variants?.some((known) => known.key === variant)) {
        report(file, `${path}.variant`, `there's no "${variant}" build listed for this ROM`);
      }
      if (typeof value !== 'string') continue;
      const allowed = allowedValues(feature);
      if (!allowed.includes(value)) {
        report(file, path, `"${value}" isn't allowed. Use ${listOf(allowed)}`);
      } else if (NEEDS_NOTE.includes(value) && !note) {
        report(file, path, `"${value}" needs a note, e.g. { status: ${value}, note: ... }`);
      }
    }
  };

  for (const [key, rom] of roms) {
    const file = data.roms.find((entry) => entry.key === key).file;
    checkCells(file, 'features', rom.features, rom);
    (rom.variants ?? []).forEach((variant, i) =>
      checkCells(file, `variants[${i}].features`, variant.features, rom),
    );
  }

  const documented = new Set();
  for (const entry of data.upstream) {
    const { file, name } = entry;
    const [romKey, variant] = name.split(/-(.*)/);
    if (entry.misplaced) {
      report(file, '', 'imports live at data/upstream/<rom>.yml');
      continue;
    }
    const rom = roms.get(romKey);
    if (name !== 'stock' && !rom)
      report(file, '', `there's no ROM called "${romKey}" in data/roms/`);
    if (variant && rom && !rom.variants?.some((known) => known.key === variant)) {
      report(file, '', `${romKey} has no "${variant}" build in data/roms/${romKey}.yml`);
    }
    if (!validate(name === 'stock' ? 'stock' : 'upstream', entry)) continue;

    for (const [codename, row] of Object.entries(entry.data.devices)) {
      if (!variant) documented.add(`${codename}/${name}`);
      if (!primaries.has(codename))
        report(file, `devices.${codename}`, `there's no device with that codename`);
      if (row.latest?.date > today)
        report(file, `devices.${codename}.latest.date`, "can't be in the future");
      checkCells(file, `devices.${codename}.features`, row.features, rom);
    }
  }

  for (const entry of data.support) {
    const { file, codename, rom: romKey } = entry;
    if (entry.misplaced) {
      report(file, '', 'support lives at data/support/<codename>/<rom>.yml');
      continue;
    }
    if (!primaries.has(codename)) {
      const owner = names.get(codename);
      report(
        file,
        '',
        owner
          ? `"${codename}" is another name for ${owner}, move this into its folder`
          : `there's no device with the codename "${codename}"`,
      );
    }
    const rom = roms.get(romKey);
    if (!rom) report(file, '', `there's no ROM called "${romKey}" in data/roms/`);
    if (!validate('support', entry) && !isObject(entry.data)) continue;

    const { features: cells, ...facts } = entry.data;
    if (documented.has(`${codename}/${romKey}`)) {
      for (const field of Object.keys(facts)) {
        report(file, field, `comes from data/upstream/${romKey}.yml, so only features go here`);
      }
    } else {
      for (const field of ['status', 'source']) {
        if (!(field in facts)) report(file, field, 'is missing');
      }
    }
    checkCells(file, 'features', cells, rom);
  }

  return problems;
}

export const fileCount = (data) =>
  2 + data.roms.length + data.devices.length + data.upstream.length + data.support.length;
