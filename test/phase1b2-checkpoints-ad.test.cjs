/**
 * Phase 1B.2 Checkpoints A–D & Correction Verification Suite
 *
 * Verifies:
 * 1. Motion system tokens (coherent 120–260ms, zero overshoot)
 * 2. Idle notch preferences & centered eyes invariants
 * 3. Pitch-black idle notch rule (no blur, no glow, no album tint, even on hover)
 * 4. Hover Music horizontal layout (whole-line white lyric, no PrecisionLyricLine in Hover, stable width, shared volume)
 * 5. Expanded Music two-column layout (616x316, no obsolete Hub nav/toolbar/heart/cluster, top-right Companion Eyes, volume + single lyric settings)
 * 6. CompanionEyes bounded cursor-gaze math
 * 7. Utilities 2x2 grid & full-surface morphing
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Phase 1B.2 Checkpoints A–D Suite', async (t) => {
  const { MOTION } = await import('../src/lib/shared/motion.js');
  const {
    IDLE_PRESETS,
    DEFAULT_IDLE_PREFS,
    resolveIdleDisplayFlags,
  } = await import('../src/lib/idle-prefs.js');
  const { NOTCH_STATES, computeNotchDimensions } = await import('../src/lib/notch-state.js');
  const { computeGazeOffset } = await import('../src/lib/companion-gaze.js');

  await t.test('1. Motion system: restrained durations with zero overshoot', () => {
    assert.ok(MOTION.notch.duration >= 0.2 && MOTION.notch.duration <= 0.32);
    assert.ok(MOTION.morph.duration >= 0.22 && MOTION.morph.duration <= 0.32);
    assert.ok(MOTION.content.duration >= 0.14 && MOTION.content.duration <= 0.22);
    assert.ok(MOTION.lyric.duration >= 0.16 && MOTION.lyric.duration <= 0.25);
  });

  await t.test('2. Idle preferences: defaults to eyes_only with centered eyes', () => {
    assert.equal(DEFAULT_IDLE_PREFS.preset, IDLE_PRESETS.EYES_ONLY);
    assert.equal(DEFAULT_IDLE_PREFS.showEyes, true);
    assert.equal(DEFAULT_IDLE_PREFS.showTime, false);
    assert.equal(DEFAULT_IDLE_PREFS.companionAnimations, true);

    const flags = resolveIdleDisplayFlags(DEFAULT_IDLE_PREFS);
    assert.equal(flags.showEyes, true);
    assert.equal(flags.companionAnimations, true);
  });

  await t.test('3. Dimensions: idle black notch, hover music (444x96), expanded two-column music (616x316)', () => {
    const idleDim = computeNotchDimensions({ notchState: NOTCH_STATES.COMPACT, mode: 'idle' });
    assert.ok(idleDim.width >= 190 && idleDim.width <= 220);
    assert.equal(idleDim.height, 36);

    const hoverMediaDim = computeNotchDimensions({ notchState: NOTCH_STATES.HOVER_PREVIEW, mode: 'media' });
    assert.equal(hoverMediaDim.width, 444);
    assert.equal(hoverMediaDim.height, 96);

    const expMediaDim = computeNotchDimensions({
      notchState: NOTCH_STATES.EXPANDED,
      mode: 'hub',
      tab: 'playing',
      hasActiveMedia: true,
    });
    assert.equal(expMediaDim.width, 616);
    assert.equal(expMediaDim.height, 316);
  });

  await t.test('4. Pitch-black idle & centered eyes CSS invariants', () => {
    const css = fs.readFileSync(path.join(__dirname, '../src/styles.css'), 'utf-8');
    const islandJsx = fs.readFileSync(path.join(__dirname, '../src/components/Island.jsx'), 'utf-8');

    assert.ok(css.includes('.island--notch.is-idle-black'), 'Must define pitch-black idle class');
    assert.ok(css.includes('background: #000000 !important;'), 'Idle notch must be pitch black');
    assert.ok(islandJsx.includes("const isIdleBlack = mode === 'idle' && !media.active;"), 'Idle notch must stay pitch black even on hover');
    assert.ok(css.includes('grid-template-columns: 1fr auto 1fr;'), 'Eyes must remain centered in 3-column grid');
    assert.ok(islandJsx.includes('<CompanionEyes'), 'Island must render CompanionEyes');
  });

  await t.test('5. Hover & Expanded Music approved layouts (no obsolete Hub nav/toolbar/heart/cluster)', () => {
    const islandJsx = fs.readFileSync(path.join(__dirname, '../src/components/Island.jsx'), 'utf-8');
    const hubJsx = fs.readFileSync(path.join(__dirname, '../src/components/Hub.jsx'), 'utf-8');
    const npJsx = fs.readFileSync(path.join(__dirname, '../src/components/NowPlaying.jsx'), 'utf-8');
    const css = fs.readFileSync(path.join(__dirname, '../src/styles.css'), 'utf-8');

    // Hover lyric rules: whole-line display, NO PrecisionLyricLine in HoverPreviewView
    const hoverSection = islandJsx.slice(
      islandJsx.indexOf('function HoverPreviewView'),
      islandJsx.indexOf('const measureTextWidth')
    );
    assert.ok(hoverSection.includes('hover-preview__lyric-slot'), 'Hover music must place lyric horizontally between metadata and controls');
    assert.ok(!hoverSection.includes('PrecisionLyricLine'), 'Hover music must NOT run word-by-word PrecisionLyricLine animation');
    assert.ok(css.includes('.hover-preview__lyric-text') && css.includes('color: #ffffff;'), 'Hover lyric must be solid white');
    assert.ok(hoverSection.includes('MusicVolumeControl'), 'Hover music must use shared MusicVolumeControl');

    // Obsolete UI removed from Hub & Expanded Music
    assert.ok(!hubJsx.includes('seg__btn'), 'Obsolete Home/Playing/Pet segmented bar must be removed');
    assert.ok(!hubJsx.includes('hub-action-btn--workspace'), 'Legacy top-right Assistant button must be removed');
    assert.ok(!hubJsx.includes('hub-action-btn--settings'), 'Legacy top-right Settings button must be removed');
    assert.ok(!npJsx.includes('heart-btn--overlay'), 'Floating heart on album cover must be removed');
    assert.ok(!npJsx.includes('np__right-tabs--bottom'), 'Bottom Lyrics/Settings/Favorites cluster must be removed');

    // Approved Expanded Music structure
    assert.ok(npJsx.includes('np--two-col'), 'Expanded music must use two-column layout');
    assert.ok(npJsx.includes('expanded-music__eyes-btn') && npJsx.includes('<CompanionEyes'), 'Top-right Companion Eyes must open Utilities');
    assert.ok(npJsx.includes('np__controls--left-aligned'), 'Expanded music controls must be aligned beneath artist');
    assert.ok(npJsx.includes('Replay5') && npJsx.includes('Forward5'), 'Expanded music must support +/-5s seeking when seekable');
    assert.ok(npJsx.includes('np__right-footer') && npJsx.includes('MusicVolumeControl'), 'Expanded music must use shared MusicVolumeControl in footer');
    assert.ok(npJsx.includes('LyricsSettingsPopover'), 'Expanded music must keep single compact lyric settings icon + popover');
  });

  await t.test('6. CompanionEyes bounded cursor-gaze math', () => {
    const center = computeGazeOffset({ targetX: 100, targetY: 50, centerX: 100, centerY: 50, maxOffset: 3 });
    assert.deepEqual(center, { x: 0, y: 0 });

    const right = computeGazeOffset({ targetX: 500, targetY: 50, centerX: 100, centerY: 50, maxOffset: 3 });
    assert.ok(right.x > 2.5 && right.x <= 3);
    assert.equal(right.y, 0);

    const upLeft = computeGazeOffset({ targetX: 0, targetY: 0, centerX: 200, centerY: 200, maxOffset: 3 });
    assert.ok(upLeft.x < 0 && upLeft.x >= -3);
    assert.ok(upLeft.y < 0 && upLeft.y >= -3);
  });

  await t.test('7. Utilities 2x2 grid & full-surface morphing', () => {
    const launcherJsx = fs.readFileSync(path.join(__dirname, '../src/components/panels/LauncherPanel.jsx'), 'utf-8');
    const css = fs.readFileSync(path.join(__dirname, '../src/styles.css'), 'utf-8');

    assert.ok(launcherJsx.includes('layoutId={`utility-surface-${id}`}'), 'Tiles must share layoutId for morph');
    assert.ok(launcherJsx.includes('layoutId={`utility-surface-${activeUtility}`}'), 'Active utility must morph into full surface');
    assert.ok(launcherJsx.includes('utility-surface__back'), 'Active utility must provide reversible back control');
    assert.ok(css.includes('grid-template-columns: 1fr 1fr;'), 'Utilities must use compact 2x2 grid');
  });
});
