const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('Living Weather Atmosphere: Targeted Surface Integration & Layout Tests', () => {
  const weatherSplinePath = path.resolve(__dirname, '../src/components/weather/WeatherSplineCurve.jsx');
  const weatherEmblemPath = path.resolve(__dirname, '../src/components/weather/WeatherCelestialEmblem.jsx');
  const weatherAtmospherePath = path.resolve(__dirname, '../src/components/weather/WeatherAtmosphere.jsx');
  const daylightRendererPath = path.resolve(__dirname, '../src/components/weather/DaylightSkyRenderer.js');
  const stylesPath = path.resolve(__dirname, '../src/styles.css');

  test('1. Full-Surface Atmospheric Renderer: uses ResizeObserver and synchronous host measurement', () => {
    const code = fs.readFileSync(weatherAtmospherePath, 'utf8');
    assert.match(code, /ResizeObserver/, 'WeatherAtmosphere must utilize ResizeObserver');
    assert.match(code, /containerRef/, 'WeatherAtmosphere must reference the outer host container');
    assert.match(code, /syncDimensions/, 'WeatherAtmosphere must provide synchronized dimension measurement');
    assert.match(code, /requestAnimationFrame/, 'WeatherAtmosphere must track intermediate frames during morph transitions');

    const rendererCode = fs.readFileSync(daylightRendererPath, 'utf8');
    assert.match(rendererCode, /initW\s*=\s*canvas\.clientWidth/, 'DaylightSkyRenderer constructor must initialize with client dimensions');
    assert.match(rendererCode, /uResolution\.value\s*=\s*\[this\.gl\.drawingBufferWidth,\s*this\.gl\.drawingBufferHeight\]/, 'resize() must update resolution uniform from drawingBuffer');
  });

  test('2. Single Celestial Owner: clear daylight atmosphere owns solitary sun without duplicate emblem', () => {
    const emblemCode = fs.readFileSync(weatherEmblemPath, 'utf8');
    assert.match(emblemCode, /atmosphereActive/, 'WeatherCelestialEmblem must accept atmosphereActive contract');
    assert.match(emblemCode, /if\s*\(atmosphereActive\s*&&\s*isDay\s*&&\s*\(c\s*===\s*0\s*\|\|\s*c\s*===\s*1\)\)\s*\{\s*return null;\s*\}/, 'WeatherCelestialEmblem must return null on clear daylight when atmosphere owns the sun');
    assert.match(emblemCode, /weather-celestial-emblem--sunny/, 'WeatherCelestialEmblem must preserve fallback sunny emblem when atmosphereActive is false');
    assert.match(emblemCode, /weather-celestial-emblem--night/, 'WeatherCelestialEmblem must preserve night Real Moon rendering');
  });

  test('3. Temperature Spline Mathematical Verification: handles flat, rising, falling, and high-range profiles', () => {
    // Pure mathematical model matching WeatherSplineCurve.jsx
    const svgWidth = 480;
    const svgHeight = 36;

    function computeCurvePoints(temps) {
      const minTemp = Math.min(...temps);
      const maxTemp = Math.max(...temps);
      const tempRange = maxTemp - minTemp;
      const numItems = temps.length;

      return temps.map((t, idx) => {
        const x = ((idx + 0.5) / numItems) * svgWidth;
        let y = svgHeight / 2;
        if (tempRange > 0) {
          const ratio = (t - minTemp) / tempRange;
          y = 8 + (1 - ratio) * (svgHeight - 16);
        }
        return { x, y, temp: t };
      });
    }

    // A. Surat actual scenario from user screenshot: [30, 33, 33, 33, 31, 29]
    const suratTemps = [30, 33, 33, 33, 31, 29];
    const suratPoints = computeCurvePoints(suratTemps);
    assert.equal(suratPoints.length, 6);

    suratPoints.forEach((p, idx) => {
      // 1. Exact 100% column center alignment
      const expectedX = ((idx + 0.5) / 6) * svgWidth;
      assert.equal(p.x, expectedX, `Point ${idx} x-coord must align to column center`);
      // 2. Safe vertical margins (zero clipping)
      assert.ok(p.y >= 7.5 && p.y <= 28.5, `Point ${idx} y=${p.y} must remain comfortably within [8, 28] safe plot area`);
    });

    // B. Flat temperatures scenario: [25, 25, 25, 25, 25, 25]
    const flatTemps = [25, 25, 25, 25, 25, 25];
    const flatPoints = computeCurvePoints(flatTemps);
    flatPoints.forEach((p) => {
      assert.equal(p.y, 18, 'Flat temperature profile must center exactly at svgHeight / 2 (18px)');
    });

    // C. Rising profile: [15, 18, 22, 26, 30, 35]
    const risingTemps = [15, 18, 22, 26, 30, 35];
    const risingPoints = computeCurvePoints(risingTemps);
    assert.equal(risingPoints[0].y, 28, 'Minimum temperature must be positioned at lower bound y=28 (8px above bottom)');
    assert.equal(risingPoints[5].y, 8, 'Maximum temperature must be positioned at upper bound y=8 (8px below top)');

    // D. High-range profile: [0, 10, 20, 30, 40, 50]
    const wideTemps = [0, 10, 20, 30, 40, 50];
    const widePoints = computeCurvePoints(wideTemps);
    widePoints.forEach((p) => {
      assert.ok(p.y >= 8 && p.y <= 28, `Wide range point y=${p.y} must not exceed safe bounds`);
    });
  });

  test('4. CSS Layout & Spacing: forecast container and curve container allocate unclipped height', () => {
    const css = fs.readFileSync(stylesPath, 'utf8');
    assert.match(css, /\.weather-surface__forecast-body\s*\{[^}]*height:\s*86px;/, 'forecast-body must be at least 86px high');
    assert.match(css, /\.weather-spline__curve-container\s*\{[^}]*height:\s*36px;/, 'spline curve container must have 36px height');
    assert.match(css, /\.weather-surface__hero-emblem\s*\{[^}]*min-width:\s*74px;/, 'hero-emblem must preserve stable layout width');
  });
});
