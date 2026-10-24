'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Pass 2.2.7.3: Artwork Compositor Glide, Wide Metadata & Concert Layering Suite', async (t) => {
  const flPath = path.join(__dirname, '../src/components/FullLyrics.jsx');
  const npPath = path.join(__dirname, '../src/components/NowPlaying.jsx');
  const hubPath = path.join(__dirname, '../src/components/Hub.jsx');
  const islandPath = path.join(__dirname, '../src/components/Island.jsx');
  const cssPath = path.join(__dirname, '../src/styles.css');

  const flCode = fs.readFileSync(flPath, 'utf8');
  const npCode = fs.readFileSync(npPath, 'utf8');
  const hubCode = fs.readFileSync(hubPath, 'utf8');
  const islandCode = fs.readFileSync(islandPath, 'utf8');
  const cssCode = fs.readFileSync(cssPath, 'utf8');

  await t.test('1. Entry & Exit: Full Lyrics opens only on request, restored on exit', () => {
    // Standard player viewMode is default
    assert.ok(
      npCode.includes("handleSetViewMode(isVideoSource ? 'cinema' : 'player')"),
      'NowPlaying must default to player viewMode'
    );

    // Full Lyrics opens via openFullLyricsWithGlide on MiniLyrics and tab pill
    assert.ok(
      npCode.includes('onClick={openFullLyricsWithGlide}'),
      'MiniLyrics and Lyrics tab pill must trigger openFullLyricsWithGlide'
    );

    // Full Lyrics close triggers handleRequestClose for smooth return
    assert.ok(
      flCode.includes('handleRequestClose') && flCode.includes('setIsClosing(true)'),
      'FullLyrics must handle request close with graceful return state'
    );
  });

  await t.test('2. Global Navigation: Hidden strictly during Full Lyrics and restored on exit', () => {
    assert.ok(
      hubCode.includes('isLyricsActive = tab === \'playing\' && (lyricsViewMode === \'lyrics\' || lyricsViewMode === true)'),
      'Hub.jsx must compute isLyricsActive conditionally only for playing tab in lyrics mode'
    );
    assert.ok(
      hubCode.includes('{!isLyricsActive && (') && hubCode.includes('<div className="hub__head">'),
      'Hub.jsx must omit hub__head completely when isLyricsActive is true'
    );
    assert.ok(
      cssCode.includes('.hub--lyrics-active') && cssCode.includes('padding-top: 0;'),
      'styles.css must reclaim top navigation space in .hub--lyrics-active'
    );
  });

  await t.test('3. Compact Dimensions: 390px window, 126px artwork, 70-85px lyrics viewport', () => {
    // Island height target: 390px for Full Lyrics
    assert.ok(
      islandCode.includes("if (isLyricsFull === 'lyrics' || isLyricsFull === true) return 390;"),
      'Island.jsx must allocate 390px for compact Full Lyrics'
    );

    // Normal player height preserved at 276px
    assert.ok(
      islandCode.includes("return 276;"),
      'Island.jsx must preserve normal 276px Now Playing height'
    );

    // Artwork sized at 126px
    assert.ok(
      cssCode.includes('.full-lyrics__hero-art-wrap') && cssCode.includes('width: 126px;') && cssCode.includes('height: 126px;'),
      'styles.css must size .full-lyrics__hero-art-wrap to 126x126px'
    );

    // Lyrics viewport sized within 70-85px range
    assert.ok(
      cssCode.includes('.full-lyrics__right') && cssCode.includes('min-height: 70px;') && cssCode.includes('max-height: 85px;'),
      'styles.css must constrain lyrics viewport to 70-85px'
    );

    // Lyrics line gap set to 10px (within 8-12px range)
    assert.ok(
      cssCode.includes('.full-lyrics__scroller') && cssCode.includes('gap: 10px;'),
      'styles.css must specify 10px line separation in scroller'
    );
  });

  await t.test('4. Single-Layer Compositor Glide: No duplicate overlay clone and GPU transform travel', () => {
    // Source element ref and delta measurement in NowPlaying
    assert.ok(
      npCode.includes('ref={playerCoverRef}'),
      'NowPlaying must maintain a ref to the source album cover'
    );
    assert.ok(
      npCode.includes('let delta = { x: -153, y: 2, scale: 64 / 126 }'),
      'NowPlaying must compute travel delta from source to destination'
    );

    // Destination hero artwork performs the travel itself (single layer, no clone overlay)
    assert.ok(
      flCode.includes('travelDelta?.x ?? -153') && flCode.includes('travelDelta?.scale'),
      'FullLyrics hero artwork must animate from travelDelta coordinates'
    );
    assert.ok(
      !npCode.includes('className="island-artwork-glider"'),
      'NowPlaying must NOT render a duplicate glider clone overlay'
    );

    // GPU compositor acceleration without competing CSS width/height transitions
    assert.ok(
      cssCode.includes('.full-lyrics__hero-art-wrap') && cssCode.includes('will-change: transform;'),
      'styles.css must apply will-change: transform on hero artwork wrap'
    );
    const heroWrapCss = cssCode.slice(cssCode.indexOf('.full-lyrics__hero-art-wrap'), cssCode.indexOf('.full-lyrics__hero-art-wrap--large'));
    assert.ok(
      !heroWrapCss.includes('transition: width'),
      'styles.css must not have competing transition: width on hero artwork wrap'
    );

    // Return animation on close
    assert.ok(
      flCode.includes('isClosing') && flCode.includes('onAnimationComplete'),
      'FullLyrics must reverse travel transform on isClosing and invoke onClose on completion'
    );
  });

  await t.test('5. Track Change Isolation: Initial mount does not slide, track skips glide inside fixed frame', () => {
    assert.ok(
      flCode.includes('isInitialMountRef.current || isReducedMotion'),
      'FullLyrics must suppress entrance slide on initial mount'
    );
    assert.ok(
      flCode.includes('new Image()') && flCode.includes('loadTokenRef'),
      'FullLyrics must preload incoming cover and discard stale tokens'
    );
  });

  await t.test('6. Responsive Wide Metadata: Up to 420px width, no marquee truncation, multi-line wrap', () => {
    // Styles allow wide container and multi-line wrapping
    assert.ok(
      cssCode.includes('.full-lyrics__hero-meta') && cssCode.includes('max-width: 420px;'),
      'styles.css must allow metadata to expand up to 420px'
    );
    assert.ok(
      cssCode.includes('.full-lyrics__hero-title') && cssCode.includes('-webkit-line-clamp: 2;') && cssCode.includes('word-break: break-word;'),
      'styles.css must allow title to wrap up to 2 lines naturally'
    );
    assert.ok(
      cssCode.includes('.full-lyrics__hero-artist') && cssCode.includes('-webkit-line-clamp: 2;') && cssCode.includes('word-break: break-word;'),
      'styles.css must allow artist to wrap up to 2 lines naturally'
    );

    // FullLyrics does not use MarqueeText which forces single-line nowrap
    assert.ok(
      !flCode.includes('<MarqueeText'),
      'FullLyrics must not use MarqueeText for hero metadata'
    );
  });

  await t.test('7. Clean Concert Tab Isolation: Mutually exclusive with zero decorative visuals', () => {
    // Mutually exclusive rendering
    assert.ok(
      flCode.includes("activeTab === 'concert' ? (") && flCode.includes('<div className="full-lyrics__concert-pane">'),
      'FullLyrics must isolate Concert pane from artwork & lyrics presentation'
    );

    // Minimal dark-glass message with track info
    assert.ok(
      flCode.includes('Concert mode — coming later'),
      'Concert tab must show clean "Concert mode — coming later" message'
    );
    assert.ok(
      flCode.includes('full-lyrics__concert-track-title'),
      'Concert tab must display current track title'
    );

    // No unwanted decorative visuals
    assert.ok(!flCode.includes('full-lyrics__concert-glow'), 'Must not include generic glowing spheres');
    assert.ok(!flCode.includes('Icon.Sparkles'), 'Must not include generic sparkles icon');
    assert.ok(!flCode.includes('concert-dot-pulse'), 'Must not include decorative pulse dots');
  });

  await t.test('8. High Quality Artwork: Upgrades stream thumbnails to crystal clear resolution', () => {
    assert.ok(
      flCode.includes('upgradeProviderArtUrl'),
      'FullLyrics must import and apply upgradeProviderArtUrl'
    );
    assert.ok(
      flCode.includes('const highQualityArt = upgradeProviderArtUrl(displayArt) || displayArt;'),
      'FullLyrics must resolve highest available artwork resolution'
    );
  });

  await t.test('9. Six-Button Toolbar: Approved 6 controls preserved with no extra seek buttons', () => {
    // Left controls
    assert.ok(flCode.includes('heart-btn--bottom'), 'Must include favorite heart button');
    assert.ok(flCode.includes('lyrics-toggle-btn'), 'Must include music note show/hide button');
    assert.ok(flCode.includes('full-lyrics__vol-ctrl'), 'Must include volume control with popover');

    // Right controls
    assert.ok(flCode.includes("onControl('previous')"), 'Must include previous button');
    assert.ok(flCode.includes("onControl('playpause')"), 'Must include play/pause button');
    assert.ok(flCode.includes("onControl('next')"), 'Must include next button');

    // No extra seek buttons in FullLyrics
    const controlsRowSlice = flCode.slice(flCode.indexOf('full-lyrics__controls-row'));
    assert.ok(!controlsRowSlice.includes('Icon.Replay5'), 'FullLyrics toolbar must not have Replay5');
    assert.ok(!controlsRowSlice.includes('Icon.Forward5'), 'FullLyrics toolbar must not have Forward5');
  });

  await t.test('10. Normal Now Playing Unchanged: Preserves standard UI and 5s skip buttons', () => {
    assert.ok(
      npCode.includes('Icon.Replay5') && npCode.includes('Icon.Forward5'),
      'NowPlaying must preserve Replay5 and Forward5 in normal player'
    );
    assert.ok(
      npCode.includes('className="np__main"'),
      'NowPlaying must preserve normal np__main player UI'
    );
  });
});
