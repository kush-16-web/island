const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// Test formatTrackTime
const { formatTrackTime } = require('../src/lib/shared/format.js');
const { parseLyrics, parseLrc } = require('../src/lib/lyrics/lyrics.js');

describe('Gate B.1.1 — Lyric Rendering & Playback Progress Stability Suite', () => {

  describe('1. Timestamp Formatting & Hour Support', () => {
    it('formats short tracks (under 1 minute) with 0:ss', () => {
      assert.strictEqual(formatTrackTime(0), '0:00');
      assert.strictEqual(formatTrackTime(9000), '0:09');
      assert.strictEqual(formatTrackTime(10000), '0:10');
      assert.strictEqual(formatTrackTime(59000), '0:59');
    });

    it('formats normal tracks with m:ss', () => {
      assert.strictEqual(formatTrackTime(60000), '1:00');
      assert.strictEqual(formatTrackTime(74000), '1:14');
      assert.strictEqual(formatTrackTime(224000), '3:44');
      assert.strictEqual(formatTrackTime(600000), '10:00');
    });

    it('formats hour-long tracks with h:mm:ss', () => {
      assert.strictEqual(formatTrackTime(3600000), '1:00:00');
      assert.strictEqual(formatTrackTime(3665000), '1:01:05');
      assert.strictEqual(formatTrackTime(7200000), '2:00:00');
    });

    it('handles non-finite and negative inputs safely', () => {
      assert.strictEqual(formatTrackTime(NaN), '0:00');
      assert.strictEqual(formatTrackTime(null), '0:00');
      assert.strictEqual(formatTrackTime(undefined), '0:00');
      assert.strictEqual(formatTrackTime(-5000), '0:00');
    });
  });

  describe('2. CSS Invariants — Lyric Illumination & Tabular Progress', () => {
    const cssPath = path.resolve(__dirname, '../src/styles.css');
    const css = fs.readFileSync(cssPath, 'utf8');

    it('enforces -webkit-font-smoothing: antialiased across all lyric word states', () => {
      assert.match(css, /\.k-word\s*\{[^}]*-webkit-font-smoothing:\s*antialiased/);
      assert.match(css, /\.k-word\.is-sung\s*\{[^}]*-webkit-font-smoothing:\s*antialiased/);
      assert.match(css, /\.k-word\.is-active-word\s*\{[^}]*-webkit-font-smoothing:\s*antialiased/);
    });

    it('uses centered soft wavefront (calc -4px / +4px) rather than distorted percentage feather', () => {
      assert.match(css, /calc\(var\(--word-fill,\s*0%\)\s*-\s*4px\)/);
      assert.match(css, /calc\(var\(--word-fill,\s*0%\)\s*\+\s*4px\)/);
      // Ensure old 14% feather is completely gone
      assert.doesNotMatch(css, /calc\(var\(--word-fill,\s*0%\)\s*\+\s*14%\)/);
    });

    it('enforces font-variant-numeric: tabular-nums and tnum font-feature-settings on progress time', () => {
      assert.match(css, /\.song-progress__time\s*\{[^}]*font-variant-numeric:\s*tabular-nums/);
      assert.match(css, /\.song-progress__time\s*\{[^}]*font-feature-settings:\s*['"]tnum['"]/);
      assert.match(css, /\.song-progress__time\s*\{[^}]*min-width:\s*28px/);
    });

    it('ensures popover trigger pill is completely hidden when expanded', () => {
      assert.match(css, /\.np__tab-pill\.is-expanded\s*\{[^}]*opacity:\s*0\s*!important/);
      assert.match(css, /\.np__tab-pill\.is-expanded\s*\{[^}]*pointer-events:\s*none\s*!important/);
    });
  });

  describe('3. Lyric Parser Word-Sync & Fallback Robustness', () => {
    it('parses word-synced lyrics preserving word boundaries and punctuation', () => {
      const elrc = '[00:01.00] <00:01.00> I <00:01.20> can\'t <00:01.60> hide <00:01.90> the <00:02.10> truth,';
      const lines = parseLrc(elrc);
      assert.strictEqual(lines.length, 1);
      assert.strictEqual(lines[0].syncType, 'word');
      assert.strictEqual(lines[0].words.length, 5);
      assert.strictEqual(lines[0].words[0].text, 'I');
      assert.strictEqual(lines[0].words[1].text, "can't");
      assert.strictEqual(lines[0].words[4].text, 'truth,');
      assert.strictEqual(lines[0].words[0].startMs, 1000);
      assert.strictEqual(lines[0].words[1].startMs, 1200);
    });

    it('falls back strictly to line-level when no word tags are present', () => {
      const lrc = '[00:05.00] Plain line-timed lyric line without words\n[00:10.00] Second line';
      const lines = parseLrc(lrc);
      assert.strictEqual(lines.length, 2);
      assert.strictEqual(lines[0].syncType, 'line');
      assert.strictEqual(lines[0].words, null);
      assert.strictEqual(lines[0].text, 'Plain line-timed lyric line without words');
    });

    it('handles fast word transitions gracefully with monotonic timestamps', () => {
      const yrc = '[0,2000](0,120,0)come (120,120,0)on (240,120,0)be (360,120,0)my (480,220,0)baby';
      const lines = parseLyrics(yrc);
      assert.strictEqual(lines.length, 1);
      assert.strictEqual(lines[0].syncType, 'word');
      assert.strictEqual(lines[0].words.length, 5);
      assert.strictEqual(lines[0].words[0].durationMs, 120);
      assert.strictEqual(lines[0].words[1].durationMs, 120);
      assert.strictEqual(lines[0].words[2].durationMs, 120);
    });
  });

  describe('4. SongProgressBar Architecture & Clock Authority', () => {
    const componentPath = path.resolve(__dirname, '../src/components/SongProgressBar.jsx');
    const compCode = fs.readFileSync(componentPath, 'utf8');

    it('does NOT run a competing rAF state updater that fights the upstream media clock', () => {
      // Must not have setInterpolatedMs competing with parent props
      assert.doesNotMatch(compCode, /setInterpolatedMs\(nextPos\)/);
      assert.doesNotMatch(compCode, /setInterpolatedMs\(basePosMs\)/);
    });

    it('uses displayPositionMs from upstream with immediate scrub override during drag/seek', () => {
      assert.match(compCode, /let displayPositionMs = basePosMs;/);
      assert.match(compCode, /if \(isDragging && scrubPositionMs !== null\)/);
      assert.match(compCode, /formatTrackTime\(clampedDisplayMs\)/);
    });

    it('strictly guards against accidental hover seeks', () => {
      assert.match(compCode, /if \(!isPointerDownRef\.current \|\| e\.buttons !== 1/);
    });
  });
});

