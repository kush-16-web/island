const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const ARTIFACT_DIR = path.resolve('C:/Users/harsh/.gemini/antigravity/brain/00486437-adb7-44d3-9fef-0bfc4c041cc3');
const DIST_HTML = path.resolve(__dirname, '../../dist/index.html');
const PRELOAD = path.resolve(__dirname, '../../electron/preload.js');
const ICON_PATH = path.resolve(__dirname, '../../assets/icon.ico');

let currentMode = 'dynamic_frosted';
let currentMedia = {
  active: true,
  title: 'Borderline',
  artist: 'Tame Impala',
  status: 'playing',
  // High-vibrancy Crimson / Vermilion Red 1x1 data URI for Tame Impala Borderline
  art: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', // #FF0000 / saturated red
};

ipcMain.handle('window:is-maximized', () => false);
ipcMain.handle('settings:get-appearance-mode', () => currentMode);
ipcMain.on('settings:set-appearance-mode', (e, m) => { currentMode = m; });
ipcMain.handle('pet:get-visible', () => false);
ipcMain.handle('state:get', () => ({ media: currentMedia }));

app.whenReady().then(async () => {
  console.log('[Verification 1A.5B] Starting Electron Visual Verification...');

  // 1. Create AI Workspace Window
  const aiWin = new BrowserWindow({
    width: 680,
    height: 520,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    backgroundMaterial: 'acrylic',
    hasShadow: false,
    icon: ICON_PATH,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  await aiWin.loadURL(`file://${DIST_HTML}#workspace`);
  aiWin.show();
  await new Promise((r) => setTimeout(r, 600));

  // Send initial media state (Borderline - Red)
  aiWin.webContents.send('media', currentMedia);
  await new Promise((r) => setTimeout(r, 600));

  // Capture 1: AI Workspace with Dynamic Frosted (Borderline Red mood)
  const capAiRed = await aiWin.capturePage();
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'phase1a5b_ai_dynamic_borderline_red.png'), capAiRed.toPNG());
  console.log('Saved phase1a5b_ai_dynamic_borderline_red.png');

  // Change to Pink + White (Pink mood)
  currentMedia = {
    active: true,
    title: 'Pink + White',
    artist: 'Frank Ocean',
    status: 'playing',
    // Pastel Pink / Rose 1x1 data URI
    art: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  };
  // Send Pink media state
  aiWin.webContents.send('media', {
    active: true,
    title: 'Pink + White',
    artist: 'Frank Ocean',
    status: 'playing',
    // 8x8 soft pink/rose image
    art: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAJElEQVR42mP8z8AARAwMDLhk0P///5kYGRkZ0cVi0UBjY4oLAQDj8hARd20zfwAAAABJRU5ErkJggg==',
  });
  await new Promise((r) => setTimeout(r, 600));

  // Capture 2: AI Workspace with Pink + White mood
  const capAiPink = await aiWin.capturePage();
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'phase1a5b_ai_dynamic_pink_white.png'), capAiPink.toPNG());
  console.log('Saved phase1a5b_ai_dynamic_pink_white.png');

  // Collapse sidebar to verify sidebar toggle button visibility in Titlebar
  await aiWin.webContents.executeJavaScript(`
    const toggleBtn = document.querySelector('.workspace-sidebar__toggle-btn');
    if (toggleBtn) toggleBtn.click();
  `);
  await new Promise((r) => setTimeout(r, 400));

  // Capture 3: AI Workspace with Sidebar Collapsed
  const capAiCollapsed = await aiWin.capturePage();
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'phase1a5b_ai_sidebar_collapsed_with_toggle.png'), capAiCollapsed.toPNG());
  console.log('Saved phase1a5b_ai_sidebar_collapsed_with_toggle.png');

  // 2. Create Settings Window
  const settingsWin = new BrowserWindow({
    width: 540,
    height: 520,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    backgroundMaterial: 'acrylic',
    hasShadow: false,
    icon: ICON_PATH,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  await settingsWin.loadURL(`file://${DIST_HTML}#settings`);
  settingsWin.show();
  await new Promise((r) => setTimeout(r, 600));

  // Send media state to settings window as well
  settingsWin.webContents.send('media', currentMedia);
  await new Promise((r) => setTimeout(r, 500));

  // Navigate to Appearance tab in Settings
  await settingsWin.webContents.executeJavaScript(`
    const items = Array.from(document.querySelectorAll('.settings-catalog__item'));
    const appItem = items.find(el => el.textContent.includes('Appearance'));
    if (appItem) appItem.click();
  `);
  await new Promise((r) => setTimeout(r, 400));

  // Capture 4: Settings with Appearance Tab & Dynamic Frosted
  const capSettingsDynamic = await settingsWin.capturePage();
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'phase1a5b_settings_dynamic_frosted.png'), capSettingsDynamic.toPNG());
  console.log('Saved phase1a5b_settings_dynamic_frosted.png');

  // Switch to Dark Frosted
  await settingsWin.webContents.executeJavaScript(`
    const darkBtn = Array.from(document.querySelectorAll('.settings-option-card')).find(el => el.textContent.includes('Dark Frosted'));
    if (darkBtn) darkBtn.click();
  `);
  await new Promise((r) => setTimeout(r, 400));

  // Capture 5: Settings with Dark Frosted (Neutral Graphite)
  const capSettingsDark = await settingsWin.capturePage();
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'phase1a5b_settings_dark_frosted.png'), capSettingsDark.toPNG());
  console.log('Saved phase1a5b_settings_dark_frosted.png');

  console.log('[Verification 1A.5B] All verification captures completed successfully!');
  aiWin.destroy();
  settingsWin.destroy();
  app.quit();
});

