/**
 * Phase 1B: Top-Attached Notch Foundation Test Suite
 *
 * Verifies:
 * 1. Explicit notch state machine transitions (compact, hoverPreview, expanded)
 * 2. Top-attached notch geometry & multi-monitor / taskbar / DPI positioning
 * 3. Visibility modes (always, smart_hide, peek) & activity reveal logic
 * 4. Content-driven dimensions and flat-top / rounded-bottom corner geometry
 * 5. Click-through [data-hit] safety and preload IPC contract
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  NOTCH_WIN_W,
  NOTCH_WIN_H,
  normalizeVisibilityMode,
  computeNotchPosition,
} = require('../electron/notch-geometry');

test('Phase 1B: Top-Attached Notch Foundation Suite', async (t) => {
  const notchStateMod = await import('../src/lib/notch-state.js');
  const {
    NOTCH_STATES,
    NOTCH_EVENTS,
    transitionNotchState,
    evaluateNotchVisibility,
    computeNotchDimensions,
  } = notchStateMod;

  await t.test('1. State machine: handles compact -> hoverPreview -> expanded -> compact cleanly', () => {
    let state = NOTCH_STATES.COMPACT;

    state = transitionNotchState(state, NOTCH_EVENTS.POINTER_ENTER_READY);
    assert.equal(state, NOTCH_STATES.HOVER_PREVIEW);

    state = transitionNotchState(state, NOTCH_EVENTS.POINTER_LEAVE_READY);
    assert.equal(state, NOTCH_STATES.COMPACT);

    state = transitionNotchState(state, NOTCH_EVENTS.POINTER_ENTER_READY);
    assert.equal(state, NOTCH_STATES.HOVER_PREVIEW);

    state = transitionNotchState(state, NOTCH_EVENTS.CLICK);
    assert.equal(state, NOTCH_STATES.EXPANDED);

    // Leaving pointer while expanded must NOT collapse expanded control center
    state = transitionNotchState(state, NOTCH_EVENTS.POINTER_LEAVE_READY);
    assert.equal(state, NOTCH_STATES.EXPANDED);

    state = transitionNotchState(state, NOTCH_EVENTS.ESCAPE);
    assert.equal(state, NOTCH_STATES.COMPACT);
  });

  await t.test('2. State machine: shortcut toggle and blur/outside click dismissal', () => {
    let state = NOTCH_STATES.COMPACT;

    state = transitionNotchState(state, NOTCH_EVENTS.SHORTCUT_TOGGLE);
    assert.equal(state, NOTCH_STATES.EXPANDED);

    state = transitionNotchState(state, NOTCH_EVENTS.SHORTCUT_TOGGLE);
    assert.equal(state, NOTCH_STATES.COMPACT);

    state = transitionNotchState(state, NOTCH_EVENTS.SHORTCUT_OPEN);
    assert.equal(state, NOTCH_STATES.EXPANDED);

    state = transitionNotchState(state, NOTCH_EVENTS.BLUR);
    assert.equal(state, NOTCH_STATES.COMPACT);
  });

  await t.test('3. Geometry: top-center flush placement respects workArea (bottom taskbar)', () => {
    const primary = {
      id: 1,
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      workArea: { x: 0, y: 0, width: 1920, height: 1032 },
      scaleFactor: 1.25,
    };
    const pos = computeNotchPosition({ display: primary, allDisplays: [primary] });

    assert.equal(pos.y, 0, 'Top edge must be flush with workArea.y (0px gap)');
    assert.equal(pos.x, Math.round((1920 - NOTCH_WIN_W) / 2), 'Must be horizontally centered');
    assert.equal(pos.width, NOTCH_WIN_W);
    assert.equal(pos.height, NOTCH_WIN_H);
    assert.equal(pos.scaleFactor, 1.25);
  });

  await t.test('4. Geometry: respects top-positioned Windows taskbar and secondary monitor', () => {
    const primary = {
      id: 1,
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      workArea: { x: 0, y: 0, width: 1920, height: 1032 },
      scaleFactor: 1,
    };
    const secondary = {
      id: 2,
      bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
      workArea: { x: 1920, y: 48, width: 2560, height: 1392 }, // 48px top taskbar on secondary
      scaleFactor: 1.5,
    };

    const pos = computeNotchPosition({
      display: primary,
      allDisplays: [primary, secondary],
      displayId: 2,
    });

    assert.equal(pos.displayId, 2);
    assert.equal(pos.y, 48, 'Must attach flush below top taskbar (workArea.y = 48)');
    assert.equal(pos.x, 1920 + Math.round((2560 - NOTCH_WIN_W) / 2));
    assert.equal(pos.scaleFactor, 1.5);

    // Fallback to primary if selected monitor disconnects
    const fallback = computeNotchPosition({
      display: primary,
      allDisplays: [primary],
      displayId: 999,
    });
    assert.equal(fallback.displayId, 1);
    assert.equal(fallback.x, Math.round((1920 - NOTCH_WIN_W) / 2));
    assert.equal(fallback.y, 0);
  });

  await t.test('5. Visibility modes: always, smart_hide, and peek evaluate predictably', () => {
    assert.equal(normalizeVisibilityMode('invalid'), 'always');
    assert.equal(normalizeVisibilityMode('smart_hide'), 'smart_hide');
    assert.equal(normalizeVisibilityMode('peek'), 'peek');

    // Smart hide: hidden when idle, revealed when media/voice/timer/hover active
    const idleSmart = evaluateNotchVisibility({ visibilityMode: 'smart_hide', notchState: NOTCH_STATES.COMPACT });
    assert.equal(idleSmart.isHidden, true);
    assert.equal(idleSmart.isPeeking, false);

    const mediaSmart = evaluateNotchVisibility({
      visibilityMode: 'smart_hide',
      notchState: NOTCH_STATES.COMPACT,
      hasActiveMedia: true,
    });
    assert.equal(mediaSmart.isHidden, false);

    // Peek: tucks into peek lip when idle, reveals when hovered or active
    const idlePeek = evaluateNotchVisibility({ visibilityMode: 'peek', notchState: NOTCH_STATES.COMPACT });
    assert.equal(idlePeek.isHidden, false);
    assert.equal(idlePeek.isPeeking, true);

    const hoveredPeek = evaluateNotchVisibility({
      visibilityMode: 'peek',
      notchState: NOTCH_STATES.COMPACT,
      hovered: true,
    });
    assert.equal(hoveredPeek.isPeeking, false);
  });

  await t.test('6. Dimensions: compact idle meets 190-220x34-40 target, hoverPreview & expanded scale cleanly', () => {
    const compactIdle = computeNotchDimensions({ notchState: NOTCH_STATES.COMPACT, mode: 'idle' });
    assert.ok(compactIdle.width >= 190 && compactIdle.width <= 220, `Compact width ${compactIdle.width} in 190-220`);
    assert.ok(compactIdle.height >= 34 && compactIdle.height <= 40, `Compact height ${compactIdle.height} in 34-40`);

    const previewMedia = computeNotchDimensions({ notchState: NOTCH_STATES.HOVER_PREVIEW, mode: 'media' });
    assert.ok(previewMedia.width > compactIdle.width && previewMedia.width < 468);
    assert.ok(previewMedia.height > compactIdle.height && previewMedia.height < 140);

    const peekDim = computeNotchDimensions({ notchState: NOTCH_STATES.COMPACT, mode: 'idle', isPeeking: true });
    assert.equal(peekDim.height, 6);
  });

  await t.test('7. Click-through safety & IPC contracts remain intact', () => {
    const islandJsx = fs.readFileSync(path.join(__dirname, '../src/components/Island.jsx'), 'utf-8');
    const preloadJs = fs.readFileSync(path.join(__dirname, '../electron/preload.js'), 'utf-8');
    const stylesCss = fs.readFileSync(path.join(__dirname, '../src/styles.css'), 'utf-8');

    assert.ok(islandJsx.includes('data-hit={isHidden ? undefined : true}'), 'Hidden notch must drop data-hit for click-through');
    assert.ok(islandJsx.includes('borderTopLeftRadius: 0'), 'Top-attached notch must have flat upper-left edge');
    assert.ok(islandJsx.includes('borderTopRightRadius: 0'), 'Top-attached notch must have flat upper-right edge');
    assert.ok(stylesCss.includes('.island--notch'), 'styles.css must define .island--notch');
    assert.ok(preloadJs.includes('getNotchVisibilityMode'), 'preload must expose getNotchVisibilityMode');
    assert.ok(preloadJs.includes('setNotchVisibilityMode'), 'preload must expose setNotchVisibilityMode');
    assert.ok(preloadJs.includes('notch:visibility-changed'), 'preload must whitelist notch:visibility-changed');
  });
});

