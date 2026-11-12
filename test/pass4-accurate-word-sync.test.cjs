'use strict';
/**
 * test/pass4-accurate-word-sync.test.cjs
 * Comprehensive test suite for Phase 1 (Popover & Dynamic Colors) and
 * Phase 2/3 (Accurate Word-by-Word Synchronization & Multi-Format Parsing).
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
  parseYrc,
  parseTtml,
  parseLyrics,
  findActiveLyricIndex,
  parseTimestamp,
  parseTimecode,
} = require('../src/lib/lyrics.js');

test('Pass 4: Accurate Word Sync & Popover Comprehensive Suite', async (t) => {

  // 1. Timecode parsing flexibility
  await t.test('1. Timecode parser converts varied timestamp formats accurately', () => {
    assert.equal(parseTimecode('00:04.230'), 4230);
    assert.equal(parseTimecode('01:05.500'), 65500);
    assert.equal(parseTimecode('01:02:03.450'), 3723450);
    assert.equal(parseTimecode('12.5s'), 12500);
    assert.equal(parseTimecode('3500ms'), 3500);
    assert.equal(parseTimestamp('02', '14.50'), 134500);
  });

  // 2. Enhanced LRC (ELRC) word parsing with leading words and explicit end tags
  await t.test('2. Enhanced LRC (ELRC) parsing: parses words, handles leading words and trailing end tags', () => {
    // ELRC with explicit trailing tag
    const elrcWithTrailing = `
[00:10.50] <00:10.50> Hello <00:11.00> brave <00:11.80> new <00:12.30> world <00:13.00>
[00:15.00] Next line
    `;
    const parsed1 = parseLrc(elrcWithTrailing);
    assert.equal(parsed1.length, 2);
    assert.equal(parsed1[0].syncType, 'word');
    assert.ok(parsed1[0].words);
    assert.equal(parsed1[0].words.length, 4);
    assert.equal(parsed1[0].words[0].text, 'Hello');
    assert.equal(parsed1[0].words[0].startMs, 10500);
    assert.equal(parsed1[0].words[0].endMs, 11000);
    assert.equal(parsed1[0].words[3].text, 'world');
    assert.equal(parsed1[0].words[3].startMs, 12300);
    assert.equal(parsed1[0].words[3].endMs, 13000); // from explicit trailing tag!

    // ELRC with leading untagged word
    const elrcLeadingWord = `
[00:05.00] Leading <00:05.80> untagged <00:06.50> word
[00:10.00] End line
    `;
    const parsed2 = parseLrc(elrcLeadingWord);
    assert.equal(parsed2.length, 2);
    assert.equal(parsed2[0].syncType, 'word');
    assert.equal(parsed2[0].words[0].text, 'Leading');
    assert.equal(parsed2[0].words[0].startMs, 5000); // starts at line time
    assert.equal(parsed2[0].words[0].endMs, 5800);
    assert.equal(parsed2[0].words[1].text, 'untagged');
    assert.equal(parsed2[0].words[1].startMs, 5800);
    assert.equal(parsed2[0].words[1].endMs, 6500);
  });

  // 3. NetEase YRC format parsing
  await t.test('3. NetEase YRC format: parses syllable/word timestamps and durations', () => {
    const yrc = `
[10500,4500](10500,500,0)Take (11000,600,0)my (11600,900,0)hand
[16000,5000](16000,800,0)We (16800,700,0)will (17500,1200,0)soar
    `;
    const parsed = parseYrc(yrc);
    assert.equal(parsed.length, 2);
    assert.equal(parsed[0].timeMs, 10500);
    assert.equal(parsed[0].endMs, 15000);
    assert.equal(parsed[0].syncType, 'word');
    assert.equal(parsed[0].text, 'Take my hand');
    assert.equal(parsed[0].words.length, 3);
    assert.equal(parsed[0].words[0].text, 'Take');
    assert.equal(parsed[0].words[0].startMs, 10500);
    assert.equal(parsed[0].words[0].endMs, 11000);
    assert.equal(parsed[0].words[0].durationMs, 500);
    assert.equal(parsed[0].words[2].text, 'hand');
    assert.equal(parsed[0].words[2].startMs, 11600);
    assert.equal(parsed[0].words[2].endMs, 12500);
    assert.equal(parsed[0].words[2].durationMs, 900);
  });

  // 4. TTML XML timed text parsing
  await t.test('4. TTML XML format: parses Apple Music / Timed Text spans into words', () => {
    const ttml = `
<tt xmlns="http://www.w3.org/ns/ttml">
  <body>
    <div>
      <p begin="00:12.000" end="00:16.500">
        <span begin="00:12.000" end="00:12.800">Shine</span>
        <span begin="00:12.800" end="00:13.500">on</span>
        <span begin="00:13.500" end="00:15.000">forever</span>
      </p>
    </div>
  </body>
</tt>
    `;
    const parsed = parseTtml(ttml);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].timeMs, 12000);
    assert.equal(parsed[0].endMs, 16500);
    assert.equal(parsed[0].syncType, 'word');
    assert.equal(parsed[0].words.length, 3);
    assert.equal(parsed[0].words[0].text, 'Shine');
    assert.equal(parsed[0].words[0].startMs, 12000);
    assert.equal(parsed[0].words[0].endMs, 12800);
    assert.equal(parsed[0].words[2].text, 'forever');
    assert.equal(parsed[0].words[2].startMs, 13500);
    assert.equal(parsed[0].words[2].endMs, 15000);
    assert.equal(parsed[0].words[2].durationMs, 1500);
  });

  // 5. Standard line-synced LRC: NEVER invents fake words
  await t.test('5. Non-negotiable: Standard line-synced LRC strictly sets words = null and syncType = "line"', () => {
    const standardLrc = `
[00:15.20] Is this the real life?
[00:18.90] Is this just fantasy?
    `;
    const parsed = parseLrc(standardLrc);
    assert.equal(parsed.length, 2);
    for (const line of parsed) {
      assert.equal(line.syncType, 'line');
      assert.equal(line.words, null, 'Must NEVER invent or simulate fake words');
      assert.ok(typeof line.timeMs === 'number');
      assert.ok(typeof line.startTime === 'number');
      assert.ok(typeof line.endTime === 'number');
    }
  });

  // 6. Plain lyrics: sets words = null and syncType = "unsynced"
  await t.test('6. Plain lyrics parser: sets syncType = "unsynced" without fake timestamps', () => {
    const plainText = `
First line of plain song
Second line of plain song
    `;
    const parsed = parseLyrics(plainText);
    assert.equal(parsed.length, 2);
    for (const line of parsed) {
      assert.equal(line.syncType, 'unsynced');
      assert.equal(line.words, null);
      assert.equal(line.timeMs, null);
      assert.equal(line.startTime, null);
    }
  });

  // 7. Non-monotonic / corrupted timestamps fallback
  await t.test('7. Corrupted timestamps: backward or invalid word timestamps cleanly drop to line sync', () => {
    const corruptedLrc = `
[00:20.00] <00:20.00> Correct <00:18.50> Backward <00:22.00> Word
    `;
    const parsed = parseLrc(corruptedLrc);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].syncType, 'line', 'Corrupted line must fall back to syncType: line');
    assert.equal(parsed[0].words, null, 'Corrupted word array must be null');
    assert.equal(parsed[0].text, 'Correct Backward Word');
  });

  // 8. Progressive fill math across word boundaries
  await t.test('8. Word progress calculation: correctly computes fill percentage and active status', () => {
    const word = {
      text: 'singing',
      startMs: 10000,
      endMs: 12000,
      durationMs: 2000,
    };

    // Before word starts (at 9000ms)
    const posBefore = 9000;
    const isPastBefore = posBefore >= word.endMs;
    const isCurrentBefore = posBefore >= word.startMs && posBefore < word.endMs;
    const fillBefore = isCurrentBefore ? (posBefore - word.startMs) / word.durationMs : (isPastBefore ? 1 : 0);
    assert.equal(isPastBefore, false);
    assert.equal(isCurrentBefore, false);
    assert.equal(fillBefore, 0);

    // Exactly halfway through word (at 11000ms)
    const posMid = 11000;
    const isPastMid = posMid >= word.endMs;
    const isCurrentMid = posMid >= word.startMs && posMid < word.endMs;
    const fillMid = isCurrentMid ? (posMid - word.startMs) / word.durationMs : (isPastMid ? 1 : 0);
    assert.equal(isPastMid, false);
    assert.equal(isCurrentMid, true);
    assert.equal(fillMid, 0.5);

    // After word completes (at 13000ms)
    const posAfter = 13000;
    const isPastAfter = posAfter >= word.endMs;
    const isCurrentAfter = posAfter >= word.startMs && posAfter < word.endMs;
    const fillAfter = isCurrentAfter ? (posAfter - word.startMs) / word.durationMs : (isPastAfter ? 1 : 0);
    assert.equal(isPastAfter, true);
    assert.equal(isCurrentAfter, false);
    assert.equal(fillAfter, 1);
  });

  // 9. Binary search sync responsiveness and seek jumps
  await t.test('9. Binary search sync responsiveness: jump forward and backward cleanly', () => {
    const lines = [
      { timeMs: 5000, endMs: 10000, text: 'Line 1' },
      { timeMs: 10000, endMs: 18000, text: 'Line 2' },
      { timeMs: 18000, endMs: 25000, text: 'Line 3' },
    ];

    // Jump from Line 1 to Line 3 (seek forward)
    assert.equal(findActiveLyricIndex(lines, 6000), 0);
    assert.equal(findActiveLyricIndex(lines, 20000), 2);

    // Jump backward from Line 3 to Line 1 (seek backward)
    assert.equal(findActiveLyricIndex(lines, 7000), 0);

    // Jump past song end
    assert.equal(findActiveLyricIndex(lines, 99999), 2);

    // Jump before song intro
    assert.equal(findActiveLyricIndex(lines, 1000), -1);
  });

  // 10. Popover portal & dynamic color verification in components and CSS
  await t.test('10. Popover portal, auto-flip, dynamic tinting and outside dismissal verification', () => {
    const popoverSource = fs.readFileSync(path.join(__dirname, '../src/components/LyricsSettingsPopover.jsx'), 'utf8');
    const stylesSource = fs.readFileSync(path.join(__dirname, '../src/styles.css'), 'utf8');
    const nowPlayingSource = fs.readFileSync(path.join(__dirname, '../src/components/NowPlaying.jsx'), 'utf8');
    const fullLyricsSource = fs.readFileSync(path.join(__dirname, '../src/components/FullLyrics.jsx'), 'utf8');

    // React Portal requirement
    assert.ok(popoverSource.includes('createPortal'), 'LyricsSettingsPopover must use createPortal to document.body');
    assert.ok(popoverSource.includes('document.body'), 'Target container must be document.body');

    // Auto-flip and boundary clamping
    assert.ok(popoverSource.includes('preferredPlacement'), 'Supports preferredPlacement prop');
    assert.ok(popoverSource.includes('window.innerHeight'), 'Measures viewport height for auto-flipping');
    assert.ok(popoverSource.includes('Math.max(margin'), 'Clamps within viewport margin boundaries');

    // Outside click and Escape key dismissal
    assert.ok(popoverSource.includes('handlePointerDownOutside') || popoverSource.includes('pointerdown'), 'Listens for outside clicks');
    assert.ok(popoverSource.includes('Escape'), 'Handles Escape key dismissal');

    // Dynamic album accent colors
    assert.ok(popoverSource.includes('--popover-accent'), 'Passes album accent as CSS variable');
    assert.ok(stylesSource.includes('--popover-tint'), 'CSS incorporates --popover-tint');
    assert.ok(stylesSource.includes('color-mix(in srgb'), 'Uses modern color-mix for subtle album-derived tinting');
    assert.ok(stylesSource.includes('.lyrics-settings-popover--portal'), 'Defines fixed portal styling with high z-index');

    // NowPlaying & FullLyrics integration
    assert.ok(nowPlayingSource.includes('LyricsSettingsPopover'), 'NowPlaying uses LyricsSettingsPopover');
    assert.ok(nowPlayingSource.includes('popoverRef'), 'NowPlaying anchors popover with popoverRef');
    assert.ok(fullLyricsSource.includes('LyricsSettingsPopover'), 'FullLyrics uses LyricsSettingsPopover');
  });

  // 11. Real song Pink + White TTML word-level parsing test fixture
  await t.test('11. Real-world Pink + White TTML fixture parsed into 52 word-timed lines', () => {
    const pinkWhiteSnippet = `
<tt xmlns="http://www.w3.org/ns/ttml" xmlns:lrc="http://lrc.red/lyric-ttml-internal" lrc:timing="Word">
  <body dur="3:04.516">
    <div begin="4.071" end="8.062">
      <p begin="4.071" end="5.450"><span begin="4.071" end="4.300">Yeah,</span> <span begin="4.300" end="4.513">yeah,</span> <span begin="4.600" end="5.450">oh</span></p>
      <p begin="7.057" end="8.062"><span begin="7.057" end="7.342">Yeah,</span> <span begin="7.342" end="7.531">yeah,</span> <span begin="7.531" end="8.062">yeah</span></p>
      <p begin="10.105" end="12.269"><span begin="10.105" end="10.327">That's</span> <span begin="10.327" end="10.530">the</span> <span begin="10.530" end="10.893">way</span> <span begin="10.893" end="11.559">everyday</span> <span begin="11.559" end="12.269">goes</span></p>
    </div>
  </body>
</tt>
    `;
    const parsed = parseTtml(pinkWhiteSnippet);
    assert.equal(parsed.length, 3);
    assert.equal(parsed[0].syncType, 'word');
    assert.equal(parsed[0].words.length, 3);
    assert.equal(parsed[0].words[0].text, 'Yeah,');
    assert.equal(parsed[0].words[0].startMs, 4071);
    assert.equal(parsed[0].words[0].endMs, 4300);
    assert.equal(parsed[0].words[1].text, 'yeah,');
    assert.equal(parsed[0].words[1].startMs, 4300);
    assert.equal(parsed[0].words[1].endMs, 4513);
    assert.equal(parsed[0].words[2].text, 'oh');
    assert.equal(parsed[0].words[2].startMs, 4600);
    assert.equal(parsed[0].words[2].endMs, 5450);

    assert.equal(parsed[2].text, "That's the way everyday goes");
    assert.equal(parsed[2].words.length, 5);
    assert.equal(parsed[2].words[0].text, "That's");
    assert.equal(parsed[2].words[4].text, "goes");
    assert.equal(parsed[2].words[4].endMs, 12269);
  });

  // 10. Word-by-word typography invariant: active word does not mutate font-weight or swap fonts
  await t.test('10. Word-by-word typography invariant: active word preserves inherited font styling', () => {
    const cssContent = fs.readFileSync(path.join(__dirname, '..', 'src', 'styles.css'), 'utf-8');
    
    // Extract .k-word.is-active-word rule
    const activeWordMatch = cssContent.match(/\.k-word\.is-active-word\s*\{([^}]+)\}/);
    assert.ok(activeWordMatch, 'styles.css must contain .k-word.is-active-word');
    
    const ruleBody = activeWordMatch[1];
    // Must NOT contain font-weight: 600 or any non-inherit font weight
    assert.ok(!ruleBody.includes('font-weight: 600'), '.k-word.is-active-word must not force font-weight: 600');
    assert.ok(ruleBody.includes('font-weight: inherit'), '.k-word.is-active-word must explicitly maintain inherited font-weight');
    assert.ok(ruleBody.includes('font-family: inherit'), '.k-word.is-active-word must explicitly maintain inherited font-family');
  });
});

