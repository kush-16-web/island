'use strict';
/**
 * test/pass2-2-8-2-timer-labels.test.cjs
 * Verification for Pass 2.2.8.2: Accurate Timer and Alarm Label Parsing.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { Scheduler } = require('../electron/scheduler.js');

test('Pass 2.2.8.2: Accurate Timer & Alarm Label Parsing Suite', async (t) => {
  const {
    parseRelativeCountdown,
    parseAbsoluteClockTime,
    parseSchedulerIntent,
    executeSchedulerIntent,
    extractExplicitLabel,
  } = await import('../src/lib/scheduler-commands.js');

  await t.test('1. "Set a one-minute timer and label it Drink Water."', async () => {
    const raw = 'Set a one-minute timer and label it Drink Water.';
    const parsed = parseSchedulerIntent(raw);

    assert.equal(parsed.isScheduler, true);
    assert.equal(parsed.intent, 'SET_TIMER');
    assert.equal(parsed.durationMs, 60000);
    assert.equal(parsed.label, 'Drink Water');

    // Test execution against authoritative scheduler
    const scheduler = new Scheduler({ now: () => Date.now(), autoStart: false });
    const bridge = {
      addTimer: async (input) => ({ ok: true, item: scheduler.addTimer(input) }),
      addAlarm: async (input) => ({ ok: true, item: scheduler.addAlarm(input) }),
    };

    const res = await executeSchedulerIntent(parsed, { scheduler: bridge });
    assert.equal(res.ok, true);
    assert.equal(res.item.durationMs, 60000);
    assert.equal(res.item.label, 'Drink Water');
    assert.match(res.spokenConfirmation, /Drink Water timer is (?:running|set) for 1 minute/i);
  });

  await t.test('2. "Start a five-minute timer called Study."', async () => {
    const raw = 'Start a five-minute timer called Study.';
    const parsed = parseSchedulerIntent(raw);

    assert.equal(parsed.isScheduler, true);
    assert.equal(parsed.intent, 'SET_TIMER');
    assert.equal(parsed.durationMs, 300000);
    assert.equal(parsed.label, 'Study');

    const scheduler = new Scheduler({ now: () => Date.now(), autoStart: false });
    const bridge = {
      addTimer: async (input) => ({ ok: true, item: scheduler.addTimer(input) }),
    };

    const res = await executeSchedulerIntent(parsed, { scheduler: bridge });
    assert.equal(res.ok, true);
    assert.equal(res.item.label, 'Study');
    assert.match(res.spokenConfirmation, /Study timer is (?:running|set) for 5 minutes/i);
  });

  await t.test('3. "Set a 30-second timer named Stretch."', async () => {
    const raw = 'Set a 30-second timer named Stretch.';
    const parsed = parseSchedulerIntent(raw);

    assert.equal(parsed.isScheduler, true);
    assert.equal(parsed.intent, 'SET_TIMER');
    assert.equal(parsed.durationMs, 30000);
    assert.equal(parsed.label, 'Stretch');

    const scheduler = new Scheduler({ now: () => Date.now(), autoStart: false });
    const bridge = {
      addTimer: async (input) => ({ ok: true, item: scheduler.addTimer(input) }),
    };

    const res = await executeSchedulerIntent(parsed, { scheduler: bridge });
    assert.equal(res.ok, true);
    assert.equal(res.item.label, 'Stretch');
    assert.match(res.spokenConfirmation, /Stretch timer is (?:running|set) for 30 seconds/i);
  });

  await t.test('4. "Set a timer for one minute." (No explicit label -> defaults to Timer)', async () => {
    const raw = 'Set a timer for one minute.';
    const parsed = parseSchedulerIntent(raw);

    assert.equal(parsed.isScheduler, true);
    assert.equal(parsed.intent, 'SET_TIMER');
    assert.equal(parsed.durationMs, 60000);
    assert.equal(parsed.label, 'Timer');

    const scheduler = new Scheduler({ now: () => Date.now(), autoStart: false });
    const bridge = {
      addTimer: async (input) => ({ ok: true, item: scheduler.addTimer(input) }),
    };

    const res = await executeSchedulerIntent(parsed, { scheduler: bridge });
    assert.equal(res.ok, true);
    assert.equal(res.item.label, 'Timer');
    assert.match(res.spokenConfirmation, /timer is (?:running|set) for 1 minute/i);
  });

  await t.test('5. "Set an alarm for 7 AM called Gym."', async () => {
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
    assert.equal(res.item.label, 'Gym');
    assert.equal(res.spokenConfirmation, 'Your Gym alarm is set for 7 AM tomorrow.');
  });

  await t.test('6. "Set a one-minute timer and label it \'Drink Water\'"', async () => {
    const raw = 'Set a one-minute timer and label it \'Drink Water\'';
    const parsed = parseSchedulerIntent(raw);

    assert.equal(parsed.durationMs, 60000);
    assert.equal(parsed.label, 'Drink Water');
  });
});
