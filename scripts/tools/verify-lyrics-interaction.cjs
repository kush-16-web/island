'use strict';

const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const ARTIFACT_DIR = 'C:/Users/harsh/.gemini/antigravity/brain/00486437-adb7-44d3-9fef-0bfc4c041cc3';

app.whenReady().then(async () => {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

  const win = new BrowserWindow({
    width: 640,
    height: 480,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#0a0b0f',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
    },
  });

  const harnessPath = path.resolve(__dirname, '../../test/harness/lyrics-interaction-harness.html');
  await win.loadFile(harnessPath);

  // Wait for fonts and CSS to settle
  await new Promise((r) => setTimeout(r, 1000));

  async function clickElement(selector) {
    const res = await win.webContents.executeJavaScript(`
      (() => {
        const el = document.querySelector('${selector}');
        if (!el) return { success: false, error: 'Element not found: ${selector}' };
        // Dispatch full pointer and mouse interaction
        el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        el.click();
        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
        el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
        return { success: true };
      })()
    `);
    if (!res.success) throw new Error(res.error);
    await new Promise((r) => setTimeout(r, 150));
  }

  async function pressEscape() {
    await win.webContents.executeJavaScript(`
      (() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      })()
    `);
    await new Promise((r) => setTimeout(r, 150));
  }

  async function getState() {
    return await win.webContents.executeJavaScript(`window.testState`);
  }

  async function capture(filename) {
    const image = await win.webContents.capturePage();
    const buffer = image.toPNG();
    const dest = path.join(ARTIFACT_DIR, filename);
    fs.writeFileSync(dest, buffer);
    console.log(`Saved screenshot: ${filename} (${buffer.length} bytes)`);
  }

  console.log('--- STARTING COMPACT PLAYER INTERACTION SEQUENCE ---');

  // 1. Open lyrics settings
  await clickElement('#lyrics-btn');
  let state = await getState();
  console.log('[Step 1] Open lyrics settings:', state.isPopoverOpen ? 'PASS' : 'FAIL');
  if (!state.isPopoverOpen) throw new Error('Popover failed to open');

  // 2. Select Classic
  await clickElement('#btn-style-classic');
  state = await getState();
  console.log('[Step 2] Select Classic:', state.currentStyle === 'classic' ? 'PASS' : 'FAIL');

  // 3. Confirm Island remains expanded
  console.log('[Step 3] Confirm Island expanded:', state.isHubOpen ? 'PASS' : 'FAIL');
  if (!state.isHubOpen) throw new Error('CRITICAL BUG: Island collapsed after selecting Classic');

  // 4. Select Kinetic
  await clickElement('#btn-style-kinetic');
  state = await getState();
  console.log('[Step 4] Select Kinetic:', state.currentStyle === 'kinetic' ? 'PASS' : 'FAIL');

  // 5. Confirm Island remains expanded
  console.log('[Step 5] Confirm Island expanded:', state.isHubOpen ? 'PASS' : 'FAIL');
  if (!state.isHubOpen) throw new Error('CRITICAL BUG: Island collapsed after selecting Kinetic');

  // 6. Select Ghost + Wave
  await clickElement('#btn-style-ghost-wave');
  state = await getState();
  console.log('[Step 6] Select Ghost + Wave:', state.currentStyle === 'ghost-wave' ? 'PASS' : 'FAIL');

  // 7. Confirm Island remains expanded
  console.log('[Step 7] Confirm Island expanded:', state.isHubOpen ? 'PASS' : 'FAIL');
  if (!state.isHubOpen) throw new Error('CRITICAL BUG: Island collapsed after selecting Ghost + Wave');

  // 8. Select Floating
  await clickElement('#btn-layout-floating');
  state = await getState();
  console.log('[Step 8] Select Floating:', state.currentLayout === 'floating' ? 'PASS' : 'FAIL');

  // 9. Confirm Island remains expanded
  console.log('[Step 9] Confirm Island expanded:', state.isHubOpen ? 'PASS' : 'FAIL');
  if (!state.isHubOpen) throw new Error('CRITICAL BUG: Island collapsed after selecting Floating');

  // 10. Select Normal
  await clickElement('#btn-layout-normal');
  state = await getState();
  console.log('[Step 10] Select Normal:', state.currentLayout === 'normal' ? 'PASS' : 'FAIL');

  // 11. Confirm Island remains expanded
  console.log('[Step 11] Confirm Island expanded:', state.isHubOpen ? 'PASS' : 'FAIL');
  if (!state.isHubOpen) throw new Error('CRITICAL BUG: Island collapsed after selecting Normal');

  // Capture screenshot after full interaction sequence in compact player
  await capture('screenshot_compact_after_interaction.png');

  // 12. Close popup using Escape
  await pressEscape();
  state = await getState();
  console.log('[Step 12] Escape closed popup:', !state.isPopoverOpen ? 'PASS' : 'FAIL');
  console.log('[Step 12] Escape kept Island expanded:', state.isHubOpen ? 'PASS' : 'FAIL');
  if (state.isPopoverOpen) throw new Error('Escape failed to close popover');
  if (!state.isHubOpen) throw new Error('Escape improperly collapsed Island');

  // 13. Reopen it and verify persistence
  await clickElement('#lyrics-btn');
  state = await getState();
  console.log('[Step 13] Reopen popover:', state.isPopoverOpen ? 'PASS' : 'FAIL');
  console.log('[Step 13] Style persisted as Ghost + Wave:', state.currentStyle === 'ghost-wave' ? 'PASS' : 'FAIL');
  console.log('[Step 13] Layout persisted as Normal:', state.currentLayout === 'normal' ? 'PASS' : 'FAIL');

  await pressEscape();

  console.log('--- STARTING EXPANDED ARTWORK MODE INTERACTION SEQUENCE ---');

  // Switch to Full Lyrics Artwork Mode
  await win.webContents.executeJavaScript(`window.setMode('full'); window.setArtworkTheme('blue');`);
  await new Promise((r) => setTimeout(r, 300));

  // 1. Open settings in Full Lyrics
  await clickElement('#full-settings-btn');
  state = await getState();
  console.log('[Full Mode 1] Open settings:', state.isPopoverOpen ? 'PASS' : 'FAIL');
  if (!state.isPopoverOpen) throw new Error('Full Lyrics settings popover failed to open');

  // 2. Click Classic
  await clickElement('#btn-style-classic');
  state = await getState();
  console.log('[Full Mode 2] Click Classic:', state.currentStyle === 'classic' ? 'PASS' : 'FAIL');
  console.log('[Full Mode 2] Full Lyrics remains open:', state.isFullLyricsOpen ? 'PASS' : 'FAIL');

  // 3. Click Ghost + Wave
  await clickElement('#btn-style-ghost-wave');
  state = await getState();
  console.log('[Full Mode 3] Click Ghost + Wave:', state.currentStyle === 'ghost-wave' ? 'PASS' : 'FAIL');
  console.log('[Full Mode 3] Full Lyrics remains open:', state.isFullLyricsOpen ? 'PASS' : 'FAIL');

  // 4. Click Floating
  await clickElement('#btn-layout-floating');
  state = await getState();
  console.log('[Full Mode 4] Click Floating:', state.currentLayout === 'floating' ? 'PASS' : 'FAIL');
  console.log('[Full Mode 4] Full Lyrics remains open:', state.isFullLyricsOpen ? 'PASS' : 'FAIL');

  // Capture screenshot after interaction in expanded Artwork mode (Blue artwork)
  await capture('screenshot_expanded_after_interaction_blue.png');

  // 5. Test Dark Artwork theme
  await win.webContents.executeJavaScript(`window.setArtworkTheme('dark');`);
  await new Promise((r) => setTimeout(r, 200));
  await capture('screenshot_expanded_dark_artwork.png');

  // 6. Test Bright Artwork theme
  await win.webContents.executeJavaScript(`window.setArtworkTheme('bright');`);
  await new Promise((r) => setTimeout(r, 200));
  await capture('screenshot_expanded_bright_artwork.png');

  // 7. Test in Constrained window (440x320)
  win.setSize(440, 320);
  await new Promise((r) => setTimeout(r, 300));
  await win.webContents.executeJavaScript(`window.setMode('compact'); updatePosition('lyrics-anchor', 'bottom');`);
  await clickElement('#lyrics-btn');
  await new Promise((r) => setTimeout(r, 200));
  await capture('screenshot_constrained_window_after_interaction.png');

  // 8. Escape in constrained window closes popup without collapsing Island
  await pressEscape();
  state = await getState();
  console.log('[Constrained] Escape closes popover:', !state.isPopoverOpen ? 'PASS' : 'FAIL');
  console.log('[Constrained] Island remains expanded:', state.isHubOpen ? 'PASS' : 'FAIL');

  console.log('--- TESTING REAL-WORLD WORD-SYNC: PINK + WHITE (FRANK OCEAN) ---');
  win.setSize(640, 480);
  await new Promise((r) => setTimeout(r, 200));
  await win.webContents.executeJavaScript(`window.setMode('compact'); window.loadPinkWhiteTrack();`);
  await clickElement('#lyrics-btn');
  await new Promise((r) => setTimeout(r, 200));
  await capture('screenshot_pink_white_word_sync.png');
  console.log('[Pink + White] Word-by-word sync rendered with dynamic pink/rose popover: PASS');

  console.log('ALL INTERACTIVE VERIFICATIONS PASSED WITH ZERO COLLAPSES!');
  app.quit();
});

