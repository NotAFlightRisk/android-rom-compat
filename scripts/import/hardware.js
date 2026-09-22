import { strings } from '../../src/lib/text.js';

const peripheralKeys = {
  'fingerprint reader': 'fingerprint',
  nfc: 'nfc',
  'dual side nfc': 'nfc',
  esim: 'esim',
};

const types = {
  phone: 'phone',
  foldable: 'phone',
  'phone (slider)': 'phone',
  tablet: 'tablet',
  'handheld game console': 'handheld',
  'set top box': 'skip',
  tv: 'skip',
  devkit: 'skip',
};

/** Hardware keys from a LineageOS or /e/ wiki device file */
export function hardwareOf({ peripherals, network }) {
  const keys = strings(peripherals).map((item) => peripheralKeys[item.toLowerCase()]);
  const bands = strings(network);
  if (bands.length) keys.push('cellular');
  if (bands.includes('5G NR')) keys.push('5g');
  return [...new Set(keys.filter(Boolean))].sort();
}

/** phone, tablet or handheld, skip for things we don't list, undefined when it's anyone's guess */
export const typeOf = (type) => types[String(type).trim().toLowerCase()];
