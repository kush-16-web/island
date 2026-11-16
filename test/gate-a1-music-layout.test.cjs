const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const stylesCss = fs.readFileSync(path.resolve(__dirname, '../src/styles.css'), 'utf8');
const nowPlayingJsx = fs.readFileSync(path.resolve(__dirname, '../src/components/NowPlaying.jsx'), 'utf8');
const mvcJsx = fs.readFileSync(path.resolve(__dirname, '../src/components/MusicVolumeControl.jsx'), 'utf8');
const songProgressJsx = fs.readFileSync(path.resolve(__dirname, '../src/components/SongProgressBar.jsx'), 'utf8');
const iconsJsx = fs.readFileSync(path.resolve(__dirname, '../src/components/icons.jsx'), 'utf8');
const miniLyricsJsx = fs.readFileSync(path.resolve(__dirname, '../src/components/MiniLyrics.jsx'), 'utf8');
const notchStateJs = fs.readFileSync(path.resolve(__dirname, '../src/lib/notch-state.js'), 'utf8');

test('Gate A.1 Music Layout & Interaction Correction Verification Suite', async (t) => {
  await t.test('1. Volume Speaker Icon: dedicated unclipped container with 4 states', () => {
    // Dedicated fixed-size container
    assert.ok(stylesCss.includes('.mvc__icon-box'), 'CSS must define .mvc__icon-box');
    assert.ok(stylesCss.includes('width: 22px;') || stylesCss.includes('width: 20px;'), '.mvc__mute-btn must have dedicated width');
    assert.ok(mvcJsx.includes('className="mvc__icon-box"'), 'MusicVolumeControl must render icon inside .mvc__icon-box');
    assert.ok(mvcJsx.includes('width={14} height={14}'), 'Volume icons must render with consistent 14px size');

    // 4 States in icons.jsx
    assert.ok(iconsJsx.includes('VolumeX:'), 'icons.jsx must provide VolumeX for 0% / muted');
    assert.ok(iconsJsx.includes('VolumeLow:'), 'icons.jsx must provide VolumeLow for 1-33%');
    assert.ok(iconsJsx.includes('VolumeMedium:'), 'icons.jsx must provide VolumeMedium for 34-66%');
    assert.ok(iconsJsx.includes('VolumeHigh:'), 'icons.jsx must provide VolumeHigh for 67-100%');

    // Check SVG viewBox safety
    assert.ok(!iconsJsx.includes('points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"'), 'Horn polygon must not exceed viewBox bounds');
  });

  await t.test('2. SongProgressBar: smooth interpolation, click-to-seek, and direct drag scrubbing', () => {
    assert.ok(songProgressJsx.includes('displayPositionMs'), 'Must consume authoritative media timeline');
    assert.ok(songProgressJsx.includes('setPointerCapture'), 'Must capture pointer during drag/scrub');
    assert.ok(songProgressJsx.includes('releasePointerCapture'), 'Must release pointer capture on release or cancel');
    assert.ok(songProgressJsx.includes('180ms cubic-bezier(0.22, 1, 0.36, 1)'), 'Must animate click-to-seek over 180ms');
    assert.ok(songProgressJsx.includes('useReducedMotion'), 'Must respect prefersReducedMotion');
    assert.ok(stylesCss.includes('.song-progress__track'), 'styles.css must style .song-progress__track');
    assert.ok(stylesCss.includes('.song-progress__thumb'), 'styles.css must style .song-progress__thumb');
  });

  await t.test('3. Expanded Music Proportions: 164x164 1:1 artwork, no space-between stretch, balanced lyrics', () => {
    // Left column & 1:1 artwork
    assert.ok(stylesCss.includes('.np--two-col .np__cover-wrap'), 'Must have specific .np--two-col .np__cover-wrap style');
    assert.ok(stylesCss.includes('width: 164px !important;'), 'Artwork width must be 164px (full column width)');
    assert.ok(stylesCss.includes('height: 164px !important;'), 'Artwork height must be 164px (1:1 square)');
    assert.ok(stylesCss.includes('justify-content: flex-start;'), 'Left column must use flex-start (never space-between)');

    // Controls below progress
    assert.ok(nowPlayingJsx.includes('<SongProgressBar'), 'NowPlaying must render SongProgressBar');
    assert.ok(nowPlayingJsx.includes('className="np__controls np__controls--left-aligned"'), 'Controls must be left-aligned below progress');

    // Right column lyrics
    assert.ok(miniLyricsJsx.includes('effectiveVpH / 2 - LINE_HEIGHT / 2'), 'MiniLyrics must center active line at vertical midpoint');
    assert.ok(stylesCss.includes('.np--two-col .np__right .mini-lyrics'), 'Must style .mini-lyrics in two-col layout');
    assert.ok(stylesCss.includes('max-height: none;'), '.mini-lyrics in two-col layout must not be constrained to 84px');
  });

  await t.test('4. Geometry: Notch state matches compact ~572-580x300 target range', () => {
    const { computeNotchDimensions } = require('../src/lib/notch-state.js');
    const dim = computeNotchDimensions({
      notchState: 'expanded',
      mode: 'hub',
      tab: 'playing',
      hasActiveMedia: true,
    });
    assert.ok(dim.width >= 560 && dim.width <= 600, `Width ${dim.width} must be within 560-600px`);
    assert.ok(dim.height >= 290 && dim.height <= 330, `Height ${dim.height} must be within 290-330px`);
  });
});

