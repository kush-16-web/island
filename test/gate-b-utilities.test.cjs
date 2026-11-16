const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('Gate B: notch-state dimensions conform to Gate B compact contract', async () => {
  const { computeNotchDimensions, NOTCH_STATES } = await import('../src/lib/notch-state.js');

  // 1. Launcher without active media: compact 520x240
  const launcherIdle = computeNotchDimensions({
    mode: 'hub',
    tab: 'launcher',
    notchState: NOTCH_STATES.EXPANDED,
    hasActiveMedia: false,
  });
  assert.equal(launcherIdle.width, 520, 'Launcher idle width must be 520px');
  assert.equal(launcherIdle.height, 240, 'Launcher idle height must be 240px');

  // 2. Launcher with active media (includes Now Playing widget): 520x276
  const launcherMedia = computeNotchDimensions({
    mode: 'hub',
    tab: 'launcher',
    notchState: NOTCH_STATES.EXPANDED,
    hasActiveMedia: true,
  });
  assert.equal(launcherMedia.width, 520, 'Launcher with media width must be 520px');
  assert.equal(launcherMedia.height, 276, 'Launcher with media height must be 276px');

  // 3. Clock detail view: 520x280
  const clockLayout = computeNotchDimensions({
    mode: 'hub',
    tab: 'clock',
    notchState: NOTCH_STATES.EXPANDED,
  });
  assert.equal(clockLayout.width, 520, 'Clock width must be 520px');
  assert.equal(clockLayout.height, 280, 'Clock height must be 280px');
});

test('Gate B: styles.css contains pitch-black and separated clock rules', () => {
  const css = fs.readFileSync(path.join(__dirname, '../src/styles.css'), 'utf8');

  // Pitch black enforcement
  assert.ok(css.includes('.island--notch.is-pitch-black'), 'Must include .island--notch.is-pitch-black');
  assert.ok(css.includes('.island--notch.is-pitch-black .hub'), 'Must include .island--notch.is-pitch-black .hub');
  assert.ok(css.includes('background: #000000 !important;'), 'Must enforce background: #000000 !important;');

  // Separated segmented control
  assert.ok(css.includes('.clock-segmented'), 'Must include .clock-segmented');
  assert.ok(css.includes('.clock-segmented__btn'), 'Must include .clock-segmented__btn');

  // Digit spinner
  assert.ok(css.includes('.digit-spin'), 'Must include .digit-spin');
  assert.ok(css.includes('.digit-spin__num'), 'Must include .digit-spin__num');

  // Now Playing widget in Utilities
  assert.ok(css.includes('.utilities-now-playing'), 'Must include .utilities-now-playing');
  assert.ok(css.includes('.utilities-np__art-btn'), 'Must include .utilities-np__art-btn');

  // Charcoal tile background (#18191c)
  assert.ok(css.includes('background: #18191c;'), 'Must style utility tiles in dark charcoal');
});

test('Gate B: ClockPanel exports and supports presets & digits', () => {
  const code = fs.readFileSync(path.join(__dirname, '../src/components/panels/ClockPanel.jsx'), 'utf8');
  assert.ok(code.includes("const PRESET_TIMERS = ["), 'Must define PRESET_TIMERS');
  assert.ok(code.includes("{ label: '1m', minutes: 1 }"), 'Must have 1m preset');
  assert.ok(code.includes("{ label: '5m', minutes: 5 }"), 'Must have 5m preset');
  assert.ok(code.includes("{ label: '10m', minutes: 10 }"), 'Must have 10m preset');
  assert.ok(code.includes("{ label: '25m', minutes: 25 }"), 'Must have 25m preset');
  assert.ok(code.includes("function DigitSpinner"), 'Must define DigitSpinner component');
  assert.ok(code.includes("subMode === 'countdown'"), 'Must support Countdown submode');
  assert.ok(code.includes("subMode === 'alarms'"), 'Must support Alarms submode');
  assert.ok(code.includes("pausedTimerState"), 'Must support pause / resume timer');
});

test('Gate B: LauncherPanel conforms to Gate B contract', () => {
  const code = fs.readFileSync(path.join(__dirname, '../src/components/panels/LauncherPanel.jsx'), 'utf8');
  assert.ok(code.includes("Little Island"), 'Header must display Little Island title');
  assert.ok(code.includes("utilities-now-playing"), 'Must include Now Playing widget');
  assert.ok(code.includes("activeUtility"), 'Must support activeUtility morphing');
  assert.ok(code.includes("Ask Island"), 'Must name Assistant tile Ask Island');
});
