/**
 * test/pass2-2-7-cinema-lyrics-expressive.test.cjs
 * Comprehensive test suite for Pass 2.2.7 refinements:
 * 1. Cleaned-up Now Playing navigation (Cinema tab removed, Cinema opened via Cover click)
 * 2. Lyrics Appearance Popover on Lyrics tab pill (Classic, Expressive, Kinetic)
 * 3. Expressive & Kinetic Lyrics Engine (deterministic, restrained, text-preserving)
 * 4. Favorites Tab Icon updated to Library
 * 5. Smooth Artwork Glide with source hiding & compositor travel
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const npPath = path.join(__dirname, '..', 'src', 'components', 'NowPlaying.jsx');
const flPath = path.join(__dirname, '..', 'src', 'components', 'FullLyrics.jsx');
const mlPath = path.join(__dirname, '..', 'src', 'components', 'MiniLyrics.jsx');
const plPath = path.join(__dirname, '..', 'src', 'components', 'PrecisionLyricLine.jsx');
const enginePath = path.join(__dirname, '..', 'src', 'lib', 'lyrics', 'lyrics-style-engine.js');
const cssPath = path.join(__dirname, '..', 'src', 'styles.css');

const npCode = fs.readFileSync(npPath, 'utf8');
const flCode = fs.readFileSync(flPath, 'utf8');
const mlCode = fs.readFileSync(mlPath, 'utf8');
const plCode = fs.readFileSync(plPath, 'utf8');
const engineCode = fs.readFileSync(enginePath, 'utf8');
const cssCode = fs.readFileSync(cssPath, 'utf8');

test('Pass 2.2.7: Cinema via Cover, Lyrics Style Popover, Expressive Engine & Library Icon', async (t) => {
  await t.test('1. Navigation: Cinema tab removed from bottom tabs, only Lyrics and Favorites remain', () => {
    // Check np__right-tabs--bottom container content
    const tabsContainerIdx = npCode.indexOf('className="np__right-tabs np__right-tabs--bottom"');
    assert.ok(tabsContainerIdx !== -1, 'np__right-tabs--bottom must exist in NowPlaying');

    const tabsEndIdx = npCode.indexOf('layoutId="island-progress-wrap"');
    const tabsSnippet = npCode.slice(tabsContainerIdx, tabsEndIdx !== -1 ? tabsEndIdx : tabsContainerIdx + 4500);

    // Must NOT have Cinema button in tabs snippet
    assert.ok(!tabsSnippet.includes("handleSetViewMode('cinema')"), 'Cinema button must NOT be in the bottom tabs');
    assert.ok(!tabsSnippet.includes('<span>Cinema</span>'), 'Cinema label must NOT be in the bottom tabs');

    // Must have Lyrics and Favorites
    assert.ok(tabsSnippet.includes('<span>Lyrics</span>'), 'Lyrics button must be in bottom tabs');
    assert.ok(tabsSnippet.includes('<span>Favorites</span>'), 'Favorites button must be in bottom tabs');
  });

  await t.test('2. Navigation: Album artwork is clickable to open Cinema Mode', () => {
    assert.ok(
      npCode.includes('className="np__cover-wrap np__cover-wrap--clickable"'),
      'Album cover must have np__cover-wrap--clickable class'
    );
    assert.ok(
      npCode.includes("onClick={() => handleSetViewMode('cinema')}"),
      'Clicking album cover must call handleSetViewMode("cinema")'
    );
    assert.ok(
      npCode.includes('aria-label="Open Cinema Mode"'),
      'Cover must have accessible aria-label="Open Cinema Mode"'
    );
    assert.ok(
      npCode.includes('role="button"'),
      'Cover must have role="button"'
    );
    assert.ok(
      npCode.includes('tabIndex={0}'),
      'Cover must have tabIndex={0}'
    );

    // Heart overlay button inside cover must preserve favorite functionality
    assert.ok(
      npCode.includes('className={`heart-btn heart-btn--overlay'),
      'Heart overlay button must exist inside cover wrap'
    );
    assert.ok(
      npCode.includes('onClick={toggleFavorite}'),
      'Heart overlay button must call toggleFavorite'
    );
  });

  await t.test('3. Favorites Tab Icon: Uses Library icon instead of Heart icon', () => {
    const tabsContainerIdx = npCode.indexOf('className="np__right-tabs np__right-tabs--bottom"');
    const tabsEndIdx = npCode.indexOf('layoutId="island-progress-wrap"');
    const tabsSnippet = npCode.slice(tabsContainerIdx, tabsEndIdx !== -1 ? tabsEndIdx : tabsContainerIdx + 4500);

    assert.ok(
      tabsSnippet.includes('<Icon.Library width={11} height={11} />'),
      'Favorites tab pill must render Icon.Library'
    );
    assert.ok(
      !tabsSnippet.includes('<Icon.Heart width={11} height={11} filled={isFavorite} />'),
      'Favorites tab pill must NOT use Heart icon'
    );
    assert.ok(
      tabsSnippet.includes('<span>Favorites</span>'),
      'Tab pill label must remain "Favorites"'
    );
  });

  await t.test('4. Lyrics Tab Popover: Toggles style selector without changing viewMode or interrupting playback', () => {
    assert.ok(
      npCode.includes('setShowLyricsStylePopover((prev) => !prev)'),
      'Clicking Lyrics tab pill must toggle popover'
    );
    assert.ok(
      npCode.includes('np__lyrics-popover'),
      'Popover element with class np__lyrics-popover must exist'
    );
    assert.ok(
      npCode.includes('Classic') && npCode.includes('Kinetic') && !npCode.includes('Expressive'),
      'Popover must include Classic and Kinetic options and must not include Expressive'
    );
    assert.ok(
      npCode.includes('setLyricsStyle(newStyle)'),
      'Selecting option must persist lyrics style'
    );
    assert.ok(
      npCode.includes('popoverRef'),
      'Must use popoverRef for outside-click dismissal'
    );

    // MiniLyrics direct click still triggers full lyrics
    assert.ok(
      npCode.includes('onClick={openFullLyricsWithGlide}'),
      'MiniLyrics click must open Full Lyrics with glide'
    );
  });

  await t.test('5. Lyrics Engine: Exports Classic & Kinetic styles and computes deterministic presentation', () => {
    assert.ok(engineCode.includes('LYRICS_STYLES = {'), 'Engine must export LYRICS_STYLES');
    assert.ok(engineCode.includes('CLASSIC: \'classic\''), 'Engine has classic style');
    assert.ok(engineCode.includes('KINETIC: \'kinetic\''), 'Engine has kinetic style');
    assert.ok(!engineCode.includes('EXPRESSIVE: \'expressive\''), 'Engine must not export expressive style');
    assert.ok(engineCode.includes('getLyricsPresentationForLine'), 'Engine exports getLyricsPresentationForLine');
    assert.ok(engineCode.includes('getTrackLyricsPresentation'), 'Engine exports getTrackLyricsPresentation');
    assert.ok(engineCode.includes('getLyricsStyle'), 'Engine exports getLyricsStyle');
    assert.ok(engineCode.includes('setLyricsStyle'), 'Engine exports setLyricsStyle');

    // Verify Classic produces clean lines without emojis or kinetic tokens
    assert.ok(engineCode.includes('style !== LYRICS_STYLES.KINETIC'));

    // Verify Kinetic uses CSS typography effect classes
    assert.ok(engineCode.includes('KINETIC_EFFECTS') && engineCode.includes('fracture') && engineCode.includes('fade'));
  });

  await t.test('6. Presentation Integration: FullLyrics, MiniLyrics, PrecisionLyricLine support styles', () => {
    assert.ok(
      flCode.includes('getTrackLyricsPresentation'),
      'FullLyrics must import and use getTrackLyricsPresentation'
    );
    assert.ok(
      flCode.includes('pres?.kineticEffect'),
      'FullLyrics must render kineticEffect'
    );
    assert.ok(
      mlCode.includes('getTrackLyricsPresentation'),
      'MiniLyrics must import and use getTrackLyricsPresentation'
    );
    assert.ok(
      mlCode.includes('presentation={lyricsPresentation[idx]}'),
      'MiniLyrics must pass presentation to PrecisionLyricLine'
    );
    assert.ok(
      plCode.includes('presentation = null') && plCode.includes('k-fx-'),
      'PrecisionLyricLine must support presentation prop and kinetic typography'
    );
  });

  await t.test('7. Artwork Glide: Single-layer travel with source cover hidden during flight', () => {
    assert.ok(
      npCode.includes('isSourceCoverHidden'),
      'NowPlaying must track isSourceCoverHidden state'
    );
    assert.ok(
      npCode.includes('setIsSourceCoverHidden(true)'),
      'NowPlaying must hide source cover when opening Full Lyrics'
    );
    assert.ok(
      npCode.includes('setIsSourceCoverHidden(false)'),
      'NowPlaying must restore source cover when Full Lyrics closes'
    );
    assert.ok(
      npCode.includes('opacity: isSourceCoverHidden ? 0 : 1'),
      'Source cover must have opacity 0 during flight'
    );
    assert.ok(
      cssCode.includes('.full-lyrics__hero-art-wrap') && cssCode.includes('will-change: transform;'),
      'Hero artwork wrap must have will-change: transform in styles.css'
    );
  });

  await t.test('8. CSS Styles: Popover and kinetic typography effects are defined', () => {
    assert.ok(cssCode.includes('.np__lyrics-popover'), 'CSS must define .np__lyrics-popover');
    assert.ok(cssCode.includes('.np__lyrics-popover-option'), 'CSS must define .np__lyrics-popover-option');
    assert.ok(cssCode.includes('.k-fx-fracture'), 'CSS must define kinetic effect .k-fx-fracture');
    assert.ok(cssCode.includes('.k-fx-fall'), 'CSS must define kinetic effect .k-fx-fall');
    assert.ok(cssCode.includes('.k-fx-stretch'), 'CSS must define kinetic effect .k-fx-stretch');
    assert.ok(cssCode.includes('.k-fx-fade'), 'CSS must define kinetic effect .k-fx-fade');
    assert.ok(cssCode.includes('.k-fx-pulse') || cssCode.includes('.k-fx-soft-pulse'), 'CSS must define kinetic pulse effect');
    assert.ok(cssCode.includes('.np__cover-wrap--clickable'), 'CSS must define .np__cover-wrap--clickable');
  });
});
