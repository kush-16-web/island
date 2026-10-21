'use strict';
// Offline Unit Test: Verify Gemini Cooldown Bug Fix & Non-Blocking State Management
// STRICT ZERO LIVE API CALLS: Purely offline with deterministic fixtures.

const test = require('node:test');
const assert = require('node:assert/strict');
const { VoiceTurnController } = require('../src/lib/voice-turn-controller');

test('COOLDOWN FIX: Daily quota 429 transitions to error state, never a 20-hour blocking cooldown', () => {
  const controller = new VoiceTurnController();
  controller.startSession();
  assert.strictEqual(controller.state, 'listening');

  const turnId = controller.startTurn();

  // Simulate Google daily quota exhaustion (e.g. 72,947 seconds delay)
  controller.handleTurnFailure(turnId, 'Gemini daily free-tier quota exhausted.', {
    retryDelaySeconds: 72947,
    isDailyQuota: true,
  });

  // VERIFIED: State is 'error', NOT 'cooldown'
  assert.strictEqual(controller.state, 'error', 'Must be error state instead of blocking cooldown');
  assert.strictEqual(controller.cooldownSeconds, 0, 'Countdown must remain 0, never multi-hour duration');

  // VERIFIED: User can dismiss error at any time to resume listening
  controller.clearError();
  assert.strictEqual(controller.state, 'listening', 'Should immediately return to listening upon clearing error');

  controller.clearCooldownTimer();
});

test('COOLDOWN FIX: Temporary burst 429 rate limit is capped at 60s and can be dismissed immediately', () => {
  const controller = new VoiceTurnController();
  controller.startSession();

  const turnId = controller.startTurn();

  // Burst rate limit with 30s delay
  controller.handleTurnFailure(turnId, 'Rate limit reached', {
    retryDelaySeconds: 30,
    isDailyQuota: false,
  });

  assert.strictEqual(controller.state, 'cooldown');
  assert.strictEqual(controller.cooldownSeconds, 30);

  // User dismisses cooldown
  controller.dismissCooldown();
  assert.strictEqual(controller.state, 'listening', 'User dismissal must immediately unblock session');
  assert.strictEqual(controller.cooldownSeconds, 0);

  controller.clearCooldownTimer();
});

test('COOLDOWN FIX: Unreasonably large burst delay is safely capped at 60 seconds', () => {
  const controller = new VoiceTurnController();
  controller.startSession();

  const turnId = controller.startTurn();

  // If a server specifies a 75s delay (below 90s cutoff)
  controller.handleTurnFailure(turnId, 'Rate limit', {
    retryDelaySeconds: 75,
    isDailyQuota: false,
  });

  assert.strictEqual(controller.state, 'cooldown');
  assert.strictEqual(controller.cooldownSeconds, 60, 'Must cap backoff at 60 seconds');

  controller.clearCooldownTimer();
});
