const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const ARTIFACT_DIR = path.resolve('C:/Users/harsh/.gemini/antigravity/brain/00486437-adb7-44d3-9fef-0bfc4c041cc3');
const DIST_HTML = path.resolve(__dirname, '../../dist/index.html');
const PRELOAD = path.resolve(__dirname, '../../electron/preload.js');

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
  console.log('[Capture Harness 1A.4] Starting Electron Visual Verification...');

  // 1. AI Workspace Window (680x520 default, borderless, Acrylic)
  const aiWin = new BrowserWindow({
    width: 680,
    height: 520,
    minWidth: 600,
    minHeight: 440,
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

  if (typeof aiWin.setAccentColor === 'function') {
    aiWin.setAccentColor(false);
  }

  const aiUrl = `file://${DIST_HTML}#workspace`;
  await aiWin.loadURL(aiUrl);
  aiWin.show();
  await new Promise((r) => setTimeout(r, 600));

  // Capture 1: AI with sidebar expanded (680x520)
  const imgExpanded = await aiWin.capturePage();
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'phase1a4_ai_sidebar_expanded.png'), imgExpanded.toPNG());
  console.log('[Capture Harness] Saved: phase1a4_ai_sidebar_expanded.png');

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
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'phase1a4_ai_composer_focused.png'), imgFocused.toPNG());
  console.log('[Capture Harness] Saved: phase1a4_ai_composer_focused.png');

  // Capture 3: AI with sidebar collapsed
  await aiWin.webContents.executeJavaScript(`
    (() => {
      const toggle = document.querySelector('.workspace-sidebar__toggle-btn');
      if (toggle) {
        toggle.click();
        return true;
      }
      return false;
    })()
  `);
  await new Promise((r) => setTimeout(r, 400));
  const imgCollapsed = await aiWin.capturePage();
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'phase1a4_ai_sidebar_collapsed.png'), imgCollapsed.toPNG());
  console.log('[Capture Harness] Saved: phase1a4_ai_sidebar_collapsed.png');

  aiWin.close();

  // 2. Settings Window (540x520 default, borderless, Acrylic)
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

  if (typeof settingsWin.setAccentColor === 'function') {
    settingsWin.setAccentColor(false);
  }

  const settingsUrl = `file://${DIST_HTML}#settings`;
  await settingsWin.loadURL(settingsUrl);
  settingsWin.show();
  await new Promise((r) => setTimeout(r, 600));

  // Navigate to Appearance
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
  const imgSettingsApp = await settingsWin.capturePage();
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'phase1a4_settings_appearance.png'), imgSettingsApp.toPNG());
  console.log('[Capture Harness] Saved: phase1a4_settings_appearance.png');

  settingsWin.close();

  // 3. Compact Island Player without Debugger
  const islandWin = new BrowserWindow({
    width: 380,
    height: 180,
    frame: false,
    transparent: true,
    show: false,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  await islandWin.loadURL(`file://${DIST_HTML}`);
  islandWin.show();
  await new Promise((r) => setTimeout(r, 800));

  // Check that .lyric-sync-diagnostic is NOT rendered
  const hasDiag = await islandWin.webContents.executeJavaScript(`
    Boolean(document.querySelector('.lyric-sync-diagnostic'))
  `);
  console.log('[Capture Harness] Music debugger present in normal UI?', hasDiag);

  const imgPlayer = await islandWin.capturePage();
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'phase1a4_music_player_no_debugger.png'), imgPlayer.toPNG());
  console.log('[Capture Harness] Saved: phase1a4_music_player_no_debugger.png');

  islandWin.close();

  console.log('[Capture Harness 1A.4] All visual verification screenshots captured!');
  app.quit();
});

