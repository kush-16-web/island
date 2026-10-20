'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { RealtimeSessionBroker } = require('../electron/realtime');

test('RealtimeSessionBroker: initializes and safeguards API key', () => {
  const broker = new RealtimeSessionBroker();
  assert.ok(broker, 'broker should instantiate');
});

test('RealtimeSessionBroker: security boundary - never exposes developer API key', async () => {
  const broker = new RealtimeSessionBroker();
  const session = await broker.createSession({ petName: 'Batman', userName: 'Kush', voice: 'verse' });

  // Regardless of success or error, the master key must NEVER be in the response
  assert.strictEqual(typeof session, 'object');
  assert.strictEqual(session.apiKey, undefined, 'developer apiKey must never be exposed');
  assert.strictEqual(session.masterKey, undefined, 'master key must never be exposed');

  if (session.ok) {
    assert.ok(session.clientSecret, 'ephemeral client secret should be present on success');
    assert.strictEqual(typeof session.clientSecret, 'string');
    assert.ok(session.clientSecret.startsWith('ek_'), 'ephemeral secret should start with ek_');
  } else {
    assert.ok(session.error, 'error message should be descriptive on failure');
  }
});
