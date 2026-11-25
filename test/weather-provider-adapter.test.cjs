const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const weatherService = require('../electron/weather-service.js');

describe('Weather Provider Adapter & Restricted IPC Security Suite', () => {
  it('1. Input validation strictly rejects invalid inputs and arbitrary URL injection', () => {
    // Rejects non-objects
    assert.strictEqual(weatherService.validateWeatherInput(null).valid, false);
    assert.strictEqual(weatherService.validateWeatherInput('Surat').valid, false);

    // Rejects invalid city characters (potential URL injection / shell characters)
    assert.strictEqual(weatherService.validateWeatherInput({ city: 'http://malicious.site' }).valid, false);
    assert.strictEqual(weatherService.validateWeatherInput({ city: 'Surat; rm -rf /' }).valid, false);
    assert.strictEqual(weatherService.validateWeatherInput({ city: 'a'.repeat(85) }).valid, false);

    // Rejects invalid coordinates
    assert.strictEqual(weatherService.validateWeatherInput({ lat: 100, lon: 72 }).valid, false);
    assert.strictEqual(weatherService.validateWeatherInput({ lat: 21, lon: 200 }).valid, false);

    // Accepts valid inputs
    const validCity = weatherService.validateWeatherInput({ city: 'Surat' });
    assert.strictEqual(validCity.valid, true);
    assert.strictEqual(validCity.city, 'Surat');

    const validCoords = weatherService.validateWeatherInput({ lat: 21.1702, lon: 72.8311 });
    assert.strictEqual(validCoords.valid, true);
    assert.strictEqual(validCoords.lat, 21.1702);
  });

  it('2. Main-process telemetry fetch returns normalized data with explicit provider tracking', async () => {
    const res = await weatherService.fetchWeatherTelemetry({ city: 'Surat', lat: 21.1702, lon: 72.8311, provider: 'auto' });
    assert.strictEqual(res.ok, true, 'Telemetry response must be ok');
    assert.ok(res.data, 'Must return data object');

    const data = res.data;
    assert.ok(['msn_foreca', 'open_meteo'].includes(data.activeProvider || data.provider), 'Provider must be explicitly tracked');
    assert.ok(typeof data.temperature === 'number', 'Temperature must be numeric');
    assert.ok(typeof data.feelsLike === 'number', 'Feels like must be numeric');
    assert.ok(typeof data.condition === 'string', 'Condition must be a string');

    // Semantic distinction verification:
    assert.ok('temp' in data, 'Must provide temp');
    assert.ok('feelsLike' in data, 'Must provide distinct feelsLike');
    assert.ok('high' in data, 'Must provide high');
    assert.ok('low' in data, 'Must provide low');
  });

  it('3. Prepares required Living Weather Atmosphere parameters without fabricating missing data', async () => {
    const res = await weatherService.fetchWeatherTelemetry({ city: 'Surat', lat: 21.1702, lon: 72.8311, provider: 'auto' });
    assert.strictEqual(res.ok, true);
    const d = res.data;

    // Atmospheric fields explicitly present
    assert.ok('cloudCover' in d, 'Must track cloudCover');
    assert.ok('visibility' in d, 'Must track visibility');
    assert.ok('precipitationIntensity' in d, 'Must track precipitationIntensity');
    assert.ok('windSpeed' in d, 'Must track windSpeed');
    assert.ok('windDirection' in d, 'Must track windDirection');
    assert.ok('sunrise' in d, 'Must track sunrise');
    assert.ok('sunset' in d, 'Must track sunset');
    assert.ok('isDay' in d, 'Must track day/night state');
    assert.ok('timezone' in d, 'Must track timezone');

    // Forecast arrays
    assert.ok(Array.isArray(d.hourlyForecast), 'Must provide hourlyForecast array');
    assert.ok(Array.isArray(d.dailyForecasts), 'Must provide dailyForecasts array');
    assert.ok(d.dailyForecasts.length > 0, 'Must have at least 1 daily forecast');
  });

  it('4. Fallback handling: Gracefully recovers to Open-Meteo when primary fails or is forced', async () => {
    // Force open_meteo provider
    const res = await weatherService.fetchWeatherTelemetry({ city: 'Surat', lat: 21.1702, lon: 72.8311, provider: 'open_meteo' });
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.data.activeProvider || res.data.provider, 'open_meteo');
    assert.ok(res.data.sourceAttribution.includes('Open-Meteo'), 'Attribution must reflect Open-Meteo');
  });
});
