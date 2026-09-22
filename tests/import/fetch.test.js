import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fetchText } from '../../scripts/import/fetch.js';

const SOURCE = 'https://example.com/devices.yml';
const reply = (status, body = '') => new Response(body, { status });

function stub(t, replies) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    calls.push(url);
    const next = replies.shift();
    if (next instanceof Error) throw next;
    return next;
  });
  return calls;
}

test('a 5xx is retried and the second go counts', async (t) => {
  const calls = stub(t, [reply(502), reply(200, 'devices:')]);
  assert.equal(await fetchText(SOURCE), 'devices:');
  assert.equal(calls.length, 2);
});

test('a dropped connection is retried the same way', async (t) => {
  const calls = stub(t, [new TypeError('fetch failed'), reply(200, 'devices:')]);
  assert.equal(await fetchText(SOURCE), 'devices:');
  assert.equal(calls.length, 2);
});

test('a 404 is the source telling us something, so it stands', async (t) => {
  const calls = stub(t, [reply(404)]);
  await assert.rejects(fetchText(SOURCE), /404 from/);
  assert.equal(calls.length, 1);
});

test('a source that stays down gives up rather than retrying forever', async (t) => {
  const calls = stub(t, Array.from({ length: 5 }, () => reply(503)));
  await assert.rejects(fetchText(SOURCE), /503 from/);
  assert.equal(calls.length, 5);
});
