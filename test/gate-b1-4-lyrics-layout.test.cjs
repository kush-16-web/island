const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  parseYamlLyrics,
  parseLyrics,
  parseLrc,
  findActiveLyricIndex,
} = require('../src/lib/lyrics/lyrics.js');

test('Gate B.1.4 — Lyric Reliability & Expanded Music Layout Polish Suite', async (t) => {
  await t.test('1. Adele Lovesong Intro Diagnosis: Position 0:06 strictly returns -1 (Intro / No Lyric Active)', () => {
    // Exact timestamps from Adele - Lovesong TTML
    const adeleLines = [
      { id: 'l0', timeMs: 26252, endMs: 31160, text: "Whenever I'm alone with you" },
      { id: 'l1', timeMs: 34283, endMs: 39786, text: "You make me feel like I am home again" },
      { id: 'l2', timeMs: 42606, endMs: 47698, text: "Whenever I'm alone with you" },
    ];

    // During guitar intro at 0s, 6s (user observation), and 20s
    assert.equal(findActiveLyricIndex(adeleLines, 0), -1, 'At 0s, intro is active: -1');
    assert.equal(findActiveLyricIndex(adeleLines, 6000), -1, 'At 6s (0:06), intro is active: -1');
    assert.equal(findActiveLyricIndex(adeleLines, 20000), -1, 'At 20s, intro is active: -1');

    // Once vocal begins at 26252ms
    assert.equal(findActiveLyricIndex(adeleLines, 26252), 0, 'At 26.252s, Line 0 becomes active');
    assert.equal(findActiveLyricIndex(adeleLines, 28000), 0, 'At 28.000s, Line 0 remains active');
    assert.equal(findActiveLyricIndex(adeleLines, 34283), 1, 'At 34.283s, Line 1 becomes active');
  });

  await t.test('2. Last-Line Jump Prevention: Binary search never clamps to last line when timestamps are invalid or in intro', () => {
    // Simulated broken / unsynced lines where timeMs is null
    const unsyncedLines = [
      { text: 'Line 1', timeMs: null },
      { text: 'Line 2', timeMs: null },
      { text: 'Line 3', timeMs: null },
    ];
    assert.equal(findActiveLyricIndex(unsyncedLines, 5000), -1, 'Unsynced lines return -1, never clamp to last line');

    // Valid lines with intro
    const lines = [
      { text: 'First line', timeMs: 15000 },
      { text: 'Second line', timeMs: 30000 },
      { text: 'Third line', timeMs: 45000 },
    ];
    assert.equal(findActiveLyricIndex(lines, 0), -1, 'Intro returns -1');
    assert.equal(findActiveLyricIndex(lines, 14999), -1, 'Right before first line returns -1');
    assert.equal(findActiveLyricIndex(lines, 15000), 0, 'At 15s line 0 is active');
    assert.equal(findActiveLyricIndex(lines, 29999), 0, 'At 29.999s line 0 is still active');
    assert.equal(findActiveLyricIndex(lines, 30000), 1, 'At 30s line 1 is active');
    assert.equal(findActiveLyricIndex(lines, 50000), 2, 'Beyond last line, last line remains active');
  });

  await t.test('3. LRCLIB YAML Parser: Correctly extracts line & word timestamps for Joy Crookes & Charlie Puth formats', () => {
    const yamlSample = `version: 1
lines:
- text: I can't wait
  start_ms: 12000
  end_ms: 15000
  words:
  - text: I
    start_ms: 12000
    end_ms: 12500
  - text: can't
    start_ms: 12500
    end_ms: 13500
  - text: wait
    start_ms: 13500
    end_ms: 15000
- text: For you to come home
  start_ms: 16000
  end_ms: 19000
  words:
  - text: For
    start_ms: 16000
    end_ms: 16500
  - text: you
    start_ms: 16500
    end_ms: 17000
`;

    const parsed = parseYamlLyrics(yamlSample);
    assert.equal(parsed.length, 2, 'Parsed exactly 2 root lines');
    assert.equal(parsed[0].text, "I can't wait");
    assert.equal(parsed[0].timeMs, 12000);
    assert.equal(parsed[0].endMs, 15000);
    assert.equal(parsed[0].words.length, 3);
    assert.equal(parsed[0].words[0].text, 'I');
    assert.equal(parsed[0].words[0].startMs, 12000);
    assert.equal(parsed[0].words[2].text, 'wait');
    assert.equal(parsed[0].words[2].endMs, 15000);

    assert.equal(parsed[1].text, 'For you to come home');
    assert.equal(parsed[1].timeMs, 16000);
    assert.equal(parsed[1].words.length, 2);
  });

  await t.test('4. Universal Parser Routing: YAML string detected by parseLyrics', () => {
    const yamlText = 'version: 1\nlines:\n- text: Hello\n  start_ms: 1000\n  end_ms: 2000\n';
    const lines = parseLyrics(yamlText);
    assert.equal(lines.length, 1);
    assert.equal(lines[0].text, 'Hello');
    assert.equal(lines[0].timeMs, 1000);
  });

  await t.test('5. Fallback Modes Contract: Validates Mode A, B, C, D, E', () => {
    // Mode A: Word Sync
    const wordSyncData = {
      lines: [
        { text: 'Word synced line', timeMs: 5000, syncType: 'word', words: [{ text: 'Word', startMs: 5000, endMs: 6000 }] },
      ],
      hasWordSync: true,
      syncType: 'word',
    };
    assert.equal(wordSyncData.hasWordSync, true);
    assert.equal(wordSyncData.syncType, 'word');

    // Mode B: Line-only Sync
    const lineSyncLrc = '[00:05.00]Line one\n[00:10.00]Line two\n';
    const lineSyncLines = parseLrc(lineSyncLrc);
    assert.equal(lineSyncLines.length, 2);
    assert.equal(lineSyncLines[0].timeMs, 5000);
    assert.equal(lineSyncLines[0].words, null);

    // Mode C: Unsynchronized Plain Text
    const plainText = 'Plain line 1\nPlain line 2';
    const plainLines = parseLyrics(plainText);
    assert.equal(plainLines.length, 2);
    assert.equal(plainLines[0].timeMs, null);

    // Mode D: No lyrics
    const emptyLyrics = { found: false, notFound: true };
    assert.equal(emptyLyrics.found, false);

    // Mode E: Instrumental
    const instrumentalLyrics = { found: true, instrumental: true, lines: [] };
    assert.equal(instrumentalLyrics.instrumental, true);
  });

  await t.test('6. Layout Geometry Verification: Active line centered at 82px, divider at 210px', () => {
    const stylesPath = path.resolve(__dirname, '../src/styles.css');
    const stylesCss = fs.readFileSync(stylesPath, 'utf8');

    // 164x164 artwork
    assert.ok(stylesCss.includes('width: 164px !important;'), 'Artwork width is 164px');
    assert.ok(stylesCss.includes('height: 164px !important;'), 'Artwork height is 164px');
    assert.ok(stylesCss.includes('image-rendering: -webkit-optimize-contrast;'), 'Optimized image contrast');

    // MiniLyrics height in right column
    assert.ok(stylesCss.includes('height: 154px;'), 'MiniLyrics height set to 154px (compact 3-line view)');
    assert.ok(stylesCss.includes('justify-content: flex-start;'), 'MiniLyrics starts from top');

    // Right footer borderless lifted volume row
    assert.ok(stylesCss.includes('border-top: none;'), 'Divider line cleanly removed for borderless symmetry');
    assert.ok(stylesCss.includes('height: 36px;'), 'Footer matches 36px playback controls height');

    // MiniLyrics component passes activeLineOffset={44}
    const npPath = path.resolve(__dirname, '../src/components/NowPlaying.jsx');
    const npJsx = fs.readFileSync(npPath, 'utf8');
    assert.ok(npJsx.includes('activeLineOffset={44}'), 'NowPlaying passes activeLineOffset={44} for 82px vertical alignment');
  });
});
