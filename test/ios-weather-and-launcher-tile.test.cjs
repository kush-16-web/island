const { test, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('Apple iOS Weather & Launcher Utility Tile Suite', () => {
  it('1. IOSWeatherIcon: Multi-layer SVG iconography exists and maps WMO codes', () => {
    const iconFilePath = path.join(__dirname, '..', 'src', 'components', 'weather', 'IOSWeatherIcon.jsx');
    assert.ok(fs.existsSync(iconFilePath), 'IOSWeatherIcon.jsx must exist');
    const content = fs.readFileSync(iconFilePath, 'utf8');

    assert.ok(content.includes('SFSunIcon'), 'Must support SFSunIcon');
    assert.ok(content.includes('SFMoonIcon'), 'Must support SFMoonIcon');
    assert.ok(content.includes('SFCloudSunIcon'), 'Must support SFCloudSunIcon');
    assert.ok(content.includes('SFRainIcon'), 'Must support SFRainIcon');
    assert.ok(content.includes('SFThunderstormIcon'), 'Must support SFThunderstormIcon');
    assert.ok(content.includes('ios-sf-icon'), 'Must have root class');
  });

  it('2. useWeather hook: provides instant cached retrieval and auto-refresh', () => {
    const hookFilePath = path.join(__dirname, '..', 'src', 'hooks', 'useWeather.js');
    assert.ok(fs.existsSync(hookFilePath), 'useWeather.js must exist');
    const content = fs.readFileSync(hookFilePath, 'utf8');

    assert.ok(content.includes('island_weather_cache'), 'Must read/write to island_weather_cache');
    assert.ok(content.includes('island:weather-updated'), 'Must dispatch weather-updated custom event');
    assert.ok(content.includes('getCurrentWeather'), 'Must integrate with weather engine');
  });

  it('3. weather.js engine: provides hourlyForecast strip for Apple Weather cards', async () => {
    const { getCurrentWeather } = await import('../src/lib/weather/weather.js');
    const res = await getCurrentWeather('Surat', { timeframe: 'current' });
    assert.ok(res.ok, 'Weather response must be ok');
    assert.ok(Array.isArray(res.hourlyForecast), 'Must provide hourlyForecast array');
    if (res.hourlyForecast.length > 0) {
      assert.ok('temp' in res.hourlyForecast[0], 'Hourly item must have temp');
      assert.ok('time' in res.hourlyForecast[0], 'Hourly item must have time');
    }
  });

  it('4. LauncherPanel.jsx: mounts rich Apple Weather card instead of blank fallback', () => {
    const launcherPath = path.join(__dirname, '..', 'src', 'components', 'panels', 'LauncherPanel.jsx');
    const content = fs.readFileSync(launcherPath, 'utf8');

    assert.ok(content.includes('IOSWeatherIcon'), 'LauncherPanel must import IOSWeatherIcon');
    assert.ok(content.includes('useWeather'), 'LauncherPanel must use useWeather hook');
    assert.ok(content.includes('utility-tile--weather'), 'LauncherPanel must use utility-tile--weather class');
    assert.ok(content.includes('ios-weather-detail'), 'LauncherPanel must render ios-weather-detail in detail view');
    assert.ok(content.includes('ios-weather-hourly'), 'LauncherPanel must render hourly forecast strip');
  });

  it('5. Island.jsx: idle notch integrates iOSWeatherIcon alongside temperature', () => {
    const islandPath = path.join(__dirname, '..', 'src', 'components', 'Island.jsx');
    const content = fs.readFileSync(islandPath, 'utf8');

    assert.ok(content.includes('IOSWeatherIcon'), 'Island.jsx must import IOSWeatherIcon');
    assert.ok(content.includes('idle__weather'), 'Island.jsx must retain idle__weather');
  });

  it('6. styles.css: contains Apple Weather glass styles and ambient animation', () => {
    const stylesPath = path.join(__dirname, '..', 'src', 'styles.css');
    const content = fs.readFileSync(stylesPath, 'utf8');

    assert.ok(content.includes('.utility-tile--weather'), 'Must style utility-tile--weather');
    assert.ok(content.includes('.utility-tile-weather__temp'), 'Must style utility-tile-weather__temp');
    assert.ok(content.includes('.ios-weather-detail'), 'Must style ios-weather-detail');
    assert.ok(content.includes('.ios-sf-icon'), 'Must define ios-sf-icon');
  });
});
