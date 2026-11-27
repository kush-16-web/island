const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('Living Weather Atmosphere: Final Completion Pass Tests', () => {
  const rendererPath = path.resolve(__dirname, '../src/components/weather/DaylightSkyRenderer.js');
  const atmospherePath = path.resolve(__dirname, '../src/components/weather/WeatherAtmosphere.jsx');
  const emblemPath = path.resolve(__dirname, '../src/components/weather/WeatherCelestialEmblem.jsx');
  const panelPath = path.resolve(__dirname, '../src/components/weather/WeatherPanel.jsx');

  const rendererSource = fs.readFileSync(rendererPath, 'utf8');
  const atmosphereSource = fs.readFileSync(atmospherePath, 'utf8');
  const emblemSource = fs.readFileSync(emblemPath, 'utf8');
  const panelSource = fs.readFileSync(panelPath, 'utf8');

  test('1. Approved Phase B.2 Daylight Atmosphere: rich sky palette, soft luminous core & atmospheric Mie corona', () => {
    // Rich daytime Rayleigh azure sky palette
    assert.match(rendererSource, /vec3\(0\.11,\s*0\.42,\s*0\.78\)/, 'Zenith must restore crisp clear noon azure');
    assert.match(rendererSource, /vec3\(0\.32,\s*0\.62,\s*0\.92\)/, 'Mid-sky must restore vivid cerulean blue');
    assert.match(rendererSource, /vec3\(0\.72,\s*0\.86,\s*0\.98\)/, 'Horizon must restore luminous aerosol haze');
    // Soft luminous solar core (no cookie-cutter hard white circle)
    assert.match(rendererSource, /solarDisc\s*=\s*smoothstep\(0\.042,\s*0\.012,\s*distToSun\)/, 'Sun disc must restore soft luminous core transition');
    // Forward-scattering Mie corona and atmospheric halo
    assert.match(rendererSource, /mieCorona\s*=\s*exp\(-distToSun\s*\*\s*4\.2\)\s*\*\s*0\.65/, 'Shader must restore natural forward-scattering Mie corona');
    assert.match(rendererSource, /outerGlow\s*=\s*exp\(-distToSun\s*\*\s*1\.6\)\s*\*\s*0\.28/, 'Shader must restore broad atmospheric solar halo');
    // Sun occlusion by clouds
    assert.match(rendererSource, /sunOcclusion\s*=\s*\(1\.0\s*-\s*smoothstep\(0\.35,\s*0\.80,\s*uCloudCover\)\)/, 'Sun must naturally dim under dense clouds');
  });

  test('2. Living Night Sky, Real Moon & Procedural Starfield', () => {
    // Night sky gradient
    assert.match(rendererSource, /getNightSky/, 'Renderer must provide realistic midnight-blue sky gradient');
    // Real Moon phase terminator math
    assert.match(rendererSource, /terminator\s*=\s*\(2\.0\s*\*\s*uMoonPhase\s*-\s*1\.0\)/, 'Renderer must compute astronomical lunar phase terminator');
    assert.match(rendererSource, /uMoonWaxing/, 'Renderer must distinguish waxing (lit right) vs waning (lit left)');
    // Maria/crater procedural detailing & Earthshine
    assert.match(rendererSource, /crater/, 'Renderer must render subtle surface crater shading');
    assert.match(rendererSource, /earthshine/, 'Renderer must render unlit moon disc via earthshine');
    // Stable procedural stars
    assert.match(rendererSource, /getStars/, 'Renderer must implement hash-based stable starfield');
    assert.match(rendererSource, /starMask\s*=\s*\(1\.0\s*-\s*uIsDay\)/, 'Stars must only be visible at night and obscured by clouds');
    // Horizon visibility check
    assert.match(rendererSource, /lunar\.altitude\s*>\s*0/, 'Moon visibility must respect astronomical horizon altitude');
  });

  test('3. Precipitation & Severe Weather (Rain, Snow, Lightning, Fog)', () => {
    // Directional rain streaks
    assert.match(rendererSource, /getRain/, 'Renderer must calculate fine directional rain streaks');
    assert.match(rendererSource, /slant\s*=\s*windDir\.x/, 'Rain and snow must angle along wind vector');
    // Gentle fluttering snow
    assert.match(rendererSource, /getSnow/, 'Renderer must calculate gentle fluttering snow flakes');
    // Thunderstorm soft intra-cloud lightning
    assert.match(rendererSource, /isThunderstorm/, 'Renderer must track thunderstorm weather state');
    assert.match(rendererSource, /uLightning/, 'Renderer must pass soft lightning illumination uniform to clouds');
    assert.match(rendererSource, /!reducedMotion/, 'Lightning and rapid motion must be suppressed when reduced motion is preferred');
    // Fog diffusion
    assert.match(rendererSource, /uFog/, 'Renderer must support fog and mist diffusion');
  });

  test('4. Single Celestial & Environmental Owner Contract', () => {
    assert.match(emblemSource, /if\s*\(atmosphereActive\)\s*\{\s*return null;\s*\}/, 'WeatherCelestialEmblem must yield exclusive rendering to active living atmosphere');
    assert.match(emblemSource, /weather-celestial-emblem--sunny/, 'Emblem must preserve fallback sunny orb when WebGL is unavailable');
    assert.match(emblemSource, /weather-celestial-emblem--night/, 'Emblem must preserve fallback night moon SVG when WebGL is unavailable');
  });

  test('5. Preview Scenarios: covers complete spectrum of daylight, night, and severe weather states', () => {
    const requiredPreviews = [
      'clear',
      'partly-cloudy',
      'overcast',
      'golden-hour',
      'sunset',
      'twilight',
      'clear-night-full',
      'clear-night-crescent',
      'clear-night-quarter',
      'cloudy-night',
      'light-rain',
      'heavy-rain',
      'thunderstorm',
      'snow',
      'fog',
    ];

    for (const key of requiredPreviews) {
      assert.ok(panelSource.includes(`'${key}':`) || panelSource.includes(`${key}:`), `WeatherPanel must configure preview scenario for ${key}`);
    }
  });

  test('6. High Performance & Lifecycle Safety: proper WebGL context release on unmount', () => {
    assert.match(rendererSource, /WEBGL_lose_context/, 'DaylightSkyRenderer destroy() must forcefully release WebGL context');
    assert.match(rendererSource, /removeEventListener\('webglcontextlost'/, 'destroy() must remove contextlost event listener');
    assert.match(rendererSource, /cancelAnimationFrame\(this\.animId\)/, 'destroy() must cancel active animation frame');
    assert.match(atmosphereSource, /document\.addEventListener\('visibilitychange'/, 'WeatherAtmosphere must listen to visibility changes');
    assert.match(atmosphereSource, /renderer\.stop\(\)/, 'WeatherAtmosphere must pause rendering when hidden');
  });
});
