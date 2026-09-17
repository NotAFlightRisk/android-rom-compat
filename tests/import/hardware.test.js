import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hardwareOf, typeOf } from '../../scripts/import/hardware.js';

test('peripherals and network bands become hardware keys', () => {
  const hardware = hardwareOf({
    peripherals: ['Accelerometer', 'Fingerprint reader', 'Dual side NFC', 'eSIM'],
    network: ['2G GSM', '4G LTE', '5G NR'],
  });
  assert.deepEqual(hardware, ['5g', 'cellular', 'esim', 'fingerprint', 'nfc']);
});

test('network: None means no cellular, and never gets read letter by letter', () => {
  assert.deepEqual(hardwareOf({ peripherals: ['NFC'], network: 'None' }), ['nfc']);
});

test('wiki types map to ours, and TVs get skipped', () => {
  assert.equal(typeOf('phone (slider)'), 'phone');
  assert.equal(typeOf('Handheld game console'), 'handheld');
  assert.equal(typeOf('Set top box'), 'skip');
  assert.equal(typeOf(undefined), undefined);
});
