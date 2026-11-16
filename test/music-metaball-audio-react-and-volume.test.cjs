'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const metaBallsJsxPath = path.join(repoRoot, 'src', 'components', 'animations', 'MetaBalls.jsx');
const ambientMetaballsPath = path.join(repoRoot, 'src', 'components', 'AmbientLiquidMetaballs.jsx');
const stylesCssPath = path.join(repoRoot, 'src', 'styles.css');
const electronMainPath = path.join(repoRoot, 'electron', 'main.js');

test('Audio-Reactive Metaballs, Dynamic Album Color & Refined Volume Slider Suite', async (t) => {
  await t.test('1. MetaBalls.jsx: Universal color parser supports hex, rgb, and hsl without defaulting to white', () => {
    const metaBallsCode = fs.readFileSync(metaBallsJsxPath, 'utf8');

    assert.ok(
      metaBallsCode.includes('rgbParts = s.match(/rgba?\\(') || metaBallsCode.includes('document.createElement(\'canvas\')'),
      'MetaBalls.jsx must parse rgb/hsl/canvas colors beyond just hex strings',
    );
    assert.ok(
      !metaBallsCode.includes('if (!/^[0-9a-f]{6}/i.test(hex)) return [1, 1, 1];\n  return [0, 2, 4]'),
      'MetaBalls.jsx must not reject non-hex color formats with strict hex-only check',
    );
  });

  await t.test('2. MetaBalls.jsx: Anchors simulation origin to the right side (originX: 0.72) to clear lyrics space', () => {
    const metaBallsCode = fs.readFileSync(metaBallsJsxPath, 'utf8');

    assert.ok(
      metaBallsCode.includes('uOrigin') && metaBallsCode.includes('gl_FragCoord.xy - uOrigin * uResolution'),
      'Shader fragment must offset coordinate space by uOrigin',
    );
    assert.ok(
      metaBallsCode.includes('originX = 0.72') || metaBallsCode.includes('originX: 0.72'),
      'MetaBalls must default originX to ~0.72 to place cluster in right void',
    );
  });

  await t.test('3. styles.css: Volume inline track is locked to sleek 3.5px and never balloons to thick 7px on hover', () => {
    const stylesCode = fs.readFileSync(stylesCssPath, 'utf8');

    assert.ok(
      stylesCode.includes('.np__volume-inline .mvc__track {\n  height: 3.5px !important;'),
      'Volume track must be locked to 3.5px height',
    );
    assert.ok(
      stylesCode.includes('.np__volume-inline:hover .mvc__track,\n.np__volume-inline.is-dragging .mvc__track'),
      'Volume track hover must not balloon to 7px',
    );
    assert.ok(
      stylesCode.includes('.np__volume-inline .mvc__fill {\n  background: rgba(255, 255, 255, 0.88);'),
      'Volume fill must use sleek semi-translucent material matching song scrubber',
    );
  });

  await t.test('4. electron/main.js: setDisplayMediaRequestHandler provides loopback system audio without user prompt', () => {
    const mainCode = fs.readFileSync(electronMainPath, 'utf8');

    assert.ok(
      mainCode.includes('audio: \'loopback\''),
      'Electron setDisplayMediaRequestHandler must provide audio: "loopback" for desktop audio capture',
    );
  });

  await t.test('5. AmbientLiquidMetaballs.jsx: Integrates real-time audio loopback with bass kick transient detection', () => {
    const ambientCode = fs.readFileSync(ambientMetaballsPath, 'utf8');

    assert.ok(
      ambientCode.includes('getLoopbackAnalyser') && ambientCode.includes('getByteFrequencyData'),
      'AmbientLiquidMetaballs must hook into desktop audio analyser and track frequency data',
    );
    assert.ok(
      ambientCode.includes('originX={0.72}'),
      'AmbientLiquidMetaballs must pass right-side originX={0.72} to MetaBalls component',
    );
  });

  await t.test('6. Island.jsx & useThemeMode.js: Monochrome artwork falls back to clean neutral silver/graphite without salmon red hash', () => {
    const islandCode = fs.readFileSync(path.join(repoRoot, 'src', 'components', 'Island.jsx'), 'utf8');
    const themeModeCode = fs.readFileSync(path.join(repoRoot, 'src', 'components', 'common', 'useThemeMode.js'), 'utf8');

    assert.ok(
      islandCode.includes('(media.active && !media.art)'),
      'Island.jsx must only hash title/artist to random hue when media.art does NOT exist',
    );
    assert.ok(
      themeModeCode.includes('NEUTRAL_GRAPHITE_ACCENT'),
      'useThemeMode.js must use NEUTRAL_GRAPHITE_ACCENT for monochrome covers',
    );
  });

  await t.test('7. MetaBalls.jsx: Beat reaction uses gentle fluid breathing without violent velocity kicks', () => {
    const metaBallsCode = fs.readFileSync(metaBallsJsxPath, 'utf8');

    assert.ok(
      !metaBallsCode.includes('* dt * 12'),
      'MetaBalls.jsx must not inject chaotic * dt * 12 velocity kicks into orbital motion',
    );
    assert.ok(
      metaBallsCode.includes('b.radius * (1 + beat * 0.18)'),
      'MetaBalls.jsx must gently swell radius by 18% on beats for natural liquid breathing',
    );
  });
});
