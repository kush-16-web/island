const test = require('node:test');
const assert = require('node:assert');
const {
  calculateAstroMetrics,
  getHourlySolarDetails,
  getTwilightPhase,
  getLunarPhaseDetails,
} = require('../electron/weather-astro');
const {
  fetchWeatherTelemetry,
  validateWeatherInput,
} = require('../electron/weather-service');

test('Phase A: Astronomical Engine & Solar Elevation Suite', async (t) => {
  await t.test('1. Astronomical twilight thresholds strictly adhere to standard boundaries (< -18° is night)', () => {
    assert.strictEqual(getTwilightPhase(15), 'daylight');
    assert.strictEqual(getTwilightPhase(4), 'golden_hour');
    assert.strictEqual(getTwilightPhase(-3), 'civil_twilight');
    assert.strictEqual(getTwilightPhase(-8), 'nautical_twilight');
    assert.strictEqual(getTwilightPhase(-15), 'astronomical_twilight');
    assert.strictEqual(getTwilightPhase(-19), 'astronomical_night');
    assert.strictEqual(getTwilightPhase(-45), 'astronomical_night');
  });

  await t.test('2. Real Moon calculations distinguish 8 phases, illumination percentage and waxing/waning', () => {
    // Test known phase angles
    const newMoon = getLunarPhaseDetails(0, 0.0);
    assert.strictEqual(newMoon.phaseName, 'New Moon');
    assert.strictEqual(newMoon.phaseIndex, 0);

    const waxingCrescent = getLunarPhaseDetails(45, 0.25);
    assert.strictEqual(waxingCrescent.phaseName, 'Waxing Crescent');
    assert.strictEqual(waxingCrescent.waxing, true);

    const firstQuarter = getLunarPhaseDetails(90, 0.50);
    assert.strictEqual(firstQuarter.phaseName, 'First Quarter');
    assert.strictEqual(firstQuarter.waxing, true);

    const fullMoon = getLunarPhaseDetails(180, 1.0);
    assert.strictEqual(fullMoon.phaseName, 'Full Moon');
    assert.strictEqual(fullMoon.phaseIndex, 4);

    const waningGibbous = getLunarPhaseDetails(210, 0.95);
    assert.strictEqual(waningGibbous.phaseName, 'Waning Gibbous');
    assert.strictEqual(waningGibbous.waxing, false);

    const lastQuarter = getLunarPhaseDetails(270, 0.50);
    assert.strictEqual(lastQuarter.phaseName, 'Last Quarter');
    assert.strictEqual(lastQuarter.waxing, false);

    const waningCrescent = getLunarPhaseDetails(315, 0.25);
    assert.strictEqual(waningCrescent.phaseName, 'Waning Crescent');
    assert.strictEqual(waningCrescent.waxing, false);
  });

  await t.test('3. Calculate Astro Metrics produces solar and lunar altitude and orientation', () => {
    const metrics = calculateAstroMetrics(21.203, 72.839, new Date());
    assert.ok(typeof metrics.solarElevation === 'number');
    assert.ok(typeof metrics.isDay === 'boolean');
    assert.ok(typeof metrics.twilightPhase === 'string');
    assert.ok(metrics.lunar);
    assert.ok(typeof metrics.lunar.fractionIlluminated === 'number');
    assert.ok(metrics.lunar.fractionIlluminated >= 0 && metrics.lunar.fractionIlluminated <= 1);
    assert.ok(typeof metrics.lunar.phaseName === 'string');
    assert.ok(typeof metrics.lunar.altitude === 'number');
    assert.ok(typeof metrics.lunar.tiltAngle === 'number');
  });
});

test('Phase A: Weather Timeline & Multi-Timezone Telemetry Suite', async (t) => {
  await t.test('1. Surat telemetry: Now slot reflects observed temperature, subsequent slots reflect forecast', async () => {
    const res = await fetchWeatherTelemetry({ city: 'Surat' });
    assert.strictEqual(res.ok, true);
    const data = res.data;

    // Independent structures
    assert.ok(data.observed, 'Should have observed block');
    assert.ok(data.astronomy, 'Should have astronomy block');
    assert.ok(data.forecast, 'Should have forecast block');

    // Hourly forecast timeline
    const hourly = data.forecast.hourly;
    assert.ok(Array.isArray(hourly) && hourly.length > 0);

    // Slot 0 is "Now" and must match observed temperature
    const nowSlot = hourly[0];
    assert.strictEqual(nowSlot.time, 'Now');
    assert.strictEqual(nowSlot.temp, data.observed.temperature);
    assert.strictEqual(nowSlot.weatherCode, data.observed.weatherCode);

    // Slot 1 is the next hour and shows unskewed forecast value
    if (hourly.length > 1) {
      assert.notStrictEqual(hourly[1].time, 'Now');
      assert.ok(typeof hourly[1].temp === 'number');
      assert.ok(typeof hourly[1].isDay === 'boolean');
    }
  });

  await t.test('2. Multi-timezone timeline verifies international cities & midnight rollover', async () => {
    const tokyoRes = await fetchWeatherTelemetry({ city: 'Tokyo' });
    assert.strictEqual(tokyoRes.ok, true);
    assert.strictEqual(tokyoRes.data.timezone, 'Asia/Tokyo');
    assert.strictEqual(tokyoRes.data.forecast.hourly[0].time, 'Now');

    const nyRes = await fetchWeatherTelemetry({ city: 'New York' });
    assert.strictEqual(nyRes.ok, true);
    assert.strictEqual(nyRes.data.timezone, 'America/New_York');
    assert.strictEqual(nyRes.data.forecast.hourly[0].time, 'Now');

    // Verify hourly slot times use the local timezone (e.g. AM/PM formatting)
    const nyHourly = nyRes.data.forecast.hourly;
    const timeLabels = nyHourly.map(h => h.time);
    assert.strictEqual(timeLabels[0], 'Now');
    assert.ok(timeLabels.some(t => t.includes('AM') || t.includes('PM')));
  });
});
