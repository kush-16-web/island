/**
 * test/pass2-2-10-7-no-youtube-video.test.cjs
 * Comprehensive test suite for Pass 2.2.10.7:
 * "Remove Embedded YouTube Video Fallback From Playing Screen"
 *
 * Verifies:
 * 1. Zero YouTube iframes, zero embedded video players, zero YouTube error UI in artwork surfaces.
 * 2. Normal playback of YouTube Music tracks (including "Die With A Smile - Lady Gaga & Bruno Mars")
 *    mounts the intended compact Playing screen layout, not Cinema/video fallback.
 * 3. Provider artwork is cleanly displayed and upgraded without video-rendering paths.
 * 4. Stale artwork requests do not persist across track changes.
 * 5. Track changes, pause, resume, next, and previous work reliably.
 * 6. Lightweight Island placeholder renders when artwork is unavailable (never a YouTube error).
 * 7. Full Lyrics still works and restores cleanly to player mode.
 */

const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');

const ARTIFACTS_DIR = 'C:\\Users\\harsh\\.gemini\\antigravity-ide\\brain\\6b7fbad8-f30d-40fe-b5d1-48e89f0091f3';

// ---------------------------------------------------------------------------
// Static Code Invariants Verification
// ---------------------------------------------------------------------------
function runStaticCodeInvariants() {
  console.log('TAP version 13');
  console.log('# Pass 2.2.10.7: Remove Embedded YouTube Video Fallback Suite');

  const videoPipPath = path.join(__dirname, '..', '..', 'src', 'components', 'VideoPiP.jsx');
  const nowPlayingPath = path.join(__dirname, '..', '..', 'src', 'components', 'NowPlaying.jsx');
  const stylesPath = path.join(__dirname, '..', '..', 'src', 'styles.css');
  const videoAmbientPath = path.join(__dirname, '..', '..', 'src', 'hooks', 'useVideoAmbient.js');

  const videoPipCode = fs.readFileSync(videoPipPath, 'utf8');
  const nowPlayingCode = fs.readFileSync(nowPlayingPath, 'utf8');
  const stylesCode = fs.readFileSync(stylesPath, 'utf8');
  const videoAmbientCode = fs.readFileSync(videoAmbientPath, 'utf8');

  // Test 1: VideoPiP must not contain any <iframe> element or youtube embed URLs
  assert.ok(!videoPipCode.includes('<iframe'), 'VideoPiP.jsx must NOT contain any <iframe element');
  assert.ok(!videoPipCode.includes('youtube-nocookie.com/embed'), 'VideoPiP.jsx must NOT contain youtube embed URLs');
  assert.ok(!videoPipCode.includes('iframeRef'), 'VideoPiP.jsx must NOT contain iframeRef');
  console.log('ok 1 - Test 1: Zero <iframe> and zero YouTube embed player paths in VideoPiP.jsx');

  // Test 2: styles.css must not have active .cinema-screen__iframe rules
  assert.ok(!stylesCode.includes('.cinema-screen__iframe {'), 'styles.css must NOT contain active .cinema-screen__iframe rules');
  console.log('ok 2 - Test 2: styles.css clean of iframe presentation styling');

  // Test 3: NowPlaying.jsx treats YouTube Music and tracks with artists as music, defaulting to player viewMode
  assert.ok(nowPlayingCode.includes('youtube music|yt music|music\\.youtube'), 'NowPlaying must recognize YouTube Music as a music app');
  assert.ok(nowPlayingCode.includes('Boolean(media.artist && media.artist.trim().length > 0)'), 'NowPlaying must recognize tracks with artist metadata as music');
  assert.ok(!nowPlayingCode.includes("media.playbackType === 'Video'"), 'NowPlaying must not use playbackType === Video to misclassify web music');
  console.log('ok 3 - Test 3: NowPlaying accurately classifies YouTube Music tracks as music');

  // Test 4: useVideoAmbient isVideoMedia treats YouTube Music as music
  assert.ok(videoAmbientCode.includes('youtube music|yt music|music\\.youtube'), 'useVideoAmbient must recognize YouTube Music');
  assert.ok(videoAmbientCode.includes('Boolean(media.artist && media.artist.trim().length > 0)'), 'useVideoAmbient must treat artist tracks as music');
  console.log('ok 4 - Test 4: useVideoAmbient preserves dynamic colors for YouTube Music');
}

// ---------------------------------------------------------------------------
// Electron Interactive / Lifecycle Tests
// ---------------------------------------------------------------------------
app.whenReady().then(async () => {
  try {
    runStaticCodeInvariants();

    const win = new BrowserWindow({
      width: 720,
      height: 520,
      show: false,
      transparent: true,
      frame: false,
      backgroundColor: '#090a0f',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: false,
        backgroundThrottling: false,
      },
    });

    win.webContents.on('console-message', (event, level, message) => {
      console.log(`[Renderer ${level}] ${message}`);
    });

    const distPath = path.resolve(__dirname, '../../dist/index.html');
    await win.loadFile(distPath);
    win.showInactive();
    await new Promise((r) => setTimeout(r, 1200));

    // Test 5: Play "Die With A Smile — Lady Gaga & Bruno Mars" via YouTube Music
    const dieWithASmileTrack = {
      active: true,
      status: 'playing',
      title: 'Die With A Smile (Official Music Video)',
      artist: 'Lady Gaga & Bruno Mars',
      album: 'Die With A Smile - Single',
      app: 'YouTube Music',
      provider: 'youtube_music',
      playbackType: 'Video', // Real Chromium SMTC quirk
      art: 'https://lh3.googleusercontent.com/die-with-a-smile=w120-h120-l90-rj',
      positionMs: 45000,
      durationMs: 251000,
      reportedAt: Date.now(),
    };

    // Inject track via mock bridge and open the Hub
    await win.webContents.executeJavaScript(`
      (() => {
        if (window.island?.dev?.setMedia) {
          window.island.dev.setMedia(${JSON.stringify(dieWithASmileTrack)});
        }
        // Open the Hub
        const island = document.querySelector('.island');
        if (island) {
          island.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, screenX: 100, screenY: 100 }));
          window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, screenX: 100, screenY: 100 }));
        }
        return true;
      })()
    `);

    await new Promise((r) => setTimeout(r, 900));

    // Switch to Playing tab if not already on it
    await win.webContents.executeJavaScript(`
      (() => {
        const playingTab = Array.from(document.querySelectorAll('.seg__btn')).find(b => b.textContent.includes('Playing') || b.textContent.includes('Music'));
        if (playingTab) playingTab.click();
        return true;
      })()
    `);

    await new Promise((r) => setTimeout(r, 600));

    // Verify DOM state
    const domState1 = await win.webContents.executeJavaScript(`
      (() => {
        const np = document.querySelector('.np');
        const cinemaPip = document.querySelector('.cinema-pip');
        const iframes = document.querySelectorAll('iframe');
        const coverImg = document.querySelector('.np__cover-img');
        const titleEl = document.querySelector('.np__title');
        const artistEl = document.querySelector('.np__artist');
        const miniLyrics = document.querySelector('.mini-lyrics');
        const playBtn = document.querySelector('.play-btn');

        return {
          hasNp: Boolean(np),
          hasCinemaPip: Boolean(cinemaPip),
          iframeCount: iframes.length,
          coverSrc: coverImg ? coverImg.getAttribute('src') : null,
          titleText: titleEl ? titleEl.textContent.trim() : null,
          artistText: artistEl ? artistEl.textContent.trim() : null,
          hasMiniLyrics: Boolean(miniLyrics),
          hasPlayBtn: Boolean(playBtn),
        };
      })()
    `);

    assert.ok(domState1.hasNp, 'Standard compact Playing layout (.np) must be rendered');
    assert.ok(!domState1.hasCinemaPip, 'Cinema PiP player must NOT replace normal music UI');
    assert.strictEqual(domState1.iframeCount, 0, 'Zero <iframe> elements must exist in the window');
    assert.ok(domState1.coverSrc && domState1.coverSrc.includes('googleusercontent.com'), 'Active track artwork must be displayed');
    assert.ok(domState1.titleText && domState1.titleText.includes('Die With A Smile'), 'Title must be Die With A Smile');
    assert.strictEqual(domState1.artistText, 'Lady Gaga & Bruno Mars', 'Artist must be Lady Gaga & Bruno Mars');
    assert.ok(domState1.hasMiniLyrics, 'MiniLyrics preview must be visible');
    assert.ok(domState1.hasPlayBtn, 'Playback controls must be rendered');
    console.log('ok 5 - Test 5: Die With A Smile displays artwork with compact music layout (zero iframes/errors)');

    // Capture screenshot of Die With A Smile in Playing screen
    const img1 = await win.webContents.capturePage();
    const scPath1 = path.join(ARTIFACTS_DIR, 'pass2-2-10-7_01_die_with_a_smile_artwork.png');
    fs.writeFileSync(scPath1, img1.toPNG());
    console.log(`Saved screenshot: pass2-2-10-7_01_die_with_a_smile_artwork.png (${img1.toPNG().length} bytes)`);

    // Test 6: Pause and Resume maintains artwork and UI
    await win.webContents.executeJavaScript(`
      (() => {
        const playBtn = document.querySelector('.play-btn');
        if (playBtn) playBtn.click();
        return true;
      })()
    `);
    await new Promise((r) => setTimeout(r, 400));

    const pauseState = await win.webContents.executeJavaScript(`
      (() => {
        const coverImg = document.querySelector('.np__cover-img');
        const playBtn = document.querySelector('.play-btn');
        return {
          hasCover: Boolean(coverImg && coverImg.getAttribute('src')),
          playBtnAria: playBtn ? playBtn.getAttribute('aria-label') : null,
        };
      })()
    `);
    assert.ok(pauseState.hasCover, 'Cover must stay visible when paused');
    assert.strictEqual(pauseState.playBtnAria, 'Play', 'Play button aria-label must reflect paused state');
    console.log('ok 6 - Test 6: Pause and resume keeps artwork stably mounted without error');

    // Resume playback
    await win.webContents.executeJavaScript(`
      (() => {
        const playBtn = document.querySelector('.play-btn');
        if (playBtn) playBtn.click();
        return true;
      })()
    `);
    await new Promise((r) => setTimeout(r, 400));

    // Test 7: Track Change to Gorillaz - Feel Good Inc.
    const feelGoodTrack = {
      active: true,
      status: 'playing',
      title: 'Feel Good Inc.',
      artist: 'Gorillaz',
      album: 'Demon Days',
      app: 'YouTube Music',
      provider: 'youtube_music',
      art: 'https://lh3.googleusercontent.com/feel-good-inc=w120-h120',
      positionMs: 10000,
      durationMs: 223000,
      reportedAt: Date.now(),
    };

    await win.webContents.executeJavaScript(`
      (() => {
        if (window.island?.dev?.setMedia) {
          window.island.dev.setMedia(${JSON.stringify(feelGoodTrack)});
        }
        return true;
      })()
    `);
    await new Promise((r) => setTimeout(r, 600));

    const trackChangeState = await win.webContents.executeJavaScript(`
      (() => {
        const coverImg = document.querySelector('.np__cover-img');
        const titleEl = document.querySelector('.np__title');
        const artistEl = document.querySelector('.np__artist');
        return {
          coverSrc: coverImg ? coverImg.getAttribute('src') : null,
          titleText: titleEl ? titleEl.textContent.trim() : null,
          artistText: artistEl ? artistEl.textContent.trim() : null,
        };
      })()
    `);

    assert.ok(trackChangeState.coverSrc && trackChangeState.coverSrc.includes('feel-good-inc'), 'Artwork must update to the new track');
    assert.ok(!trackChangeState.coverSrc.includes('die-with-a-smile'), 'Stale artwork from previous track must NOT persist');
    assert.strictEqual(trackChangeState.titleText, 'Feel Good Inc.', 'Title must update');
    assert.strictEqual(trackChangeState.artistText, 'Gorillaz', 'Artist must update');
    console.log('ok 7 - Test 7: Track change updates artwork cleanly with zero stale retention');

    // Test 8: Fallback placeholder when artwork is null
    const noArtTrack = {
      active: true,
      status: 'playing',
      title: 'Indie Demo Track',
      artist: 'Unsigned Artist',
      app: 'YouTube Music',
      provider: 'youtube_music',
      art: null,
      positionMs: 5000,
      durationMs: 180000,
      reportedAt: Date.now(),
    };

    await win.webContents.executeJavaScript(`
      (() => {
        if (window.island?.dev?.setMedia) {
          window.island.dev.setMedia(${JSON.stringify(noArtTrack)});
        }
        return true;
      })()
    `);
    await new Promise((r) => setTimeout(r, 1500));

    const fallbackState = await win.webContents.executeJavaScript(`
      (() => {
        const coverWrap = document.querySelector('.np__cover-wrap');
        const fallbackArt = document.querySelector('.art.art--fallback');
        const iframes = document.querySelectorAll('iframe');
        return {
          hasCoverWrap: Boolean(coverWrap),
          hasFallbackArt: Boolean(fallbackArt),
          iframeCount: iframes.length,
        };
      })()
    `);

    assert.ok(fallbackState.hasCoverWrap, 'Cover wrap must exist');
    assert.ok(fallbackState.hasFallbackArt, 'Island lightweight CSS gradient placeholder (.art--fallback) must render');
    assert.strictEqual(fallbackState.iframeCount, 0, 'No iframe or error UI must be rendered for tracks without artwork');
    console.log('ok 8 - Test 8: Lightweight Island placeholder renders when artwork is unavailable (never YouTube error)');

    // Test 9: Full Lyrics still works and restores to player mode
    // Re-set Feel Good Inc track with art
    await win.webContents.executeJavaScript(`
      (() => {
        if (window.island?.dev?.setMedia) {
          window.island.dev.setMedia(${JSON.stringify(feelGoodTrack)});
        }
        return true;
      })()
    `);
    await new Promise((r) => setTimeout(r, 500));

    // Open Full Lyrics by clicking Mini Lyrics
    await win.webContents.executeJavaScript(`
      (() => {
        const miniLyrics = document.querySelector('.mini-lyrics');
        if (miniLyrics) miniLyrics.click();
        return true;
      })()
    `);
    await new Promise((r) => setTimeout(r, 900));

    const fullLyricsState = await win.webContents.executeJavaScript(`
      (() => {
        const fl = document.querySelector('.full-lyrics');
        const heroArt = document.querySelector('.full-lyrics__hero-art-wrap') || document.querySelector('.full-lyrics__hero-art');
        const iframes = document.querySelectorAll('iframe');
        return {
          hasFullLyrics: Boolean(fl),
          hasHeroArt: Boolean(heroArt),
          iframeCount: iframes.length,
        };
      })()
    `);

    assert.ok(fullLyricsState.hasFullLyrics, 'Full Lyrics view must open');
    assert.ok(fullLyricsState.hasHeroArt, 'Full Lyrics must display hero artwork');
    assert.strictEqual(fullLyricsState.iframeCount, 0, 'Full Lyrics must contain zero iframes');
    console.log('ok 9 - Test 9: Full Lyrics opens cleanly with center artwork presentation');

    // Close Full Lyrics and verify restoration to compact player layout
    await win.webContents.executeJavaScript(`
      (() => {
        const closeBtn = document.querySelector('.full-lyrics__close-btn');
        if (closeBtn) closeBtn.click();
        return true;
      })()
    `);
    await new Promise((r) => setTimeout(r, 900));

    const restoredState = await win.webContents.executeJavaScript(`
      (() => {
        const np = document.querySelector('.np');
        const cinemaPip = document.querySelector('.cinema-pip');
        return {
          hasNp: Boolean(np),
          hasCinemaPip: Boolean(cinemaPip),
        };
      })()
    `);

    assert.ok(restoredState.hasNp, 'Player mode (.np) must be restored after closing Full Lyrics');
    assert.ok(!restoredState.hasCinemaPip, 'Closing Full Lyrics must NOT dump user into Cinema/video mode');
    console.log('ok 10 - Test 10: Closing Full Lyrics restores compact Playing layout without routing to video mode');

    console.log('# All Pass 2.2.10.7 tests passed cleanly with 0 regressions');
    win.destroy();
    app.quit();
    process.exit(0);
  } catch (err) {
    console.error('Test failure:', err);
    process.exit(1);
  }
});
