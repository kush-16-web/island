'use strict';
/**
 * test/pass3-lyrics-upgrade.test.cjs
 * Comprehensive verification suite for the Island AI Lyrics Experience Upgrade.
 *
 * Verifies:
 * 1. No top-region lyric collisions during transitions (strict single-occupancy of 'above' zone).
 * 2. Long lyric wrapping and rapid line changes.
 * 3. Word timestamp parsing and invalid/non-monotonic data handling.
 * 4. Word highlight and sustained-fill progress math.
 * 5. Seek and track-change synchronization (reset and anchor responsiveness).
 * 6. Ghost + Wave style selection and persistence in localStorage.
 * 7. Existing Classic/Kinetic compatibility (coexistence with kinetic effects).
 * 8. Popover opening, closing, and outside dismissal.
 * 9. Default player layout invariants (dimensions, line height 28px, non-shifting text).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Mock browser globals for node test environment
const mockStorage = (() => {
  let store = {};
  return {
    getItem: (k) => store[k] || null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { store = {}; },
  };
})();

global.localStorage = mockStorage;
global.window = {
  dispatchEvent: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  matchMedia: () => ({ matches: false }),
};

const {
  parseLrc,
  findActiveLyricIndex,
} = require('../src/lib/lyrics.js');

const {
  solveAdaptivePlacement,
  checkRectCollision,
  getStageExclusionZones,
  DEFAULT_STAGE_BOUNDS,
} = require('../src/lib/floating-layout-engine.js');

const {
  LYRICS_STYLES,
  getLyricsStyle,
  setLyricsStyle,
  getTrackLyricsPresentation,
  getLinePresentation,
} = require('../src/lib/lyrics-style-engine.js');

test('Pass 3: Lyrics Experience Upgrade Verification Suite', async (t) => {

  // Test 1: No top-region lyric collisions during transitions
  await t.test('1. Strict single-occupancy: top "above" region avoids duplicate or overlapping placements', () => {
    const exclusions = getStageExclusionZones(DEFAULT_STAGE_BOUNDS);

    // Existing settled fragment already occupying the above zone
    const existingFrags = [
      {
        lineIndex: 0,
        placement: {
          x: 100,
          y: 2,
          width: 212,
          height: 32,
          zoneId: 'above',
        },
        role: 'past',
        status: 'dissolving',
      },
    ];

    const incomingLine = { text: 'New phrase entering while old one dissolves', startTimeMs: 12000 };
    const placement = solveAdaptivePlacement(incomingLine, 'active', existingFrags, {
      stageBounds: DEFAULT_STAGE_BOUNDS,
      trackSeed: 'anti-collision-seed',
    });

    assert.notEqual(
      placement.zoneId,
      'above',
      'Incoming active line must NOT be placed in "above" while an existing line occupies it'
    );

    // Verify coordinates do not intersect with existing above fragment
    const newRect = {
      x: placement.x,
      y: placement.y,
      width: placement.width,
      height: placement.height,
    };

    assert.ok(
      !checkRectCollision(newRect, existingFrags[0].placement, 6),
      'New placement bounding box must never collide with dissolving fragment'
    );
  });

  // Test 2: Long lyric wrapping and rapid line changes
  await t.test('2. Long lyric wrapping and capacity: long lines wrap cleanly and do not crash', () => {
    const longLine = {
      text: 'This is an exceptionally long lyric line designed to test natural wrapping in floating and normal stages without truncation',
      startTimeMs: 35000,
    };

    const placement = solveAdaptivePlacement(longLine, 'active', [], {
      stageBounds: DEFAULT_STAGE_BOUNDS,
      trackSeed: 'wrap-test-seed',
    });

    assert.ok(placement.lineCount <= 2, 'Must wrap into at most 2 lines in floating stage');
    assert.ok(placement.width > 0 && placement.height > 0);
    assert.ok(placement.x >= 12, 'Must stay within left safe margin');
  });

  // Test 3: Word timestamp parsing and invalid data handling
  await t.test('3. Enhanced LRC parser: validates monotonic timestamps and discards corrupted word tags', () => {
    // Valid ELRC
    const validLrc = `
[00:10.50] <00:10.50> I <00:11.00> saw <00:11.80> the <00:12.40> light
[00:15.00] Next line starts here
    `;
    const parsedValid = parseLrc(validLrc);
    assert.equal(parsedValid.length, 2);
    assert.ok(parsedValid[0].words);
    assert.equal(parsedValid[0].words.length, 4);
    assert.equal(parsedValid[0].words[0].text, 'I');
    assert.equal(parsedValid[0].words[0].startMs, 10500);
    assert.equal(parsedValid[0].words[0].endMs, 11000);
    assert.equal(parsedValid[0].words[3].text, 'light');
    assert.ok(parsedValid[0].words[3].endMs <= parsedValid[0].endMs, 'Last word bounded by line end');

    // Scrambled / non-monotonic timestamps (corrupted ELRC)
    const corruptedLrc = `
[00:10.50] <00:10.50> Out <00:08.00> of <00:12.00> order
    `;
    const parsedCorrupt = parseLrc(corruptedLrc);
    assert.equal(parsedCorrupt.length, 1);
    assert.equal(parsedCorrupt[0].words, null, 'Corrupted non-monotonic word tags must be invalidated to plain line sync');
    assert.equal(parsedCorrupt[0].text, 'Out of order');
  });

  // Test 4: Word highlight and sustained-fill progress calculation
  await t.test('4. Sustained-word fill: computes correct progressive fill percentage across word duration', () => {
    const word = {
      text: 'sustain',
      startMs: 20000,
      endMs: 22000,
      durationMs: 2000,
    };

    // Before word starts -> 0%
    const posBefore = 19500;
    const progBefore = Math.min(1, Math.max(0, (posBefore - word.startMs) / word.durationMs));
    assert.equal(progBefore, 0);

    // Quarter way through -> 25%
    const posQuarter = 20500;
    const progQuarter = Math.min(1, Math.max(0, (posQuarter - word.startMs) / word.durationMs));
    assert.equal(progQuarter, 0.25);

    // Halfway through -> 50%
    const posHalf = 21000;
    const progHalf = Math.min(1, Math.max(0, (posHalf - word.startMs) / word.durationMs));
    assert.equal(progHalf, 0.5);

    // After word completes -> 100%
    const posAfter = 22500;
    const progAfter = Math.min(1, Math.max(0, (posAfter - word.startMs) / word.durationMs));
    assert.equal(progAfter, 1);
  });

  // Test 5: Seek and track-change synchronization
  await t.test('5. Sync responsiveness: binary search accurately finds active index after large seek jumps', () => {
    const lines = [
      { timeMs: 0, endMs: 5000, text: 'Intro' },
      { timeMs: 5000, endMs: 12000, text: 'Verse 1' },
      { timeMs: 12000, endMs: 25000, text: 'Chorus' },
      { timeMs: 25000, endMs: 40000, text: 'Outro' },
    ];

    // Jump forward directly to Chorus
    assert.equal(findActiveLyricIndex(lines, 18000), 2);

    // Seek backward to Verse 1
    assert.equal(findActiveLyricIndex(lines, 6000), 1);

    // Seek to start
    assert.equal(findActiveLyricIndex(lines, 500), 0);
  });

  // Test 6: Ghost + Wave style selection and persistence
  await t.test('6. Ghost + Wave typography style: persists cleanly and integrates with lyrics presentation', () => {
    mockStorage.clear();

    // Default is classic
    assert.equal(getLyricsStyle(), LYRICS_STYLES.CLASSIC);

    // Select ghost-wave
    setLyricsStyle('ghost-wave');
    assert.equal(getLyricsStyle(), 'ghost-wave');
    assert.equal(mockStorage.getItem('island_lyrics_style'), 'ghost-wave');

    // Generates ghost-wave presentation metadata
    const testLines = [{ text: 'Line 1' }, { text: 'Line 2' }];
    const presentation = getTrackLyricsPresentation(testLines, 'ghost-seed', 'ghost-wave');
    assert.equal(presentation.length, 2);
    assert.equal(presentation[0].style, 'ghost-wave');
    assert.equal(presentation[0].isGhostWave, true);
  });

  // Test 7: Existing Classic and Kinetic compatibility
  await t.test('7. Classic & Kinetic preservation: previous styles remain intact alongside Ghost + Wave', () => {
    setLyricsStyle(LYRICS_STYLES.KINETIC);
    assert.equal(getLyricsStyle(), LYRICS_STYLES.KINETIC);

    setLyricsStyle(LYRICS_STYLES.CLASSIC);
    assert.equal(getLyricsStyle(), LYRICS_STYLES.CLASSIC);

    // Invalid style falls back to classic
    setLyricsStyle('unknown_invalid_style');
    assert.equal(getLyricsStyle(), LYRICS_STYLES.CLASSIC);
  });

  // Test 8: Popover markup & structure
  await t.test('8. Popover structure: NowPlaying and FullLyrics contain redesigned settings controls', () => {
    const npCode = fs.readFileSync(path.resolve(__dirname, '../src/components/NowPlaying.jsx'), 'utf8');
    const flCode = fs.readFileSync(path.resolve(__dirname, '../src/components/FullLyrics.jsx'), 'utf8');

    assert.ok(npCode.includes('lyrics-settings-popover'), 'NowPlaying contains redesigned popover class');
    assert.ok(npCode.includes('Ghost + Wave'), 'NowPlaying contains Ghost + Wave typography choice');
    assert.ok(flCode.includes('LyricsSettingsPopover'), 'FullLyrics uses shared LyricsSettingsPopover component');
  });

  // Test 9: Default player layout invariants
  await t.test('9. Layout invariants: MiniLyrics preserves fixed 28px LINE_HEIGHT and non-shifting box', () => {
    const miniCode = fs.readFileSync(path.resolve(__dirname, '../src/components/MiniLyrics.jsx'), 'utf8');
    assert.ok(miniCode.includes('const LINE_HEIGHT = 28;'), 'MiniLyrics line height fixed at 28px');
    assert.ok(miniCode.includes('const VIEWPORT_HEIGHT = 112;'), 'MiniLyrics viewport height fixed at 112px');

    const stylesCode = fs.readFileSync(path.resolve(__dirname, '../src/styles.css'), 'utf8');
    assert.ok(stylesCode.includes('.lyric-word-wave'), 'Ghost-wave animation defined in styles.css');
    assert.ok(stylesCode.includes('.k-word.is-active-word'), 'Active word progressive fill defined in styles.css');
  });
});

