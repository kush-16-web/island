'use strict';
/**
 * test/pass2-2-8-nl-scheduler.test.cjs
 * Comprehensive test suite for Natural-Language Alarm & Timer Commands (Pass 2.2.8).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { Scheduler, nextOccurrence } = require('../electron/scheduler.js');

test('Pass 2.2.8: Natural-Language Alarm & Timer Commands Suite', async (t) => {
  const {
    parseRelativeCountdown,
    parseAbsoluteClockTime,
    parseSchedulerIntent,
    executeSchedulerIntent,
    formatDurationSpeech,
    formatTimeSpeech,
  } = await import('../src/lib/scheduler-commands.js');

  await t.test('Step 2A: Relative countdown duration parsing', () => {
    // Examples from prompt:
    // "Set an alarm for one minute."
    const oneMin = parseRelativeCountdown('Set an alarm for one minute.');
    assert.ok(oneMin, 'Should parse one minute countdown');
    assert.equal(oneMin.durationMs, 60000);

    // "Start a 30-second timer."
    const thirtySec = parseRelativeCountdown('Start a 30-second timer.');
    assert.ok(thirtySec, 'Should parse 30-second timer');
    assert.equal(thirtySec.durationMs, 30000);

    // "Set a timer for five minutes."
    const fiveMin = parseRelativeCountdown('Set a timer for five minutes.');
    assert.ok(fiveMin, 'Should parse five minutes');
    assert.equal(fiveMin.durationMs, 300000);

    // "Set a timer for 10 minutes for cooking pasta"
    const pasta = parseRelativeCountdown('Set a timer for 10 minutes for cooking pasta');
    assert.ok(pasta);
    assert.equal(pasta.durationMs, 600000);
    assert.match(pasta.label, /^Cooking [Pp]asta$/);

    // "half an hour"
    const halfHour = parseRelativeCountdown('Timer for half an hour');
    assert.ok(halfHour);
    assert.equal(halfHour.durationMs, 1800000);

    // "10s"
    const tenSec = parseRelativeCountdown('10s timer');
    assert.ok(tenSec);
    assert.equal(tenSec.durationMs, 10000);
  });

  await t.test('Step 2B: Absolute clock alarm parsing & local time handling', () => {
    // Current simulated time: 5:00 PM (17:00) on Oct 24, 2026
    const simulatedNow = new Date(2026, 9, 24, 17, 0, 0);

    // "Set an alarm for 7 AM."
    const alarm7am = parseAbsoluteClockTime('Set an alarm for 7 AM.', simulatedNow);
    assert.ok(alarm7am, 'Should parse 7 AM alarm');
    assert.equal(alarm7am.time, '07:00');

    // "Wake me up at 7 AM."
    const wake7am = parseAbsoluteClockTime('Wake me up at 7 AM.', simulatedNow);
    assert.ok(wake7am);
    assert.equal(wake7am.time, '07:00');
    assert.equal(wake7am.label, 'Wake up');

    // "Wake me up tomorrow at 6:30."
    const wake630 = parseAbsoluteClockTime('Wake me up tomorrow at 6:30.', simulatedNow);
    assert.ok(wake630);
    assert.equal(wake630.time, '06:30');
    assert.equal(wake630.isTomorrow, true);

    // "Set an alarm for 6:30 tomorrow morning."
    const alarm630am = parseAbsoluteClockTime('Set an alarm for 6:30 tomorrow morning.', simulatedNow);
    assert.ok(alarm630am);
    assert.equal(alarm630am.time, '06:30');
    assert.equal(alarm630am.isTomorrow, true);

    // "Alarm at 8:15 PM"
    const alarm815pm = parseAbsoluteClockTime('Alarm at 8:15 PM', simulatedNow);
    assert.ok(alarm815pm);
    assert.equal(alarm815pm.time, '20:15');

    // Do NOT confuse "in 7 minutes" with "at 7"
    const relativeIn7 = parseAbsoluteClockTime('Set an alarm in 7 minutes', simulatedNow);
    assert.equal(relativeIn7, null, 'Relative "in 7 minutes" must not be parsed as absolute clock alarm');
  });

  await t.test('Step 2C: Ambiguity handling & clarifications', () => {
    const simulatedNow = new Date(2026, 9, 24, 17, 0, 0);

    // Ambiguous hour: "Set an alarm for 7" without AM/PM or duration
    const ambig = parseSchedulerIntent('Set an alarm for 7', { now: simulatedNow });
    assert.equal(ambig.intent, 'CLARIFY');
    assert.ok(ambig.question.includes('7:00 AM or 7:00 PM'));

    // Bare "set a timer"
    const bareTimer = parseSchedulerIntent('Set a timer', { now: simulatedNow });
    assert.equal(bareTimer.intent, 'CLARIFY');
    assert.ok(bareTimer.question.toLowerCase().includes('how long'));

    // Bare "set an alarm"
    const bareAlarm = parseSchedulerIntent('Set an alarm', { now: simulatedNow });
    assert.equal(bareAlarm.intent, 'CLARIFY');
    assert.ok(bareAlarm.question.toLowerCase().includes('what time'));
  });

  await t.test('Step 4 & 6: Intent execution, authoritativeness & TTS responses', async () => {
    const items = [];
    const scheduler = new Scheduler({ now: () => Date.now(), autoStart: false, items });

    // Mock bridge interface matching preload/mockIsland
    const bridge = {
      addTimer: async (input) => ({ ok: true, item: scheduler.addTimer(input) }),
      addAlarm: async (input) => ({ ok: true, item: scheduler.addAlarm(input) }),
      remove: async (id) => ({ ok: true, removed: scheduler.remove(id) }),
    };

    // 1. "Set an alarm for one minute."
    const parsed1 = parseSchedulerIntent('Set an alarm for one minute.');
    assert.equal(parsed1.intent, 'SET_TIMER');
    assert.equal(parsed1.durationMs, 60000);

    const res1 = await executeSchedulerIntent(parsed1, { scheduler: bridge, schedule: scheduler.list() });
    assert.ok(res1.ok);
    assert.equal(res1.item.durationMs, 60000);
    // Spoken response test: concise, TTS-safe, no markdown
    assert.match(res1.spokenConfirmation, /Your alarm is (?:running|set) for 1 minute/i);

    // 2. "Set an alarm for 7 AM."
    const parsed2 = parseSchedulerIntent('Set an alarm for 7 AM.', { now: new Date(2026, 9, 24, 17, 0, 0) });
    assert.equal(parsed2.intent, 'SET_ALARM');
    assert.equal(parsed2.time, '07:00');

    const res2 = await executeSchedulerIntent(parsed2, { scheduler: bridge, schedule: scheduler.list(), now: new Date(2026, 9, 24, 17, 0, 0).getTime() });
    assert.ok(res2.ok);
    assert.equal(res2.item.time, '07:00');
    assert.equal(res2.spokenConfirmation, 'Your alarm is set for 7 AM tomorrow.');

    // Verify storage has exactly 2 items
    assert.equal(scheduler.list().length, 2);
  });

  await t.test('Step 5: Status queries and cancellation', async () => {
    const fixedNow = new Date(2026, 9, 24, 12, 0, 0).getTime();
    const scheduler = new Scheduler({ now: () => fixedNow, autoStart: false });
    const timerItem = scheduler.addTimer({ durationMs: 45000, label: 'tea' });
    const alarmItem = scheduler.addAlarm({ time: '07:00', label: 'Wake up' });

    const bridge = {
      addTimer: async (input) => ({ ok: true, item: scheduler.addTimer(input) }),
      addAlarm: async (input) => ({ ok: true, item: scheduler.addAlarm(input) }),
      remove: async (id) => ({ ok: true, removed: scheduler.remove(id) }),
    };

    // Query remaining time
    const parsedStatus = parseSchedulerIntent('How much time is left on my timer?');
    assert.equal(parsedStatus.intent, 'QUERY_STATUS');
    const resStatus = await executeSchedulerIntent(parsedStatus, { scheduler: bridge, schedule: scheduler.list(), now: fixedNow });
    assert.ok(resStatus.ok);
    assert.equal(resStatus.spokenConfirmation, 'You have 45 seconds left on your tea timer.');

    // Query alarms
    const parsedAlarmStatus = parseSchedulerIntent('What alarms do I have?');
    assert.equal(parsedAlarmStatus.intent, 'QUERY_STATUS');
    const resAlarmStatus = await executeSchedulerIntent(parsedAlarmStatus, { scheduler: bridge, schedule: scheduler.list(), now: fixedNow });
    assert.ok(resAlarmStatus.ok);
    assert.ok(resAlarmStatus.spokenConfirmation.includes('7 AM'));

    // Cancel timer
    const parsedCancel = parseSchedulerIntent('Cancel my timer.');
    assert.equal(parsedCancel.intent, 'CANCEL');
    const resCancel = await executeSchedulerIntent(parsedCancel, { scheduler: bridge, schedule: scheduler.list() });
    assert.ok(resCancel.ok);
    assert.match(resCancel.spokenConfirmation, /I('ve)? cancel(?:l)?ed (?:your|the) (?:45 seconds |tea )?timer/i);
    assert.equal(scheduler.list().filter((i) => i.kind === 'timer').length, 0);

    // Cancel 7 AM alarm
    const parsedCancelAlarm = parseSchedulerIntent('Cancel my 7 AM alarm.');
    assert.equal(parsedCancelAlarm.intent, 'CANCEL');
    assert.equal(parsedCancelAlarm.specificTime, '07:00');
    const resCancelAlarm = await executeSchedulerIntent(parsedCancelAlarm, { scheduler: bridge, schedule: scheduler.list() });
    assert.ok(resCancelAlarm.ok);
    assert.equal(resCancelAlarm.spokenConfirmation, "I've canceled your 7 AM alarm.");
    assert.equal(scheduler.list().filter((i) => i.kind === 'alarm').length, 0);
  });

  await t.test('Step 3: Real alarm firing, non-repeated trigger & dismissal', () => {
    let clockTime = 1000000;
    const scheduler = new Scheduler({ now: () => clockTime, autoStart: false });
    const fired = [];
    scheduler.on('fire', (item) => fired.push(item));

    // 10-second timer
    const timer = scheduler.addTimer({ durationMs: 10000, label: 'Egg' });
    assert.equal(timer.fireAt, clockTime + 10000);

    // Advance 9 seconds
    clockTime += 9000;
    scheduler.tick();
    assert.equal(fired.length, 0);

    // Advance 1 second -> fires
    clockTime += 1000;
    scheduler.tick();
    assert.equal(fired.length, 1);
    assert.equal(fired[0].label, 'Egg');

    // Tick again -> does NOT fire a second time
    scheduler.tick();
    assert.equal(fired.length, 1, 'Alarm must never be triggered repeatedly');

    // Timer is removed from scheduler list
    assert.equal(scheduler.list().length, 0);
  });

  await t.test('Step 7.7: Voice and text commands use the same scheduling actions', async () => {
    // Voice transcription might include wake word or slight punctuation differences
    const voiceInput = 'Hey Island, set a timer for two minutes.';
    const textInput = 'set a timer for 2 minutes';

    const voiceParsed = parseSchedulerIntent(voiceInput);
    const textParsed = parseSchedulerIntent(textInput);

    assert.equal(voiceParsed.intent, 'SET_TIMER');
    assert.equal(textParsed.intent, 'SET_TIMER');
    assert.equal(voiceParsed.durationMs, textParsed.durationMs);
    assert.equal(voiceParsed.durationMs, 120000);

    const scheduler = new Scheduler({ now: () => Date.now(), autoStart: false });
    const bridge = {
      addTimer: async (input) => ({ ok: true, item: scheduler.addTimer(input) }),
      addAlarm: async (input) => ({ ok: true, item: scheduler.addAlarm(input) }),
      remove: async (id) => ({ ok: true, removed: scheduler.remove(id) }),
    };

    const voiceExec = await executeSchedulerIntent(voiceParsed, { scheduler: bridge, schedule: scheduler.list() });
    assert.ok(voiceExec.ok);
    assert.match(voiceExec.spokenConfirmation, /timer is (?:running|set) for 2 minutes/i);

    const textExec = await executeSchedulerIntent(textParsed, { scheduler: bridge, schedule: scheduler.list() });
    assert.ok(textExec.ok);
    assert.match(textExec.spokenConfirmation, /timer is (?:running|set) for 2 minutes/i);
  });
});
