'use strict';
/**
 * test/pass2-2-8-3-nlu-audit.test.cjs
 * Comprehensive regression test suite for Pass 2.2.8.3:
 * Natural-Language Understanding, Hardcoded Behavior Removal, Purpose-Based Timers,
 * Farewell Music-State Grounding, and Specific Action Outcomes.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { Scheduler } = require('../electron/scheduler.js');

test('Pass 2.2.8.3: Agent NLU, Farewell Grounding & Tool Confirmations', async (t) => {
  const {
    parseSchedulerIntent,
    executeSchedulerIntent,
    extractPurposeLabel,
    extractExplicitLabel,
  } = await import('../src/lib/scheduler-commands.js');

  const { interpretLocalMusicCommand } = await import('../src/lib/music-command-interpreter.js');
  const { processTurnIntent, deriveSpecificActionConfirmation } = await import('../src/lib/voice-intent.js');
  const { createAgentResponse } = await import('../src/lib/agent-response-contract.js');

  // 1. "Set a timer for one minute to drink water."
  await t.test('1. "Set a timer for one minute to drink water." -> 60s, "Drink Water"', async () => {
    const raw = 'Set a timer for one minute to drink water.';
    const parsed = parseSchedulerIntent(raw);

    assert.equal(parsed.isScheduler, true);
    assert.equal(parsed.intent, 'SET_TIMER');
    assert.equal(parsed.durationMs, 60000);
    assert.equal(parsed.label, 'Drink Water');

    const scheduler = new Scheduler({ now: () => Date.now(), autoStart: false });
    const bridge = {
      addTimer: async (input) => ({ ok: true, item: scheduler.addTimer(input) }),
    };

    const res = await executeSchedulerIntent(parsed, { scheduler: bridge });
    assert.equal(res.ok, true);
    assert.equal(res.status, 'success');
    assert.equal(res.entityType, 'timer');
    assert.equal(res.label, 'Drink Water');
    assert.equal(res.durationSeconds, 60);
    assert.match(res.spokenConfirmation, /Your Drink Water timer is running for 1 minute/i);
    assert.notEqual(res.spokenConfirmation, 'Action completed.');
  });

  // 2. "Set a timer for two minutes and label it Tea."
  await t.test('2. "Set a timer for two minutes and label it Tea." -> 120s, "Tea"', async () => {
    const raw = 'Set a timer for two minutes and label it Tea.';
    const parsed = parseSchedulerIntent(raw);

    assert.equal(parsed.isScheduler, true);
    assert.equal(parsed.intent, 'SET_TIMER');
    assert.equal(parsed.durationMs, 120000);
    assert.equal(parsed.label, 'Tea');

    const scheduler = new Scheduler({ now: () => Date.now(), autoStart: false });
    const bridge = {
      addTimer: async (input) => ({ ok: true, item: scheduler.addTimer(input) }),
    };

    const res = await executeSchedulerIntent(parsed, { scheduler: bridge });
    assert.equal(res.ok, true);
    assert.equal(res.label, 'Tea');
    assert.match(res.spokenConfirmation, /Your Tea timer is running for 2 minutes/i);
  });

  // 3. "Give me five minutes to stretch."
  await t.test('3. "Give me five minutes to stretch." -> 300s, "Stretch"', async () => {
    const raw = 'Give me five minutes to stretch.';
    const parsed = parseSchedulerIntent(raw);

    assert.equal(parsed.isScheduler, true);
    assert.equal(parsed.intent, 'SET_TIMER');
    assert.equal(parsed.durationMs, 300000);
    assert.equal(parsed.label, 'Stretch');

    const scheduler = new Scheduler({ now: () => Date.now(), autoStart: false });
    const bridge = {
      addTimer: async (input) => ({ ok: true, item: scheduler.addTimer(input) }),
    };

    const res = await executeSchedulerIntent(parsed, { scheduler: bridge });
    assert.equal(res.ok, true);
    assert.equal(res.label, 'Stretch');
    assert.match(res.spokenConfirmation, /Your Stretch timer is running for 5 minutes/i);
  });

  // 4. "Start a ten-minute break timer."
  await t.test('4. "Start a ten-minute break timer." -> 600s, "Break"', async () => {
    const raw = 'Start a ten-minute break timer.';
    const parsed = parseSchedulerIntent(raw);

    assert.equal(parsed.isScheduler, true);
    assert.equal(parsed.intent, 'SET_TIMER');
    assert.equal(parsed.durationMs, 600000);
    assert.equal(parsed.label, 'Break');

    const scheduler = new Scheduler({ now: () => Date.now(), autoStart: false });
    const bridge = {
      addTimer: async (input) => ({ ok: true, item: scheduler.addTimer(input) }),
    };

    const res = await executeSchedulerIntent(parsed, { scheduler: bridge });
    assert.equal(res.ok, true);
    assert.equal(res.label, 'Break');
    assert.match(res.spokenConfirmation, /Your Break timer is running for 10 minutes/i);
  });

  // 5. "Set a timer for thirty seconds." (neutral label)
  await t.test('5. "Set a timer for thirty seconds." -> 30s, neutral label "Timer" (not "Thirty")', async () => {
    const raw = 'Set a timer for thirty seconds.';
    const parsed = parseSchedulerIntent(raw);

    assert.equal(parsed.isScheduler, true);
    assert.equal(parsed.intent, 'SET_TIMER');
    assert.equal(parsed.durationMs, 30000);
    assert.equal(parsed.label, 'Timer');
    assert.notEqual(parsed.label, 'Thirty');
    assert.notEqual(parsed.label, 'Set Timer');

    const scheduler = new Scheduler({ now: () => Date.now(), autoStart: false });
    const bridge = {
      addTimer: async (input) => ({ ok: true, item: scheduler.addTimer(input) }),
    };

    const res = await executeSchedulerIntent(parsed, { scheduler: bridge });
    assert.equal(res.ok, true);
    assert.equal(res.label, 'Timer');
    assert.match(res.spokenConfirmation, /Your timer is running for 30 seconds/i);
    assert.doesNotMatch(res.spokenConfirmation, /Thirty/i);
  });

  // 6. "Set an alarm for 7 AM called Gym."
  await t.test('6. "Set an alarm for 7 AM called Gym." -> 07:00, "Gym"', async () => {
    const raw = 'Set an alarm for 7 AM called Gym.';
    const simulatedNow = new Date(2026, 9, 25, 12, 0, 0); // 12 PM Oct 25
    const parsed = parseSchedulerIntent(raw, { now: simulatedNow });

    assert.equal(parsed.isScheduler, true);
    assert.equal(parsed.intent, 'SET_ALARM');
    assert.equal(parsed.time, '07:00');
    assert.equal(parsed.label, 'Gym');

    const scheduler = new Scheduler({ now: () => simulatedNow.getTime(), autoStart: false });
    const bridge = {
      addAlarm: async (input) => ({ ok: true, item: scheduler.addAlarm(input) }),
    };

    const res = await executeSchedulerIntent(parsed, { scheduler: bridge, now: simulatedNow.getTime() });
    assert.equal(res.ok, true);
    assert.equal(res.status, 'success');
    assert.equal(res.entityType, 'alarm');
    assert.equal(res.label, 'Gym');
    assert.equal(res.time, '07:00');
    assert.match(res.spokenConfirmation, /Your Gym alarm is set for 7 AM tomorrow/i);
  });

  // 7. "Thanks, bye." with NO music playing
  await t.test('7. "Thanks, bye." with NO music playing -> Does NOT mention music', async () => {
    const raw = 'Thanks, bye.';
    const env = {
      media: { active: false, status: 'stopped' },
    };

    const res = interpretLocalMusicCommand(raw, env);
    assert.equal(res.handledLocally, true);
    assert.equal(res.actionResult.action, 'session_dismiss');
    assert.equal(res.actionResult.isSessionEnd, true);
    assert.doesNotMatch(res.actionResult.spokenConfirmation, /music/i);
    assert.match(res.actionResult.spokenConfirmation, /Goodbye! Have a great day/i);
  });

  // 8. "Thanks, bye." WHILE music is playing
  await t.test('8. "Thanks, bye." WHILE music is playing -> Confirmed music playing', async () => {
    const raw = 'Thanks, bye.';
    const env = {
      media: { active: true, status: 'playing', title: 'Midnight City' },
    };

    const res = interpretLocalMusicCommand(raw, env);
    assert.equal(res.handledLocally, true);
    assert.equal(res.actionResult.action, 'session_dismiss');
    assert.equal(res.actionResult.isSessionEnd, true);
    assert.match(res.actionResult.spokenConfirmation, /Enjoy your music/i);
  });

  // 9. Tool execution returns specific result (NEVER "Action completed.")
  await t.test('9. Specific tool confirmation formatting across music and scheduler', async () => {
    const musicResult = {
      ok: true,
      action: 'next_track',
      spokenConfirmation: 'Skipped to the next track.',
    };
    const derived = deriveSpecificActionConfirmation(musicResult);
    assert.equal(derived, 'Skipped to the next track.');
    assert.notEqual(derived, 'Action completed.');

    // Without pre-filled spokenConfirmation
    const barePauseResult = { ok: true, action: 'pause' };
    const pauseConfirmation = deriveSpecificActionConfirmation(barePauseResult);
    assert.equal(pauseConfirmation, 'Paused music playback.');
    assert.notEqual(pauseConfirmation, 'Action completed.');
  });

  // 10. Tool failure returns accurate error without claiming success
  await t.test('10. Tool failure returns accurate error without false success', async () => {
    const failedResult = {
      ok: false,
      action: 'play_favorite',
      error: 'Track file not found on disk.',
    };
    const confirmation = deriveSpecificActionConfirmation(failedResult);
    assert.equal(confirmation, 'Track file not found on disk.');

    const agentResp = createAgentResponse({
      displayText: confirmation,
      spokenText: confirmation,
      responseStatus: 'failure',
    });
    assert.equal(agentResp.responseStatus, 'failure');
    assert.equal(agentResp.spokenText, 'Track file not found on disk.');
  });

  // 11. Conversational question without triggering tool
  await t.test('11. Ordinary conversational question does not trigger tool', async () => {
    const raw = 'Why is the sky blue during the day?';
    const res = processTurnIntent(raw, {});
    assert.equal(res.executed, false);
    assert.equal(res.intent, null);
    assert.equal(res.actionResult, null);
    assert.equal(res.spokenText, 'Why is the sky blue during the day?');
  });

  // 12. Ambiguous cancellation requiring clarification
  await t.test('12. Ambiguous cancellation requiring clarification asks user instead of destroying state', async () => {
    const raw = 'Cancel timer';
    const simulatedNow = Date.now();
    const schedule = [
      { id: 't1', kind: 'timer', enabled: true, fireAt: simulatedNow + 60000, durationMs: 60000, label: 'Tea' },
      { id: 't2', kind: 'timer', enabled: true, fireAt: simulatedNow + 300000, durationMs: 300000, label: 'Study' },
    ];

    const parsed = parseSchedulerIntent(raw, { schedule, now: simulatedNow });
    assert.equal(parsed.isScheduler, true);
    assert.equal(parsed.intent, 'CANCEL');

    let removedId = null;
    const bridge = {
      remove: async (id) => { removedId = id; return true; },
    };

    const res = await executeSchedulerIntent(parsed, { scheduler: bridge, schedule, now: simulatedNow });
    assert.equal(res.action, 'clarification_needed');
    assert.equal(res.clarificationNeeded, true);
    assert.equal(removedId, null); // Did NOT remove anything prematurely!
    assert.match(res.spokenConfirmation, /Which one would you like to cancel/i);
  });
});
