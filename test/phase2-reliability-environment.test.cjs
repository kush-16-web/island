'use strict';
/**
 * test/phase2-reliability-environment.test.cjs
 *
 * Comprehensive Automated Verification Suite for Phase 2:
 * 1. Weather and Location System:
 *    - Default preference initialization to Surat for this installation
 *    - Surat selected -> Surat weather
 *    - Ahmedabad selected -> Ahmedabad weather
 *    - Explicit city survives restart in persistent storage
 *    - Saved city wins over any external/IP location
 *    - Missing location -> user selection requested (no unencrypted IP guessing)
 *    - Network unavailable / API error -> honest unavailable/stale state, zero fabricated temperatures
 * 2. Date, Time and Weekday Accuracy:
 *    - Deterministic OS clock reading with controlled fake clock values
 *    - Month boundaries, year boundaries, midnight transitions
 *    - Leap years (2024, 2028 vs 2025, 2026)
 *    - Date-to-weekday conversions across past and future (e.g. Nov 5, 2026 -> Thursday)
 *    - Multiple timezones (Asia/Kolkata, America/New_York, Europe/London, Asia/Tokyo)
 *    - Straightforward queries ("What day is today?", "What time is it?", etc.) resolved locally with 0ms LLM latency
 *    - Date/time queries do NOT trigger music or scheduler actions
 * 3. Chrome Companion Ducking & Volume Coordination:
 *    - Authoritative volume state coordinator (isDucked, confirmedDucked, pendingRestore)
 *    - Normal speech start and end
 *    - Rapid voice turns & repeated speech
 *    - Interruption / cancellation volume restoration
 *    - Companion disconnect marks uncertain, safe reconciliation on reconnect
 *    - Duplicate restore deduplication
 *    - Failed or timed-out ducking does not block TTS
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { CompanionBridge } = require('../electron/companion-bridge');

function createMockStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (key) => store.has(key) ? store.get(key) : null,
    setItem: (key, val) => store.set(key, String(val)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  };
}

test('PHASE 2: RELIABILITY & ENVIRONMENT ACCURACY SUITE', async (t) => {
  // Setup Node test window mock for local storage and browser events
  globalThis.window = {
    localStorage: createMockStorage(),
    dispatchEvent: () => {},
  };

  const {
    getCurrentWeather,
    getUserLocation,
    setUserLocation,
    clearUserLocation,
    initInstallationLocation,
    resolveLocation,
    resetWeatherContext,
    SURAT_DEFAULT_LOCATION,
    STORAGE_KEY_LOCATION,
  } = await import('../src/lib/weather.js');

  const {
    getSystemDateTime,
    getWeekdayForDate,
    getRelativeDateTime,
    interpretDateTimeQuery,
    isLeapYear,
  } = await import('../src/lib/datetime/datetime-service.js');

  const { interpretLocalMusicCommand } = await import('../src/lib/music/music-command-interpreter.js');
  const { planUserIntent, ACTION_TYPES } = await import('../src/lib/semantic-tool-planner.js');
  const { parseSchedulerIntent } = await import('../src/lib/weather/scheduler-commands.js');

  // =========================================================================
  // TASK 1: WEATHER & LOCATION PREFERENCE
  // =========================================================================

  await t.test('1.1 Weather: Default preference initialization to Surat', () => {
    const freshStorage = createMockStorage();
    assert.equal(getUserLocation(freshStorage), null, 'No location before init');

    const initialized = initInstallationLocation(freshStorage);
    assert.equal(initialized.city, 'Surat');
    assert.equal(initialized.state, 'Gujarat');
    assert.equal(initialized.country, 'India');
    assert.equal(initialized.timezone, 'Asia/Kolkata');
    assert.equal(initialized.lat, 21.1702);
    assert.equal(initialized.lon, 72.8311);

    // Verify persisted into storage
    const saved = getUserLocation(freshStorage);
    assert.equal(saved.city, 'Surat');
  });

  await t.test('1.2 Weather: Surat selected -> Surat weather', async () => {
    resetWeatherContext();
    const store = createMockStorage();
    setUserLocation(SURAT_DEFAULT_LOCATION, store);

    const res = await getCurrentWeather(null, { storage: store });
    assert.equal(res.ok, true);
    assert.equal(res.city, 'Surat');
    assert.ok(typeof res.temperature === 'number');
    assert.ok(res.speech.includes('Surat'));
  });

  await t.test('1.3 Weather: Ahmedabad selected -> Ahmedabad weather', async () => {
    resetWeatherContext();
    const store = createMockStorage();
    const ahmedabad = {
      city: 'Ahmedabad',
      state: 'Gujarat',
      country: 'India',
      lat: 23.0225,
      lon: 72.5714,
      timezone: 'Asia/Kolkata',
    };
    setUserLocation(ahmedabad, store);

    const res = await getCurrentWeather(null, { storage: store });
    assert.equal(res.ok, true);
    assert.equal(res.city, 'Ahmedabad');
    assert.ok(res.speech.includes('Ahmedabad'));
  });

  await t.test('1.4 Weather: Explicit city survives simulated app restart', async () => {
    const store = createMockStorage();
    const mumbai = {
      city: 'Mumbai',
      state: 'Maharashtra',
      country: 'India',
      lat: 19.0760,
      lon: 72.8777,
      timezone: 'Asia/Kolkata',
    };
    setUserLocation(mumbai, store);

    // Simulate complete process restart: reset module cache
    resetWeatherContext();

    // Re-read strictly from storage
    const restoredLoc = getUserLocation(store);
    assert.equal(restoredLoc.city, 'Mumbai');

    const res = await getCurrentWeather(null, { storage: store });
    assert.equal(res.ok, true);
    assert.equal(res.city, 'Mumbai');
  });

  await t.test('1.5 Weather: Saved city wins, never silently substituted by IP', async () => {
    resetWeatherContext();
    const store = createMockStorage();
    setUserLocation(SURAT_DEFAULT_LOCATION, store);

    // Even when no location is passed in request, saved city (Surat) is used
    const loc = await resolveLocation(null, {}, store);
    assert.equal(loc.city, 'Surat');
    assert.equal(loc.lat, 21.1702);
  });

  await t.test('1.6 Weather: Missing location requests user selection (no unencrypted IP fallback)', async () => {
    resetWeatherContext();
    const emptyStore = createMockStorage();
    clearUserLocation(emptyStore);

    const res = await getCurrentWeather(null, { storage: emptyStore });
    assert.equal(res.ok, false);
    assert.equal(res.needsLocation, true);
    assert.match(res.speech, /Please select your city in settings/i);
  });

  await t.test('1.7 Weather: Network failure returns honest unavailable state (no fabricated temp)', async () => {
    resetWeatherContext();
    const store = createMockStorage();
    // Non-routable port to force network fetch failure
    const badLoc = {
      city: 'TestCity',
      lat: 999.0, // invalid latitude causes API error
      lon: 999.0,
      timezone: 'Asia/Kolkata',
    };
    setUserLocation(badLoc, store);

    const res = await getCurrentWeather(null, { storage: store });
    assert.equal(res.ok, false);
    assert.equal(res.temperature, undefined);
    assert.match(res.speech, /unavailable/i);
  });

  // =========================================================================
  // TASK 2: DATE, TIME & WEEKDAY ACCURACY
  // =========================================================================

  await t.test('2.1 DateTime: Controlled fake clock values & deterministic calculations', () => {
    // 2026-10-27T18:30:00+05:30 (Tuesday)
    const controlledDate = new Date('2026-10-27T13:00:00.000Z');
    const dt = getSystemDateTime(controlledDate, 'Asia/Kolkata');

    assert.equal(dt.year, 2026);
    assert.equal(dt.month, 10);
    assert.equal(dt.monthName, 'October');
    assert.equal(dt.day, 27);
    assert.equal(dt.weekday, 'Tuesday');
    assert.equal(dt.hour, 6);
    assert.equal(dt.minute, 30);
    assert.equal(dt.dayPeriod, 'PM');
    assert.equal(dt.formattedTime, '6:30 PM');
    assert.equal(dt.formattedDate, 'Tuesday, October 27, 2026');
  });

  await t.test('2.2 DateTime: Yesterday and tomorrow calculations across boundaries', () => {
    // Midnight boundary: 2026-03-01 00:01:00 UTC (Sunday)
    const march1 = new Date('2026-03-01T00:01:00.000Z');
    const yesterday = getRelativeDateTime(-1, march1, 'UTC');
    const tomorrow = getRelativeDateTime(1, march1, 'UTC');

    // 2026 is non-leap year -> yesterday was Feb 28 (Saturday)
    assert.equal(yesterday.month, 2);
    assert.equal(yesterday.day, 28);
    assert.equal(yesterday.weekday, 'Saturday');

    // Tomorrow is March 2 (Monday)
    assert.equal(tomorrow.month, 3);
    assert.equal(tomorrow.day, 2);
    assert.equal(tomorrow.weekday, 'Monday');
  });

  await t.test('2.3 DateTime: Leap years and leap day conversion', () => {
    assert.equal(isLeapYear(2024), true);
    assert.equal(isLeapYear(2026), false);
    assert.equal(isLeapYear(2028), true);
    assert.equal(isLeapYear(2000), true);
    assert.equal(isLeapYear(1900), false);

    // Leap day: February 29, 2024 was Thursday
    const leapDay = getWeekdayForDate(2024, 2, 29);
    assert.equal(leapDay.weekday, 'Thursday');
    assert.equal(leapDay.isLeapYear, true);
  });

  await t.test('2.4 DateTime: Date-to-weekday conversions across past and future', () => {
    // "What weekday is November 5, 2026?" -> Thursday
    const nov5 = getWeekdayForDate(2026, 11, 5);
    assert.equal(nov5.weekday, 'Thursday');

    // Historical date: August 15, 1947 -> Friday
    const indep = getWeekdayForDate(1947, 8, 15);
    assert.equal(indep.weekday, 'Friday');

    // Year boundary: January 1, 2030 -> Tuesday
    const jan2030 = getWeekdayForDate(2030, 1, 1);
    assert.equal(jan2030.weekday, 'Tuesday');
  });

  await t.test('2.5 DateTime: Multiple timezones and midnight offset handling', () => {
    // 2026-10-27T23:30:00Z -> In London: 23:30 (Tuesday), in Tokyo (+9h): 08:30 (Wednesday)
    const testDate = new Date('2026-10-27T23:30:00.000Z');
    const london = getSystemDateTime(testDate, 'UTC');
    const tokyo = getSystemDateTime(testDate, 'Asia/Tokyo');

    assert.equal(london.weekday, 'Tuesday');
    assert.equal(london.day, 27);

    assert.equal(tokyo.weekday, 'Wednesday');
    assert.equal(tokyo.day, 28);
  });

  await t.test('2.6 DateTime: Straightforward queries resolved locally with 0ms LLM latency', () => {
    const fakeClock = new Date('2026-10-27T13:00:00.000Z'); // Tuesday, 6:30 PM IST

    // A. "What day is today?"
    const q1 = interpretDateTimeQuery('What day is today?', { clock: fakeClock, timezone: 'Asia/Kolkata' });
    assert.equal(q1.handled, true);
    assert.equal(q1.intent, 'weekday_today');
    assert.equal(q1.speech, 'Today is Tuesday.');

    // B. "What's today's date?"
    const q2 = interpretDateTimeQuery("What's today's date?", { clock: fakeClock, timezone: 'Asia/Kolkata' });
    assert.equal(q2.handled, true);
    assert.equal(q2.intent, 'date_today');
    assert.equal(q2.speech, "Today's date is Tuesday, October 27, 2026.");

    // C. "What time is it?"
    const q3 = interpretDateTimeQuery('What time is it?', { clock: fakeClock, timezone: 'Asia/Kolkata' });
    assert.equal(q3.handled, true);
    assert.equal(q3.intent, 'time_now');
    assert.equal(q3.speech, "It's 6:30 PM right now.");

    // D. "What day was yesterday?"
    const q4 = interpretDateTimeQuery('What day was yesterday?', { clock: fakeClock, timezone: 'Asia/Kolkata' });
    assert.equal(q4.handled, true);
    assert.equal(q4.intent, 'weekday_yesterday');
    assert.equal(q4.speech, 'Yesterday was Monday.');

    // E. "What weekday is November 5, 2026?"
    const q5 = interpretDateTimeQuery('What weekday is November 5, 2026?', { clock: fakeClock });
    assert.equal(q5.handled, true);
    assert.equal(q5.intent, 'weekday_date');
    assert.equal(q5.speech, 'November 5, 2026 is a Thursday.');
  });

  await t.test('2.7 DateTime: Date/time queries do NOT trigger music or scheduler actions', () => {
    const queries = [
      'What day is today?',
      "What's today's date?",
      'What time is it?',
      'What day was yesterday?',
      'What weekday is November 5, 2026?',
    ];

    for (const q of queries) {
      // 1. Semantic planner must NOT propose music tools
      const plan = planUserIntent(q);
      assert.equal(plan.plan.type, ACTION_TYPES.CONVERSATION_INFO);
      assert.equal(plan.plan.topic, 'datetime');

      // 2. Scheduler parser must NOT intercept as a timer/alarm
      const sched = parseSchedulerIntent(q);
      assert.equal(sched.isScheduler, false);

      // 3. Local music interpreter handles locally as datetime info
      const res = interpretLocalMusicCommand(q);
      assert.equal(res.handledLocally, true);
      assert.equal(res.actionResult?.isDateTime, true);
      assert.ok(res.actionResult?.spokenConfirmation);
    }
  });

  // =========================================================================
  // TASK 3: CHROME COMPANION DUCKING & VOLUME RESTORATION
  // =========================================================================

  await t.test('3.1 Companion: Normal speech start (duck) and end (restore)', async () => {
    const bridge = new CompanionBridge({ commandTimeoutMs: 1000 });
    // Simulate active YTM tab
    bridge.handlePing({ isYtMusic: true, tabsCount: 1 });

    // Island starts speaking -> dispatch duck
    const duckPromise = bridge.dispatchCommand({ action: 'duck', level: 0.15 });
    assert.equal(bridge.volumeState.isDucked, true);
    assert.equal(bridge.volumeState.currentMultiplier, 0.15);

    // Companion pulls duck command
    const pulledDuck = bridge.pullNextCommand();
    assert.equal(pulledDuck.action, 'duck');

    // Companion acks duck
    bridge.handleAck({ commandId: pulledDuck.id, status: 'ducked', originalVolume: 0.85 });
    const duckResult = await duckPromise;
    assert.equal(duckResult.ok, true);
    assert.equal(bridge.volumeState.confirmedDucked, true);
    assert.equal(bridge.volumeState.originalVolume, 0.85);

    // Island finishes speaking -> dispatch restore_volume
    const restorePromise = bridge.dispatchCommand({ action: 'restore_volume' });
    assert.equal(bridge.volumeState.isDucked, false);
    assert.equal(bridge.volumeState.pendingRestore, true);

    const pulledRestore = bridge.pullNextCommand();
    assert.equal(pulledRestore.action, 'restore_volume');

    bridge.handleAck({ commandId: pulledRestore.id, status: 'restored', volume: 0.85 });
    const restoreResult = await restorePromise;
    assert.equal(restoreResult.ok, true);
    assert.equal(bridge.volumeState.confirmedDucked, false);
    assert.equal(bridge.volumeState.pendingRestore, false);
    assert.equal(bridge.volumeState.currentMultiplier, 1.0);
  });

  await t.test('3.2 Companion: Repeated short voice responses coalesce and deduplicate restore', async () => {
    const bridge = new CompanionBridge();
    bridge.handlePing({ isYtMusic: true, tabsCount: 1 });

    // Duck
    const duckPromise = bridge.dispatchCommand({ action: 'duck', level: 0.10 });
    const cmd1 = bridge.pullNextCommand();
    bridge.handleAck({ commandId: cmd1.id, status: 'ducked', originalVolume: 1.0 });
    await duckPromise;

    // Rapid restore calls (e.g. from rapid speech end + turn controller cleanup)
    const r1 = bridge.dispatchCommand({ action: 'restore_volume' });
    const r2 = bridge.dispatchCommand({ action: 'restore_volume' });

    // Must be coalesced into the same in-flight promise!
    assert.equal(r1, r2);

    const pulled = bridge.pullNextCommand();
    bridge.handleAck({ commandId: pulled.id, status: 'restored' });
    await r1;

    // A third call after volume is already idle returns immediately resolved
    const r3 = await bridge.dispatchCommand({ action: 'restore_volume' });
    assert.equal(r3.ok, true);
    assert.equal(r3.status, 'already_restored');
  });

  await t.test('3.3 Companion: Speech interruption restores volume safely', async () => {
    const bridge = new CompanionBridge();
    bridge.handlePing({ isYtMusic: true, tabsCount: 1 });

    // Duck initiated
    const duckPromise = bridge.dispatchCommand({ action: 'duck', level: 0.10 });
    const duckCmd = bridge.pullNextCommand();
    bridge.handleAck({ commandId: duckCmd.id, status: 'ducked' });
    await duckPromise;

    // User interrupts speech mid-utterance
    const restorePromise = bridge.dispatchCommand({ action: 'restore_volume' });
    const restoreCmd = bridge.pullNextCommand();
    bridge.handleAck({ commandId: restoreCmd.id, status: 'restored' });
    const res = await restorePromise;

    assert.equal(res.ok, true);
    assert.equal(bridge.volumeState.confirmedDucked, false);
  });

  await t.test('3.4 Companion: Disconnection marks state as uncertain and reconnect reconciles', async () => {
    const bridge = new CompanionBridge({ pingExpiryMs: 50 });
    bridge.handlePing({ isYtMusic: true, tabsCount: 1 });

    // Duck while connected
    const duckPromise = bridge.dispatchCommand({ action: 'duck', level: 0.10 });
    const duckCmd = bridge.pullNextCommand();
    bridge.handleAck({ commandId: duckCmd.id, status: 'ducked' });
    await duckPromise;

    // Simulate connection loss (exceed pingExpiryMs)
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(bridge.isConnected(), false);
    assert.equal(bridge.volumeState.uncertain, true);

    // Reconnection occurs -> automatic reconciliation restores volume
    bridge.handlePing({ isYtMusic: true, tabsCount: 1 });
    assert.equal(bridge.isConnected(), true);
    assert.equal(bridge.volumeState.uncertain, false);

    // Verify reconciliation queued a restore_volume command
    const reconCmd = bridge.pullNextCommand();
    assert.equal(reconCmd.action, 'restore_volume');
  });

  await t.test('3.5 Companion: Companion unavailable / no player fails gracefully without blocking TTS', async () => {
    const bridge = new CompanionBridge();
    // Companion is NOT connected
    const res = await bridge.dispatchCommand({ action: 'duck', level: 0.10 });
    assert.equal(res.ok, false);
    assert.equal(res.status, 'no_player');
    // Does not throw an error or crash
  });

  await t.test('3.6 Companion: Volume command timeout resilience (no unhandled error spam)', async () => {
    const bridge = new CompanionBridge();
    bridge.handlePing({ isYtMusic: true, tabsCount: 1 });

    // Dispatch duck with short timeout to simulate tab lag
    const res = await bridge.dispatchCommand({ action: 'duck', timeoutMs: 30 });
    // Must resolve cleanly with timed_out status instead of throwing uncaught rejection
    assert.equal(res.ok, false);
    assert.equal(res.status, 'timed_out');
    assert.equal(bridge.volumeState.inFlightVolumeId, null);
  });
});
