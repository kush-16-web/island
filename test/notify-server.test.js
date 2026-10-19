'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createNotifyServer, parseNotification } = require('../electron/notify-server');

function request(port, { method = 'POST', path = '/notify', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method, headers }, (res) => {
      let text = '';
      res.on('data', (c) => (text += c));
      res.on('end', () => resolve({ status: res.statusCode, json: text ? JSON.parse(text) : null }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

test('notify server', async (t) => {
  const received = [];
  const server = createNotifyServer({ port: 0, maxBodyBytes: 1024, onNotify: (n) => (received.push(n), 'id-1') });
  const port = await server.listen();
  t.after(() => server.close());

  await t.test('accepts a valid notification and cleans it up', async () => {
    const res = await request(port, {
      headers: JSON_HEADERS,
      body: JSON.stringify({ title: '  Build done  ', body: 'ok', kind: 'success', timeoutMs: 1 }),
    });
    assert.equal(res.status, 202);
    assert.deepEqual(res.json, { ok: true, id: 'id-1' });
    assert.equal(received.at(-1).title, 'Build done');
    assert.equal(received.at(-1).kind, 'success');
    assert.equal(received.at(-1).timeoutMs, 1500); // clamped
    assert.equal(received.at(-1).app, 'Notification');
  });

  await t.test('health check', async () => {
    const res = await request(port, { method: 'GET', path: '/health' });
    assert.equal(res.status, 200);
  });

  await t.test('rejects non-JSON content types (what a web page form POST would send)', async () => {
    const res = await request(port, { headers: { 'Content-Type': 'text/plain' }, body: '{"title":"x"}' });
    assert.equal(res.status, 415);
  });

  await t.test('rejects bad JSON, missing title, wrong method, unknown path', async () => {
    assert.equal((await request(port, { headers: JSON_HEADERS, body: '{nope' })).status, 400);
    assert.equal((await request(port, { headers: JSON_HEADERS, body: '{"body":"x"}' })).status, 400);
    assert.equal((await request(port, { method: 'GET', path: '/notify' })).status, 405);
    assert.equal((await request(port, { path: '/other', headers: JSON_HEADERS, body: '{}' })).status, 404);
  });

  await t.test('rejects a foreign Host header (DNS rebinding)', async () => {
    const res = await request(port, { headers: { ...JSON_HEADERS, Host: 'evil.example.com' }, body: '{"title":"x"}' });
    assert.equal(res.status, 403);
  });

  await t.test('rejects oversized bodies', async () => {
    const res = await request(port, { headers: JSON_HEADERS, body: JSON.stringify({ title: 'x'.repeat(5000) }) });
    assert.equal(res.status, 413);
  });

  await t.test('nothing was shown for the rejected requests', () => {
    assert.equal(received.length, 1);
  });
});

test('parseNotification limits field lengths and strips control characters', () => {
  const { value } = parseNotification({ title: 'a\u0000b'.padEnd(500, 'z'), body: 'x'.repeat(900), app: 'y'.repeat(99) });
  assert.equal(value.title.length, 120);
  assert.ok(!value.title.includes('\u0000'));
  assert.equal(value.body.length, 400);
  assert.equal(value.app.length, 40);
});
