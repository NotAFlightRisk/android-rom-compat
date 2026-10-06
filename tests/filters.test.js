import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deviceFilters, filterData } from '../src/lib/filters.js';

const acme = { key: 'acme', name: 'Acme' };
const tidyos = { key: 'tidyos', name: 'TidyOS' };
const device = (key, extra) => ({
  key,
  title: `Acme ${key}`,
  codenames: [key],
  brand: acme,
  bootloader: { unlock: 'yes' },
  support: [{ rom: tidyos, active: true }],
  activeCount: 1,
  ...extra,
});

test('devices carry what the dropdowns and the sort match on', () => {
  const data = filterData(device('rocket', { hardware: ['5g', 'nfc'], released: 2024 }));
  assert.equal(data['data-rom'], 'tidyos');
  assert.equal(data['data-type'], 'phone');
  assert.equal(data['data-hardware'], '5g nfc');
  assert.equal(data['data-released'], 2024);
  assert.equal(data['data-ended'], undefined);
});

test('dropdowns only offer choices that narrow the list down', () => {
  const devices = [
    device('rocket', { hardware: ['esim', 'nfc'] }),
    device('comet', { hardware: ['nfc'], type: 'tablet' }),
  ];
  assert.deepEqual(
    deviceFilters(devices, [tidyos]).map(({ name, options }) => [name, options]),
    [
      [
        'type',
        [
          ['phone', 'Phones'],
          ['tablet', 'Tablets'],
        ],
      ],
      ['hardware', [['esim', 'With eSIM']]],
    ],
  );
});
