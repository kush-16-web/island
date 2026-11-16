const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Phase 1B.3 / Gate B.1: Motion Architecture, Timer UX & Music Polish', async (t) => {
  const motionJs = fs.readFileSync(path.resolve(__dirname, '../src/lib/shared/motion.js'), 'utf8');
  const clockPanelJsx = fs.readFileSync(path.resolve(__dirname, '../src/components/panels/ClockPanel.jsx'), 'utf8');
  const launcherPanelJsx = fs.readFileSync(path.resolve(__dirname, '../src/components/panels/LauncherPanel.jsx'), 'utf8');
  const nowPlayingJsx = fs.readFileSync(path.resolve(__dirname, '../src/components/NowPlaying.jsx'), 'utf8');
  const marqueeTextJsx = fs.readFileSync(path.resolve(__dirname, '../src/components/MarqueeText.jsx'), 'utf8');
  const stylesCss = fs.readFileSync(path.resolve(__dirname, '../src/styles.css'), 'utf8');

  await t.test('1. Motion Tokens: Restrained Vocabulary (Gate B.1 Tokens)', async () => {
    const { MOTION, EASE_OUT } = await import('../src/lib/shared/motion.js');
    assert.equal(MOTION.notch.duration, 0.28, 'Notch expansion duration must be 0.28s (240-320ms)');
    assert.equal(MOTION.morph.duration, 0.30, 'Tile morph duration must be 0.30s (280-340ms)');
    assert.equal(MOTION.content.duration, 0.16, 'Content duration must be 0.16s (140-190ms)');
    assert.equal(MOTION.header.duration, 0.18, 'Header duration must be 0.18s (160-220ms)');
    assert.equal(MOTION.press.duration, 0.11, 'Press duration must be 0.11s (90-140ms)');
    assert.equal(MOTION.digit.duration, 0.22, 'Digit duration must be 0.22s (180-260ms)');
    assert.equal(MOTION.reduced.duration, 0, 'Reduced motion duration must be 0');
    assert.deepEqual(EASE_OUT, [0.22, 1, 0.36, 1], 'Ease-out curve must be natural with zero overshoot');
  });

  await t.test('2. Timer Wheel Picker: iOS-Like Wheel Picker Integration', () => {
    assert.ok(clockPanelJsx.includes('@ncdai/react-wheel-picker'), 'ClockPanel must import @ncdai/react-wheel-picker');
    assert.ok(clockPanelJsx.includes('WheelPickerWrapper'), 'ClockPanel must use WheelPickerWrapper');
    assert.ok(clockPanelJsx.includes('WheelPicker'), 'ClockPanel must use WheelPicker');
    assert.ok(clockPanelJsx.includes('HOUR_OPTIONS'), 'ClockPanel must provide 24 hour options');
    assert.ok(clockPanelJsx.includes('MIN_SEC_OPTIONS'), 'ClockPanel must provide 60 minute & second options');
    assert.ok(clockPanelJsx.includes('PRESET_TIMERS'), 'ClockPanel must provide compact presets (1m, 5m, 10m, 25m)');
    assert.ok(stylesCss.includes('.timer-wheel-container'), 'styles.css must style .timer-wheel-container');
    assert.ok(stylesCss.includes('[data-rwp-highlight-wrapper]'), 'styles.css must style [data-rwp-highlight-wrapper]');
  });

  await t.test('3. Timer Countdown Display: Animated Rolling Digits', () => {
    assert.ok(clockPanelJsx.includes('RollingTimeDisplay'), 'ClockPanel must define RollingTimeDisplay');
    assert.ok(clockPanelJsx.includes('RollingDigit'), 'ClockPanel must define RollingDigit component');
    assert.ok(clockPanelJsx.includes('AnimatePresence mode="popLayout"'), 'RollingDigit must use popLayout to prevent layout shift');
    assert.ok(stylesCss.includes('.rolling-digit-box'), 'styles.css must style .rolling-digit-box');
    assert.ok(stylesCss.includes('.rolling-time-display'), 'styles.css must style .rolling-time-display');
  });

  await t.test('4. Connected Utilities Morphing & Zero Chevron on Root', () => {
    assert.ok(launcherPanelJsx.includes('LayoutGroup id="utilities-morph"'), 'LauncherPanel must use LayoutGroup utilities-morph');
    assert.ok(launcherPanelJsx.includes('layoutId={`utility-surface-${id}`}'), 'Tiles must use layoutId');
    assert.ok(launcherPanelJsx.includes('layoutId={`utility-surface-${activeUtility}`}'), 'Active surface must share layoutId');
    assert.ok(!launcherPanelJsx.includes('AnimatePresence mode="wait" initial={false}>\n          {!activeUtility'), 'Shared morph must not be blocked by mode="wait" on outer container');
    assert.ok(launcherPanelJsx.includes('<span className="utilities-header__title">Little Island</span>'), 'Root header must display title without chevron');
    assert.ok(launcherPanelJsx.includes('m15 18-6-6 6-6'), 'Detail header must have left-pointing back chevron');
  });

  await t.test('5. Expanded Music Playback Controls: Centered Cluster (No Space-Between)', () => {
    assert.ok(stylesCss.includes('.np__controls--left-aligned {'), 'styles.css must style .np__controls--left-aligned');
    assert.ok(stylesCss.includes('justify-content: center;'), '.np__controls--left-aligned must center its button group');
    assert.ok(!stylesCss.includes('.np__controls--left-aligned {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;'), 'Must not use space-between stretch');
    assert.ok(stylesCss.includes('.np__controls--left-aligned .icon-btn {\n  width: 28px;\n  height: 28px;'), 'Secondary button hit area must be 28px');
    assert.ok(stylesCss.includes('.np__controls--left-aligned .play-btn--compact {\n  width: 36px !important;'), 'Play/Pause button hit area must be 36px');
  });

  await t.test('6. Smart Song Title & Artist Alignment: Center Short, Marquee Overflow', () => {
    assert.ok(marqueeTextJsx.includes('centerWhenFits = false'), 'MarqueeText must support centerWhenFits');
    assert.ok(marqueeTextJsx.includes('tWidth > cWidth + 2'), 'MarqueeText must measure scrollWidth vs clientWidth');
    assert.ok(marqueeTextJsx.includes('useReducedMotion'), 'MarqueeText must respect prefers-reduced-motion');
    assert.ok(nowPlayingJsx.includes('<MarqueeText\n                        text={media.title || \'Now Playing\'}\n                        className="np__title np__title--expanded"\n                        centerWhenFits'), 'Title must use MarqueeText with centerWhenFits');
    assert.ok(nowPlayingJsx.includes('<MarqueeText\n                        text={media.artist || \'Unknown artist\'}\n                        className="np__artist np__artist--expanded"\n                        centerWhenFits'), 'Artist must use MarqueeText with centerWhenFits');
    assert.ok(stylesCss.includes('.marquee-container.is-centered {\n  justify-content: center !important;\n  text-align: center;\n}'), 'styles.css must center short marquee text');
  });
});

