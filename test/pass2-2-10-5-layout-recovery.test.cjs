'use strict';

/**
 * test/pass2-2-10-5-layout-recovery.test.cjs
 * Comprehensive Real Electron Validation for Pass 2.2.10.5:
 * Player Layout Restoration, Window Lifecycle & Compact UI Recovery.
 */

const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');

const ARTIFACT_DIR = 'C:/Users/harsh/.gemini/antigravity-ide/brain/6b7fbad8-f30d-40fe-b5d1-48e89f0091f3';

app.whenReady().then(async () => {
  console.log('TAP version 13');
  console.log('# Pass 2.2.10.5: Player Layout Restoration & Compact UI Recovery Validation');

  let testIndex = 0;
  const pass = (name) => {
    testIndex++;
    console.log(`ok ${testIndex} - ${name}`);
  };
  const fail = (name, err) => {
    testIndex++;
    console.log(`not ok ${testIndex} - ${name}`);
    console.error(err);
    app.exit(1);
  };

  const win = new BrowserWindow({
    width: 720,
    height: 500,
    show: false,
    frame: false,
    transparent: true,
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

  const distPath = path.resolve(__dirname, '../dist/index.html');
  await win.loadFile(distPath);
  win.showInactive();
  await new Promise((r) => setTimeout(r, 1200));

  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

  async function capture(filename) {
    const image = await win.webContents.capturePage();
    const buffer = image.toPNG();
    const dest = path.join(ARTIFACT_DIR, filename);
    fs.writeFileSync(dest, buffer);
    console.log(`Saved screenshot: ${filename} (${buffer.length} bytes)`);
  }

  // Helper to get element measurements
  async function getMetrics() {
    return await win.webContents.executeJavaScript(`
      (() => {
        const island = document.querySelector('.island');
        const np = document.querySelector('.np');
        const fl = document.querySelector('.full-lyrics');
        const hubHead = document.querySelector('.hub__head');
        const cover = document.querySelector('.np__cover-wrap');
        const coverImg = document.querySelector('.np__cover-img');
        const meta = document.querySelector('.np__meta');
        const flArt = document.querySelector('.full-lyrics__hero-art-wrap');
        const iRect = island ? island.getBoundingClientRect() : null;
        const npRect = np ? np.getBoundingClientRect() : null;
        const flRect = fl ? fl.getBoundingClientRect() : null;
        const cRect = cover ? cover.getBoundingClientRect() : null;
        const ciRect = coverImg ? coverImg.getBoundingClientRect() : null;
        const mRect = meta ? meta.getBoundingClientRect() : null;
        const faRect = flArt ? flArt.getBoundingClientRect() : null;
        const activeTab = document.querySelector('.seg__btn.is-active')?.textContent?.trim();
        return {
          mode: island ? island.getAttribute('data-mode') : null,
          tab: activeTab,
          hasFullLyrics: Boolean(fl),
          hasNp: Boolean(np),
          hasHubHead: Boolean(hubHead),
          island: iRect ? { w: Math.round(iRect.width), h: Math.round(iRect.height) } : null,
          np: npRect ? { w: Math.round(npRect.width), h: Math.round(npRect.height) } : null,
          fl: flRect ? { w: Math.round(flRect.width), h: Math.round(flRect.height) } : null,
          cover: cRect ? { w: Math.round(cRect.width), h: Math.round(cRect.height), x: Math.round(cRect.x), y: Math.round(cRect.y) } : null,
          coverImg: ciRect ? { w: Math.round(ciRect.width), h: Math.round(ciRect.height) } : null,
          meta: mRect ? { w: Math.round(mRect.width), h: Math.round(mRect.height) } : null,
          flArt: faRect ? { w: Math.round(faRect.width), h: Math.round(faRect.height) } : null,
          coverOpacity: cover ? window.getComputedStyle(cover).opacity : null,
        };
      })()
    `);
  }

  async function openHubDirect(tab = 'playing') {
    await win.webContents.executeJavaScript(`{
      const island = document.querySelector('.island');
      if (island) {
        island.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, screenX: 100, screenY: 100 }));
        window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, screenX: 100, screenY: 100 }));
      }
    }`);
    await new Promise((r) => setTimeout(r, 600));
  }

  async function openFullLyrics() {
    await win.webContents.executeJavaScript(`{
      const miniLyrics = document.querySelector('.mini-lyrics') || document.querySelector('.mini-lyrics__status');
      if (miniLyrics) miniLyrics.click();
    }`);
    await new Promise((r) => setTimeout(r, 1000));
  }

  async function closeFullLyricsExplicit() {
    await win.webContents.executeJavaScript(`{
      const closeBtn = document.querySelector('.full-lyrics__close-btn');
      if (closeBtn) closeBtn.click();
    }`);
    await new Promise((r) => setTimeout(r, 1200));
  }

  async function dismissHubOutside() {
    await win.webContents.executeJavaScript(`{
      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
    }`);
    await new Promise((r) => setTimeout(r, 600));
  }

  try {
    // Start media playback via devbar
    await win.webContents.executeJavaScript(`{
      const musicBtn = Array.from(document.querySelectorAll('.devbar button')).find(b => b.textContent.includes('Music'));
      if (musicBtn) musicBtn.click();
    }`);
    await new Promise((r) => setTimeout(r, 500));

    // TEST 1: Baseline Compact Player Geometry
    await openHubDirect('playing');
    const m1 = await getMetrics();
    assert.equal(m1.hasNp, true, 'Default Playing screen must mount NowPlaying');
    assert.equal(m1.island.w, 468, 'Default Playing screen width must be 468px');
    assert.equal(m1.island.h, 276, 'Default Playing screen height must be 276px');
    assert.equal(m1.np.w, 440, 'NowPlaying container width must be 440px');
    assert.equal(m1.np.h, 206, 'NowPlaying container height must be 206px');
    assert.equal(m1.cover.w, 64, 'Compact artwork width must be 64px');
    assert.equal(m1.cover.h, 64, 'Compact artwork height must be 64px');
    assert.equal(m1.coverOpacity, '1', 'Compact artwork must be fully visible');
    await capture('pass2-2-10-5_01_baseline_compact.png');
    pass('Test 1: Default Playing screen baseline geometry matches 468x276 layout');

    // TEST 2: Playing -> Full Lyrics Transition
    await openFullLyrics();
    const m2 = await getMetrics();
    console.log('M2 METRICS:', JSON.stringify(m2, null, 2));
    assert.equal(m2.hasFullLyrics, true, 'Full Lyrics view must be mounted');
    assert.equal(m2.island.w, 468, 'Full Lyrics width must be 468px');
    assert.equal(m2.island.h, 390, 'Full Lyrics height must be 390px');
    assert.ok(m2.flArt.w >= 126, 'Full Lyrics artwork must be centered and expanded (>= 126px)');
    await capture('pass2-2-10-5_02_full_lyrics_active.png');
    pass('Test 2: Full Lyrics transition expands window to 390px with full stage');

    // TEST 3: Full Lyrics -> Explicit Close -> Playing
    await closeFullLyricsExplicit();
    const m3 = await getMetrics();
    console.log('M3 METRICS:', JSON.stringify(m3, null, 2));
    assert.equal(m3.hasFullLyrics, false, 'Full Lyrics must be unmounted');
    assert.equal(m3.hasNp, true, 'NowPlaying must be mounted');
    assert.equal(m3.island.h, 276, 'Window height must restore cleanly to 276px');
    assert.equal(m3.np.h, 206, 'NowPlaying content height must restore to 206px');
    assert.equal(m3.cover.w, 64, 'Artwork must return to 64px compact thumbnail');
    assert.equal(m3.cover.h, 64, 'Artwork height must return to 64px');
    assert.equal(m3.coverOpacity, '1', 'Artwork opacity must remain 1');
    pass('Test 3: Explicit close from Full Lyrics restores 276px compact geometry');

    // TEST 4: Scenario A — Full Lyrics -> Hide / Dismiss -> Reopen
    await openFullLyrics();
    assert.equal((await getMetrics()).hasFullLyrics, true);
    await dismissHubOutside();
    const m4Dismissed = await getMetrics();
    assert.equal(m4Dismissed.mode, 'media', 'Collapsed Island must return to compact media pill mode');
    assert.equal(m4Dismissed.island.h, 40, 'Compact media pill height must be 40px');

    // Reopen Island
    await openHubDirect('playing');
    const m4Reopened = await getMetrics();
    assert.equal(m4Reopened.hasFullLyrics, false, 'Reopened Island must display default Playing screen');
    assert.equal(m4Reopened.hasNp, true, 'Default Playing screen must mount NowPlaying');
    assert.equal(m4Reopened.hasHubHead, true, 'Hub header navigation must be visible');
    assert.equal(m4Reopened.island.w, 468, 'Reopened Island width must be 468px');
    assert.equal(m4Reopened.island.h, 276, 'Reopened Island height MUST be 276px (NOT 390px corrupted height)');
    assert.equal(m4Reopened.np.h, 206, 'NowPlaying content height must be exactly 206px');
    assert.equal(m4Reopened.cover.w, 64, 'Artwork width must be 64px');
    assert.equal(m4Reopened.cover.h, 64, 'Artwork height must be 64px');
    assert.equal(m4Reopened.cover.y, m1.cover.y, 'Artwork vertical position must match baseline (not shifted down into empty void)');
    assert.equal(m4Reopened.coverOpacity, '1', 'Artwork must remain fully visible');
    await capture('pass2-2-10-5_03_reopened_recovered_compact.png');
    pass('Test 4: Reopening from dismissed Full Lyrics cleanly recovers 276px compact player geometry (BUG FIX VERIFIED)');

    // TEST 5: Scenario B — Full Lyrics -> Relaunch Simulation (Unmount & Remount Fresh)
    await openFullLyrics();
    await dismissHubOutside();
    // Simulate fresh openHub invocation as occurs from Tray or OS Launch
    await win.webContents.executeJavaScript(`{
      window.dispatchEvent(new CustomEvent('island:navigate', { detail: { tab: 'playing', openHub: true } }));
    }`);
    await new Promise((r) => setTimeout(r, 900));
    const m5 = await getMetrics();
    assert.equal(m5.island.h, 276, 'Startup / reopen navigation must establish 276px bounds');
    assert.equal(m5.np.h, 206, 'Content height must be 206px');
    assert.equal(m5.cover.w, 64);
    assert.equal(m5.cover.h, 64);
    pass('Test 5: Startup / reopen navigation establishes correct 276px bounds');

    // TEST 6: Rapid Repeated View Switching
    for (let i = 1; i <= 4; i++) {
      await openFullLyrics();
      await new Promise((r) => setTimeout(r, 150));
      await closeFullLyricsExplicit();
      await new Promise((r) => setTimeout(r, 150));
    }
    const m6 = await getMetrics();
    assert.equal(m6.island.h, 276, 'After rapid switching, height must remain stable at 276px');
    assert.equal(m6.cover.w, 64, 'Cover width must remain 64px without drift');
    assert.equal(m6.coverOpacity, '1');
    pass('Test 6: Rapid view switching does not drift or corrupt geometry');

    // TEST 7: Reopening While Paused
    await openFullLyrics();
    // Pause inside Full Lyrics
    await win.webContents.executeJavaScript(`{
      const playPauseBtn = document.querySelector('.full-lyrics__play-btn');
      if (playPauseBtn) playPauseBtn.click();
    }`);
    await new Promise((r) => setTimeout(r, 400));
    // Dismiss while paused
    await dismissHubOutside();
    // Reopen while paused
    await openHubDirect('playing');
    const m7 = await getMetrics();
    assert.equal(m7.island.h, 276, 'Reopening while paused must maintain 276px bounds');
    assert.equal(m7.cover.w, 64, 'Artwork must be 64px');
    assert.equal(m7.coverOpacity, '1', 'Artwork must remain visible');
    pass('Test 7: Reopening while paused renders correct 276px compact player');

    // Resume playback
    await win.webContents.executeJavaScript(`{
      const playBtn = document.querySelector('.np__controls button.play-btn');
      if (playBtn) playBtn.click();
    }`);
    await new Promise((r) => setTimeout(r, 400));

    // TEST 8: Reopening After Track Change in Full Lyrics
    await openFullLyrics();
    await win.webContents.executeJavaScript(`{
      const nextBtn = document.querySelector('.full-lyrics button[title="Next"]');
      if (nextBtn) nextBtn.click();
    }`);
    await new Promise((r) => setTimeout(r, 600));
    await dismissHubOutside();
    await openHubDirect('playing');
    const m8 = await getMetrics();
    console.log('M8 METRICS:', JSON.stringify(m8, null, 2));
    assert.equal(m8.island.h, 276, 'Reopening after track change maintains 276px compact player');
    assert.equal(m8.cover.w, 64);
    assert.equal(m8.coverOpacity, '1');
    pass('Test 8: Reopening after track change preserves compact geometry and artwork');

    // TEST 9: Full Lyrics Re-entry After Recovery
    await openFullLyrics();
    const m9 = await getMetrics();
    assert.equal(m9.hasFullLyrics, true, 'Full Lyrics must reopen successfully');
    assert.equal(m9.island.h, 390, 'Full Lyrics height expands cleanly to 390px');
    assert.ok(m9.flArt.w >= 126, 'Artwork is centered and expanded');
    await capture('pass2-2-10-5_04_full_lyrics_reentered.png');
    pass('Test 9: Full Lyrics can be re-entered with correct 390px stage geometry');

    console.log('# All 9 Pass 2.2.10.5 layout recovery tests passed cleanly with 0 regressions');
    app.quit();
  } catch (err) {
    fail('Layout recovery test failed', err);
  }
});
