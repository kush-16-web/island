/**
 * Test Suite: Pass 2.2.7.6.1 — Two-Mode Lyrics Appearance (Classic & Kinetic),
 * Meaning-Aware Typography Targeting, Unclipped Popover, and No Emojis/Checkmarks
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Mock localStorage for node environment
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; }
  };
})();

global.localStorage = localStorageMock;
global.window = {
  dispatchEvent: () => {},
  addEventListener: () => {},
  removeEventListener: () => {}
};

// Import modules under test
const {
  LYRICS_STYLES,
  getLyricsStyle,
  setLyricsStyle,
  findMeaningfulKineticTarget,
  getLinePresentation,
  getTrackLyricsPresentation,
  KINETIC_EFFECTS
} = require('../src/lib/lyrics-style-engine.js');

describe('Pass 2.2.7.6.1: Emergency Corrective Pass — Lyrics Appearance & Kinetic Engine', () => {

  it('1. Exactly two supported modes: LYRICS_STYLES contains classic and kinetic only', () => {
    assert.equal(LYRICS_STYLES.CLASSIC, 'classic');
    assert.equal(LYRICS_STYLES.KINETIC, 'kinetic');
    assert.equal(LYRICS_STYLES.EXPRESSIVE, undefined, 'Expressive mode must not exist in LYRICS_STYLES');
    assert.deepEqual(Object.values(LYRICS_STYLES), ['classic', 'kinetic']);
  });

  it('2. Legacy Expressive preferences migrate to Classic', () => {
    localStorageMock.clear();
    // Default is Classic
    assert.equal(getLyricsStyle(), LYRICS_STYLES.CLASSIC);

    // Stored legacy 'expressive' migrates to 'classic' and persists
    localStorageMock.setItem('island_lyrics_style', 'expressive');
    assert.equal(getLyricsStyle(), LYRICS_STYLES.CLASSIC);
    assert.equal(localStorageMock.getItem('island_lyrics_style'), 'classic');

    // Setting Kinetic persists Kinetic
    setLyricsStyle(LYRICS_STYLES.KINETIC);
    assert.equal(getLyricsStyle(), LYRICS_STYLES.KINETIC);
    assert.equal(localStorageMock.getItem('island_lyrics_style'), 'kinetic');

    // Invalid style falls back to Classic
    setLyricsStyle('unknown_style');
    assert.equal(getLyricsStyle(), LYRICS_STYLES.CLASSIC);
  });

  it('3. Meaningful target word is selected over arbitrary or longest words', () => {
    // "Spend some time alone" -> target must be "alone" (not "Spend" or longest word)
    const target1 = findMeaningfulKineticTarget('Spend some time alone');
    assert.ok(target1, 'Should find target in "Spend some time alone"');
    assert.equal(target1.targetWord, 'alone');
    assert.equal(target1.effect, 'isolation');
    assert.equal(target1.startIndex, 16);
    assert.equal(target1.endIndex, 21);

    // "Alone again" -> target "Alone", subdued isolation
    const target2 = findMeaningfulKineticTarget('Alone again');
    assert.ok(target2, 'Should find target in "Alone again"');
    assert.equal(target2.targetWord, 'Alone');
    assert.equal(target2.effect, 'isolation');

    // "Watching the daylight slowly fade out" -> target "fade"
    const target3 = findMeaningfulKineticTarget('Watching the daylight slowly fade out');
    assert.ok(target3);
    assert.equal(target3.targetWord, 'fade');
    assert.equal(target3.effect, 'fade');

    // "We will shatter and break into pieces" -> target "shatter"
    const target4 = findMeaningfulKineticTarget('We will shatter and break into pieces');
    assert.ok(target4);
    assert.equal(target4.targetWord, 'shatter');
    assert.equal(target4.effect, 'fracture');

    // Negated lines should not trigger effects
    assert.equal(findMeaningfulKineticTarget('You are not alone tonight'), null);
    assert.equal(findMeaningfulKineticTarget('This light will never fade'), null);
    assert.equal(findMeaningfulKineticTarget('Have no fear of the dark'), null);
  });

  it('4. Sparse animation frequency and non-consecutive kinetic lines', () => {
    const lines = [
      { text: 'Hold on tight before we fall away' },
      { text: 'The clock is ticking quietly now' },
      { text: 'We will shatter into pieces' },
      { text: 'Quietly dreaming in the evening glow' },
      { text: 'Standing in the silence of the night' },
      { text: 'Watching the daylight slowly fade out' },
      { text: 'Another day begins to rise' },
      { text: 'Walking down this lonely road' },
      { text: 'Waiting for the sun to shine' },
      { text: 'Spend some time alone tonight' },
      { text: 'Looking at the peaceful sky' },
    ];

    const results = getTrackLyricsPresentation(lines, 'track-seed-123', LYRICS_STYLES.KINETIC);
    assert.equal(results.length, lines.length);

    const kineticIndices = [];
    results.forEach((r, idx) => {
      if (r.kineticEffect) kineticIndices.push(idx);
    });

    // Check sparseness: at least 5 lines apart between kinetic lines
    for (let i = 1; i < kineticIndices.length; i++) {
      const distance = kineticIndices[i] - kineticIndices[i - 1];
      assert.ok(distance >= 5, `Kinetic lines too close: distance was ${distance}`);
    }

    // Restrained count
    assert.ok(kineticIndices.length <= 3, `Expected at most 3 kinetic lines, got ${kineticIndices.length}`);
  });

  it('5. Horizontal curvature remains rare and is never stacked with a primary word effect', () => {
    const lines = [
      { text: 'Hold on tight before we fall away in the darkness of the night' },
      { text: 'Short line' },
      { text: 'This is a long line that stretches out horizontally across the entire screen' },
      { text: 'Another simple short lyric' },
      { text: 'Watching the daylight slowly fade out in the evening sky' },
      { text: 'A completely ordinary line without any special treatment' },
    ];

    const results = getTrackLyricsPresentation(lines, 'track-seed-curve', LYRICS_STYLES.KINETIC);

    for (const r of results) {
      if (r.kineticEffect) {
        assert.equal(r.isCurved, false, 'Horizontal curve must NEVER be stacked with word effect');
      }
    }

    const curvedCount = results.filter((r) => r.isCurved).length;
    // Curvature is rare (max 10-15% of lines)
    assert.ok(curvedCount <= 1, `Expected at most 1 curved line, got ${curvedCount}`);
  });

  it('6. Classic mode produces clean, completely unembellished presentation', () => {
    const line = { text: 'Spend some time alone' };
    const pres = getLinePresentation(line, 0, 10, 'seed1', LYRICS_STYLES.CLASSIC);
    assert.deepEqual(pres, { style: LYRICS_STYLES.CLASSIC });
    assert.equal(pres.kineticEffect, undefined);
    assert.equal(pres.targetWord, undefined);
  });

  it('7. NowPlaying popover: Options (Classic & Kinetic), no Expressive, no checkmark', () => {
    const npPath = path.resolve(__dirname, '../src/components/NowPlaying.jsx');
    const fileContent = fs.readFileSync(npPath, 'utf8');

    // Popover contains Typography section
    assert.ok(fileContent.includes('Typography'), 'Header should include Typography');
    
    // Exactly two typography options
    assert.ok(fileContent.includes('Classic'), 'Classic option missing');
    assert.ok(fileContent.includes('Original'), 'Classic subtitle missing');
    assert.ok(fileContent.includes('Kinetic'), 'Kinetic option missing');
    assert.ok(fileContent.includes('Meaning-aware'), 'Kinetic subtitle missing');

    // Expressive row must NOT exist
    assert.ok(!fileContent.includes('handleSelectLyricsStyle(LYRICS_STYLES.EXPRESSIVE)'), 'Expressive row must be removed');
    assert.ok(!fileContent.includes('Meaningful inline icons'), 'Expressive subtitle must be removed');

    // Checkmark must NOT exist
    assert.ok(!fileContent.includes('np__lyrics-option-check'), 'Checkmark must be removed');
    assert.ok(!fileContent.includes('Icon.Check'), 'Icon.Check must not be rendered in popover');

    // Escape and outside click dismissal
    assert.ok(fileContent.includes("e.key === 'Escape'"), 'Escape key handler missing');
    assert.ok(fileContent.includes('handleOutsideClick'), 'Outside click handler missing');
  });

  it('8. Stylesheet: Popover anchored within visible bounds (right: 0, bottom: calc(100% + 6px)) and no emoji/expressive styles', () => {
    const cssPath = path.resolve(__dirname, '../src/styles.css');
    const css = fs.readFileSync(cssPath, 'utf8');

    // Popover positioning: right: 0 prevents horizontal overflow clipping
    assert.ok(css.includes('.np__lyrics-popover {'), 'np__lyrics-popover missing');
    assert.ok(css.includes('right: 0;'), 'np__lyrics-popover should be right: 0 to prevent clipping');
    assert.ok(css.includes('bottom: calc(100% + 6px);'), 'np__lyrics-popover bottom position');

    // Expressive and emoji styles must be completely removed
    assert.ok(!css.includes('.lyric-inline-icon {'), 'lyric-inline-icon must be removed');
    assert.ok(!css.includes('.lyric-accent-emoji {'), 'lyric-accent-emoji must be removed');
    assert.ok(!css.includes('.np__lyrics-option-check {'), 'np__lyrics-option-check must be removed');

    // Kinetic typography effects defined
    for (const fx of KINETIC_EFFECTS) {
      assert.ok(css.includes(`.k-fx-${fx}`), `CSS class .k-fx-${fx} must be defined`);
    }
  });

  it('9. PrecisionLyricLine renders exact character slice for target word and preserves rest of line', () => {
    const plPath = path.resolve(__dirname, '../src/components/PrecisionLyricLine.jsx');
    const plCode = fs.readFileSync(plPath, 'utf8');

    assert.ok(plCode.includes('raw.slice(0, start)'), 'Must slice before target word');
    assert.ok(plCode.includes('raw.slice(start, end)'), 'Must slice exact target word');
    assert.ok(plCode.includes('raw.slice(end)'), 'Must slice after target word');
    assert.ok(!plCode.includes('lyric-inline-icon'), 'Must not render inline icons');
  });

  it('10. FullLyrics component toolbar maintains approved controls and meaning-aware word slicing', () => {
    const flPath = path.resolve(__dirname, '../src/components/FullLyrics.jsx');
    const flCode = fs.readFileSync(flPath, 'utf8');

    // Controls preserved
    assert.ok(flCode.includes('heart-btn--bottom'), 'Must include heart button');
    assert.ok(flCode.includes('lyrics-toggle-btn'), 'Must include lyrics toggle button');
    assert.ok(flCode.includes('full-lyrics__vol-ctrl'), 'Must include volume control');
    assert.ok(flCode.includes("onControl('previous')"), 'Must include previous button');
    assert.ok(flCode.includes("onControl('playpause')"), 'Must include play/pause button');
    assert.ok(flCode.includes("onControl('next')"), 'Must include next button');
    assert.ok(flCode.includes('Icon.Replay5'), 'FullLyrics toolbar includes Replay5 (Pass 2.2.10)');
    assert.ok(flCode.includes('Icon.Forward5'), 'FullLyrics toolbar includes Forward5 (Pass 2.2.10)');

    // No emoji or icon imports
    assert.ok(!flCode.includes('getAppleEmojiUrl'), 'getAppleEmojiUrl must not be imported');
    assert.ok(!flCode.includes('lyric-inline-icon'), 'lyric-inline-icon must not be rendered');
  });

});
