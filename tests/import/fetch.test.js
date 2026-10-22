import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fetchHead, fetchPatchLevel, fetchText } from '../../scripts/import/fetch.js';

const SOURCE = 'https://example.com/devices.yml';
const reply = (status, body = '') => new Response(body, { status });

function stub(t, replies) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url, ...init });
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

test('a body goes as a POST, retries included', async (t) => {
  const calls = stub(t, [reply(502), reply(200, '[]')]);
  assert.equal(await fetchText(SOURCE, { body: '{"page":1}' }), '[]');
  assert.deepEqual(
    calls.map(({ method, body }) => [method, body]),
    [
      ['POST', '{"page":1}'],
      ['POST', '{"page":1}'],
    ],
  );
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

test('fetchHead asks for a range, and hangs up early on a server that sends the lot', async (t) => {
  let pulled = 0;
  const endless = new ReadableStream({
    pull: (controller) => controller.enqueue(new Uint8Array(1024).fill(65 + pulled++)),
  });
  const calls = stub(t, [new Response(endless, { status: 200 })]);
  const head = await fetchHead(SOURCE, 1500);
  assert.equal(calls[0].headers.range, 'bytes=0-1499');
  assert.equal(head, 'A'.repeat(1024) + 'B'.repeat(476));
  assert.ok(pulled < 5);
});

test('fetchPatchLevel reads the metadata a build zip opens with', async (t) => {
  const metadata = [
    'PK\u0003\u0004META-INF/com/android/metadata',
    'post-build=realme/RMX2020/RMX2020:11/RP1A.200720.011/1652239672541:user/release-keys',
    'post-security-patch-level=2026-06-01',
    'post-timestamp=1781814660',
  ].join('\n');
  stub(t, [reply(206, metadata), reply(206, 'PK\u0003\u0004 not an OTA')]);
  assert.equal(await fetchPatchLevel(SOURCE), '2026-06-01');
  assert.equal(await fetchPatchLevel(SOURCE), undefined);
});
