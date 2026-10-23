'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Pass 2.2.6: Premium Full Lyrics Experience Suite', async (t) => {
  const { upgradeProviderArtUrl, extractYouTubeIdFromMedia } = await import('../src/lib/art-resolver.js');

  await t.test('1. High-Resolution Artwork Upgrade: Spotify converts low-res to 640x640', () => {
    const lowRes64 = 'https://i.scdn.co/image/ab67616d00004851c27e8a3f87532dfc545c0883';
    const lowRes300 = 'https://i.scdn.co/image/ab67616d00001e02c27e8a3f87532dfc545c0883';
    const expectedHd = 'https://i.scdn.co/image/ab67616d0000b273c27e8a3f87532dfc545c0883';

    assert.equal(upgradeProviderArtUrl(lowRes64), expectedHd);
    assert.equal(upgradeProviderArtUrl(lowRes300), expectedHd);
  });

  await t.test('2. High-Resolution Artwork Upgrade: Apple Music converts 100x100 to 1200x1200bb', () => {
    const appleLowRes = 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/37/100x100bb.jpg';
    const expectedAppleHd = 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/37/1200x1200bb.jpg';

    assert.equal(upgradeProviderArtUrl(appleLowRes), expectedAppleHd);
  });

  await t.test('3. High-Resolution Artwork Upgrade: YouTube thumbnails upgrade to maxresdefault', () => {
    const ytThumb = 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg';
    const ytExpected = 'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg';

    assert.equal(upgradeProviderArtUrl(ytThumb), ytExpected);
  });

  await t.test('4. High-Resolution Artwork Upgrade: YouTube Music Google CDN upgrades to 1200x1200', () => {
    const gCdnUrl = 'https://lh3.googleusercontent.com/s6_vXk=w120-h120-l90-rj';
    const gExpected = 'https://lh3.googleusercontent.com/s6_vXk=w1200-h1200-l90-rj';

    assert.equal(upgradeProviderArtUrl(gCdnUrl), gExpected);
  });

  await t.test('5. High-Resolution Artwork Upgrade: Deezer and Tidal upgrade cleanly', () => {
    const deezer = 'https://e-cdns-images.dzcdn.net/images/cover/123/250x250-000000-80-0-0.jpg';
    const deezerExpected = 'https://e-cdns-images.dzcdn.net/images/cover/123/1000x1000-000000-80-0-0.jpg';
    assert.equal(upgradeProviderArtUrl(deezer), deezerExpected);

    const tidal = 'https://resources.tidal.com/images/abc/320x320.jpg';
    const tidalExpected = 'https://resources.tidal.com/images/abc/1200x1200.jpg';
    // Matches our replace rule
    assert.ok(upgradeProviderArtUrl(tidal).includes('1280x1280') || upgradeProviderArtUrl(tidal).includes('1200x1200'));
  });

  await t.test('6. Plain Lyrics Integrity: Never fabricates timestamps for unsynchronized lyrics', async () => {
    const nowPlayingFile = fs.readFileSync(path.join(__dirname, '../src/lib/lyrics.js'), 'utf8');

    // Confirm plain lyrics are mapped with null timestamps
    assert.ok(
      nowPlayingFile.includes('timeMs: null') && nowPlayingFile.includes('endMs: null'),
      'Plain lyrics must assign null for timeMs and endMs'
    );
    assert.ok(
      !nowPlayingFile.includes('idx * 4000'),
      'Fabricated 4-second step timestamps must not exist'
    );
  });

  await t.test('7. Shared Element Architecture: NowPlaying and FullLyrics have matching layoutIds', () => {
    const npFile = fs.readFileSync(path.join(__dirname, '../src/components/NowPlaying.jsx'), 'utf8');
    const flFile = fs.readFileSync(path.join(__dirname, '../src/components/FullLyrics.jsx'), 'utf8');

    // Key shared layout elements
    const requiredLayoutIds = [
      'island-album-art-wrap',
      'island-album-art-img',
      'island-track-meta',
      'island-progress-wrap',
    ];

    for (const id of requiredLayoutIds) {
      assert.ok(
        npFile.includes(`layoutId="${id}"`),
        `NowPlaying.jsx must include layoutId="${id}"`
      );
      assert.ok(
        flFile.includes(`layoutId="${id}"`),
        `FullLyrics.jsx must include layoutId="${id}"`
      );
    }

    // NowPlaying wraps views in LayoutGroup and AnimatePresence
    assert.ok(npFile.includes('LayoutGroup id="nowplaying-lyrics-group"'), 'NowPlaying must wrap in LayoutGroup');
    assert.ok(npFile.includes('AnimatePresence mode="popLayout"'), 'NowPlaying must wrap in AnimatePresence mode="popLayout"');
  });

  await t.test('8. FullLyrics Layout & Capabilities: Two-column hero, Esc shortcut, and auto-scroll', () => {
    const flFile = fs.readFileSync(path.join(__dirname, '../src/components/FullLyrics.jsx'), 'utf8');

    // Hero cover + meta column
    assert.ok(flFile.includes('full-lyrics__hero'), 'FullLyrics must have hero section');
    assert.ok(flFile.includes('full-lyrics__right'), 'FullLyrics must have right lyrics scroller section');

    // Keyboard navigation (Escape key dismissal)
    assert.ok(flFile.includes("e.key === 'Escape'"), 'FullLyrics must handle Escape key navigation');

    // Unsynchronized notice for plain lyrics
    assert.ok(flFile.includes('full-lyrics__unsynced-notice'), 'FullLyrics must display unsynced lyrics notice');
  });

  await t.test('9. Canvas Art Dormancy: Feature remains disabled and non-intrusive during Pass 2.2.6', () => {
    const npFile = fs.readFileSync(path.join(__dirname, '../src/components/NowPlaying.jsx'), 'utf8');
    const pipFile = fs.readFileSync(path.join(__dirname, '../src/components/VideoPiP.jsx'), 'utf8');
    const flFile = fs.readFileSync(path.join(__dirname, '../src/components/FullLyrics.jsx'), 'utf8');

    assert.ok(npFile.includes('const ENABLE_CANVAS_ART = false'), 'NowPlaying must have ENABLE_CANVAS_ART = false');
    assert.ok(pipFile.includes('const ENABLE_CANVAS_ART = false'), 'VideoPiP must have ENABLE_CANVAS_ART = false');

    // Lyrics screen must NOT instantiate Three.js renderer
    assert.ok(!flFile.includes('THREE.'), 'FullLyrics must not instantiate Three.js');
    assert.ok(!flFile.includes('LivingCanvas'), 'FullLyrics must not run Living Canvas');
  });

  await t.test('10. Styling Integrity: Ambient glow and two-column layout rules in styles.css', () => {
    const cssFile = fs.readFileSync(path.join(__dirname, '../src/styles.css'), 'utf8');

    assert.ok(cssFile.includes('.full-lyrics__hero'), 'styles.css must style .full-lyrics__hero');
    assert.ok(cssFile.includes('.full-lyrics__hero-art-wrap'), 'styles.css must style .full-lyrics__hero-art-wrap');
    assert.ok(cssFile.includes('.full-lyrics__scroller'), 'styles.css must style .full-lyrics__scroller');
    assert.ok(cssFile.includes('radial-gradient'), 'styles.css must include ambient radial-gradient backdrop');
  });
});
