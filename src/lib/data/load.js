import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { parse } from 'yaml';

const yamlFiles = (dir) =>
  existsSync(dir)
    ? readdirSync(dir, { recursive: true })
        .filter((file) => file.endsWith('.yml'))
        .map((file) => join(dir, file))
        .sort()
    : [];

const segments = (root, file) =>
  relative(root, file)
    .replace(/\.yml$/, '')
    .split(sep);

let cached;
export const getData = () => (cached ??= loadData());

/** Reads every data file, keeping YAML that won't parse as an error rather than a crash */
export function loadData(root = 'data') {
  const errors = [];
  const read = (file) => {
    try {
      const value = parse(readFileSync(file, 'utf8'));
      JSON.stringify(value);
      return value;
    } catch (error) {
      const detail = error.message.split('\n')[0].replace(/:$/, '');
      const reasons = {
        ENOENT: 'is missing',
        TypeError: 'has an anchor that points back at itself',
      };
      const reason = reasons[error.code ?? error.name] ?? `won't parse: ${detail}`;
      errors.push({ file, path: '', message: `this file ${reason}` });
    }
  };
  const records = (dir, toKeys) =>
    yamlFiles(join(root, dir))
      .map((file) => ({ file, ...toKeys(segments(join(root, dir), file)), data: read(file) }))
      .filter((record) => record.data !== undefined);

  return {
    root,
    brands: { file: join(root, 'brands.yml'), data: read(join(root, 'brands.yml')) ?? [] },
    features: { file: join(root, 'features.yml'), data: read(join(root, 'features.yml')) ?? [] },
    roms: records('roms', ([key, ...rest]) => ({ key, misplaced: rest.length > 0 })),
    devices: records('devices', ([brand, key, ...rest]) => ({
      brand,
      key,
      misplaced: !key || rest.length > 0,
    })),
    upstream: records('upstream', ([name, ...rest]) => ({
      name,
      misplaced: rest.length > 0,
    })),
    support: records('support', ([codename, rom, ...rest]) => ({
      codename,
      rom,
      misplaced: !rom || rest.length > 0,
    })),
    errors,
  };
}
