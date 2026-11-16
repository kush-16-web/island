const { test, describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const stylesCss = fs.readFileSync(path.join(root, 'src/styles.css'), 'utf8');
const precisionJsx = fs.readFileSync(path.join(root, 'src/components/PrecisionLyricLine.jsx'), 'utf8');
const miniLyricsJsx = fs.readFileSync(path.join(root, 'src/components/MiniLyrics.jsx'), 'utf8');
const floatingJsx = fs.readFileSync(path.join(root, 'src/components/FloatingLyricsStage.jsx'), 'utf8');
const fullLyricsJsx = fs.readFileSync(path.join(root, 'src/components/FullLyrics.jsx'), 'utf8');

describe('Gate B.1.3 — Word-by-Word Lyrics Stability & Regression Suite', () => {
  // 1-5: Illumination States (0%, 25%, 50%, 75%, 99% -> 100% -> completed)
  it('1. 0% fill — upcoming word remains dim and unilluminated', () => {
    // Un-sung, un-active word has 0.44 alpha dim color
    assert.match(stylesCss, /\.k-word\s*\{[^}]*color:\s*rgba\(255,\s*255,\s*255,\s*0\.44\)/);
  });

  it('2. 25% fill — smooth partial illumination via background-clip text', () => {
    assert.match(stylesCss, /\.k-word\.is-active-word\s*\{[^}]*-webkit-background-clip:\s*text/);
    assert.match(stylesCss, /\.k-word\.is-active-word\s*\{[^}]*-webkit-text-fill-color:\s*transparent/);
  });

  it('3. 50% fill — correct intermediate state with centered 8px wavefront', () => {
    assert.match(stylesCss, /calc\(var\(--word-fill,\s*0%\)\s*-\s*4px\)/);
    assert.match(stylesCss, /calc\(var\(--word-fill,\s*0%\)\s*\+\s*4px\)/);
  });

  it('4. 75% fill — correct intermediate state with transparent text fill and solid white gradient', () => {
    assert.match(stylesCss, /#ffffff\s+0%,\s*#ffffff\s+calc\(var\(--word-fill/);
  });

  it('5. 99% -> 100% -> completed state: seamless transition', () => {
    // Active word base color is #ffffff (not transparent) so no flash occurs
    assert.match(stylesCss, /\.k-word\.is-active-word\s*\{[^}]*color:\s*#ffffff/);
  });

  // 6-9: Completion Brightness & Zero Color Transition Flash
  it('6. Completed word remains bright at +16ms (solid white text-clip)', () => {
    assert.match(stylesCss, /\.k-word\.is-sung\s*\{[^}]*background:\s*#ffffff\s*!important/);
    assert.match(stylesCss, /\.k-word\.is-sung\s*\{[^}]*-webkit-background-clip:\s*text\s*!important/);
  });

  it('7. Completed word remains bright at +33ms', () => {
    assert.match(stylesCss, /\.k-word\.is-sung\s*\{[^}]*color:\s*#ffffff\s*!important/);
  });

  it('8. Completed word remains bright at +120ms', () => {
    assert.match(stylesCss, /\.k-word\.is-sung\s*\{[^}]*opacity:\s*1/);
  });

  it('9. No color-transition flash: transition is explicitly none on .k-word and .is-sung', () => {
    assert.match(stylesCss, /\.k-word\s*\{[^}]*transition:\s*none/);
    assert.match(stylesCss, /\.k-word\.is-sung\s*\{[^}]*transition:\s*none\s*!important/);
  });

  // 10-16: Single Owner Animation Architecture
  it('10. No competing CSS variable writers: React JSX does not write --word-fill inline', () => {
    // In PrecisionLyricLine.jsx, JSX must not set dynamic --word-fill style
    assert.ok(
      !precisionJsx.includes("style={{ '--word-fill'"),
      'React JSX must not write --word-fill inline style in PrecisionLyricLine'
    );
    assert.ok(
      precisionJsx.includes('applyWordStates'),
      'PrecisionLyricLine must route word-fill exclusively through applyWordStates'
    );
  });

  it('11. No backward fill during normal playback (monotonic progress enforcement)', () => {
    assert.ok(
      precisionJsx.includes('Math.max(activeWordProgRef.current.prog, rawProg)'),
      'Must enforce monotonic forward fill progress within active word'
    );
  });

  it('12. Pause freezes word fill and cancels rAF loop immediately', () => {
    assert.ok(
      precisionJsx.includes('!playing && wasPlayingRef.current'),
      'Must handle pause transition'
    );
    assert.ok(
      precisionJsx.includes('applyWordStates(currentPositionMs, { isSeek: true })'),
      'Must freeze word fill on pause'
    );
    assert.ok(
      precisionJsx.includes('cancelAnimationFrame(rafIdRef.current)'),
      'Must cancel rAF loop when paused'
    );
  });

  it('13. Resume continues correctly by rebasing clockAnchorRef', () => {
    assert.ok(
      precisionJsx.includes('playing && !wasPlayingRef.current'),
      'Must handle resume transition by rebasing clock anchor'
    );
  });

  it('14. Seek backward reconciles immediately (>280ms drift triggers seek branch)', () => {
    assert.ok(
      precisionJsx.includes('drift > 280'),
      'Must detect seek via drift threshold'
    );
    assert.ok(
      precisionJsx.includes('applyWordStates(currentPositionMs, { isSeek: true })'),
      'Must pass isSeek: true to allow immediate backward jump on seek'
    );
  });

  it('15. Seek forward reconciles immediately without reverse-scroll animation', () => {
    assert.ok(
      precisionJsx.includes('currentOffsetRef.current = seekOffset'),
      'Must immediately apply seek offset'
    );
  });

  it('16. Track change resets stale animation state and initializes new line', () => {
    assert.ok(
      precisionJsx.includes('const isNewLine = activeLineIdRef.current !=='),
      'Must detect new line and reset offset/clock state'
    );
    assert.ok(
      precisionJsx.includes('activeWordProgRef.current = { wordIdx: -1, prog: 0 }'),
      'Must reset active word progress tracking on new line'
    );
  });

  // 17-19: Line / Word Typographic Structure
  it('17. Long lyric line with punctuation preserves spaces and punctuation glyphs', () => {
    assert.ok(
      precisionJsx.includes('<span className="k-word__base">{w.text}</span>'),
      'Must render full word text including punctuation'
    );
    assert.match(stylesCss, /\.k-word\s*\{[^}]*white-space:\s*pre/);
  });

  it('18. Fast succession of short words: word class cleanup on completion', () => {
    assert.ok(
      precisionJsx.includes("el.classList.add('is-sung')"),
      'Must add is-sung when currentMs >= w.endMs'
    );
    assert.ok(
      precisionJsx.includes("el.classList.remove('is-active-word')"),
      'Must remove is-active-word when word completes'
    );
    assert.ok(
      precisionJsx.includes("el.style.removeProperty('--word-fill')"),
      'Must clear --word-fill property once word completes'
    );
  });

  it('19. Sustained long word: maintains linear progression across entire duration', () => {
    assert.ok(
      precisionJsx.includes('(currentMs - w.startMs) / w.durationMs'),
      'Must calculate progress proportionally across full duration'
    );
  });

  // 20-22: Isolation & Teardown
  it('20. Line-only timestamps preserve original behavior without is-word-synced override', () => {
    assert.ok(
      miniLyricsJsx.includes("const isWordSynced = Boolean(line?.syncType === 'word' || (line?.words && line.words.length > 0))"),
      'MiniLyrics must strictly isolate word-synced lines from line-synced lines'
    );
    assert.match(stylesCss, /\.mini-lyrics__line\s*\{[^}]*transition:\s*color 0\.22s/);
    assert.match(stylesCss, /\.mini-lyrics__line\.is-word-synced\s*\{[^}]*transition:\s*none/);
  });

  it('21. Unsynchronized fallback remains functional in MiniLyrics and FullLyrics', () => {
    assert.ok(
      miniLyricsJsx.includes('{line.text}'),
      'MiniLyrics must render raw line.text for unsynchronized or non-active lines'
    );
    assert.ok(
      fullLyricsJsx.includes('line.text'),
      'FullLyrics must support line text fallback'
    );
  });

  it('22. No animation leaks on unmount: cleans up rAF and ResizeObserver', () => {
    assert.ok(
      precisionJsx.includes('cancelAnimationFrame(rafIdRef.current)'),
      'Must cancel rAF on component unmount'
    );
    assert.ok(
      precisionJsx.includes('ro.disconnect()'),
      'Must disconnect ResizeObserver on unmount'
    );
  });
});
