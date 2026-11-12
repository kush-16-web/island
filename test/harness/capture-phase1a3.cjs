const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const ARTIFACT_DIR = path.resolve('C:/Users/harsh/.gemini/antigravity/brain/00486437-adb7-44d3-9fef-0bfc4c041cc3');
const DIST_HTML = path.resolve(__dirname, '../../dist/index.html');
const PRELOAD = path.resolve(__dirname, '../../electron/preload.js');

// Register mock IPC handlers
let appearanceMode = 'dynamic_frosted';
let petVisible = false;

ipcMain.handle('window:is-maximized', () => false);
ipcMain.handle('settings:get-appearance-mode', () => appearanceMode);
ipcMain.on('settings:set-appearance-mode', (e, mode) => {
  appearanceMode = mode;
});
ipcMain.handle('pet:get-visible', () => petVisible);
ipcMain.on('pet:set-visible', (e, vis) => {
  petVisible = vis;
});
ipcMain.handle('state:get', () => ({ media: { active: false } }));

app.whenReady().then(async () => {
  console.log('[Capture Harness] Starting Electron Phase 1A.3 Visual Verification...');

  // 1. AI Workspace Window (440x560)
  const aiWin = new BrowserWindow({
    width: 440,
    height: 560,
    minWidth: 400,
    minHeight: 480,
    frame: false,
    transparent: false,
    backgroundColor: '#00000000',
    backgroundMaterial: 'acrylic',
    show: false,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const aiUrl = `file://${DIST_HTML}#workspace`;
  await aiWin.loadURL(aiUrl);
  aiWin.show();
  await new Promise((r) => setTimeout(r, 600));

  // Capture 1: AI Idle
  const imgIdle = await aiWin.capturePage();
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'phase1a3_ai_idle.png'), imgIdle.toPNG());
  console.log('[Capture Harness] Saved: phase1a3_ai_idle.png');

  // Capture 2: AI Composer Focused
  await aiWin.webContents.executeJavaScript(`
    (() => {
      const el = document.querySelector('.workspace-composer__input');
      if (el) {
        el.focus();
        return true;
      }
      return false;
    })()
  `);
  await new Promise((r) => setTimeout(r, 300));
  const imgFocused = await aiWin.capturePage();
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'phase1a3_ai_composer_focused.png'), imgFocused.toPNG());
  console.log('[Capture Harness] Saved: phase1a3_ai_composer_focused.png');

  // Capture 3: AI Send Active (Text typed with React synthetic dispatch)
  await aiWin.webContents.executeJavaScript(`
    (() => {
      const el = document.querySelector('.workspace-composer__input');
      if (el) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        setter.call(el, 'Play my evening focus playlist');
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      }
      return false;
    })()
  `);
  await new Promise((r) => setTimeout(r, 300));
  const imgSendActive = await aiWin.capturePage();
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'phase1a3_ai_send_active.png'), imgSendActive.toPNG());
  console.log('[Capture Harness] Saved: phase1a3_ai_send_active.png');

  // Capture 3b: AI Send Hovered
  const sendRect = await aiWin.webContents.executeJavaScript(`
    (() => {
      const btn = document.querySelector('.workspace-composer__send-btn');
      if (btn) {
        const r = btn.getBoundingClientRect();
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
      }
      return null;
    })()
  `);
  if (sendRect) {
    aiWin.webContents.sendInputEvent({ type: 'mouseMove', x: sendRect.x, y: sendRect.y });
    await new Promise((r) => setTimeout(r, 200));
  }
  const imgSendHover = await aiWin.capturePage();
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'phase1a3_ai_send_hovered.png'), imgSendHover.toPNG());
  console.log('[Capture Harness] Saved: phase1a3_ai_send_hovered.png');

  // Capture 4: AI Dynamic Frosted with Track Playing (Muted Warm Amber Album Art)
  await aiWin.webContents.executeJavaScript(`
    (() => {
      const root = document.querySelector('.workspace-layout');
      if (root) {
        root.style.setProperty('--qg-accent', '#f59e0b');
        const gem = document.querySelector('.workspace-gem-dot');
        if (gem) gem.classList.add('is-dynamic');
        const tag = document.querySelector('.qg-titlebar__tag');
        if (tag) tag.textContent = 'Dynamic';
      }
    })()
  `);
  await new Promise((r) => setTimeout(r, 300));
  const imgDynamicMusic = await aiWin.capturePage();
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'phase1a3_ai_dynamic_music.png'), imgDynamicMusic.toPNG());
  console.log('[Capture Harness] Saved: phase1a3_ai_dynamic_music.png');

  aiWin.close();

  // 2. Settings Window (540x520)
  const settingsWin = new BrowserWindow({
    width: 540,
    height: 520,
    minWidth: 500,
    minHeight: 460,
    frame: false,
    transparent: false,
    backgroundColor: '#00000000',
    backgroundMaterial: 'acrylic',
    show: false,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const settingsUrl = `file://${DIST_HTML}#settings`;
  await settingsWin.loadURL(settingsUrl);
  settingsWin.show();
  await new Promise((r) => setTimeout(r, 600));

  // Capture 5: Settings Catalog View
  const imgCatalog = await settingsWin.capturePage();
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'phase1a3_settings_catalog.png'), imgCatalog.toPNG());
  console.log('[Capture Harness] Saved: phase1a3_settings_catalog.png');

  // Capture 6: Settings Appearance Detail (Dynamic Frosted)
  await settingsWin.webContents.executeJavaScript(`
    (() => {
      const items = Array.from(document.querySelectorAll('.settings-catalog__item'));
      const appItem = items.find(i => i.textContent.includes('Appearance'));
      if (appItem) {
        appItem.click();
        return true;
      }
      return false;
    })()
  `);
  await new Promise((r) => setTimeout(r, 400));
  const imgAppDynamic = await settingsWin.capturePage();
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'phase1a3_settings_appearance_dynamic.png'), imgAppDynamic.toPNG());
  console.log('[Capture Harness] Saved: phase1a3_settings_appearance_dynamic.png');

  // Capture 7: Settings Appearance Detail (Dark Frosted)
  await settingsWin.webContents.executeJavaScript(`
    (() => {
      const rows = Array.from(document.querySelectorAll('.settings-select-row'));
      const darkRow = rows.find(r => r.textContent.includes('Dark Frosted'));
      if (darkRow) {
        darkRow.click();
        return true;
      }
      return false;
    })()
  `);
  await new Promise((r) => setTimeout(r, 400));
  const imgAppDark = await settingsWin.capturePage();
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'phase1a3_settings_appearance_dark.png'), imgAppDark.toPNG());
  console.log('[Capture Harness] Saved: phase1a3_settings_appearance_dark.png');

  settingsWin.close();

  console.log('[Capture Harness] All verification screenshots captured cleanly!');
  app.quit();
});
