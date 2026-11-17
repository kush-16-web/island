const { app, BrowserWindow, screen } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const ARTIFACT_DIR = 'C:/Users/harsh/.gemini/antigravity/brain/00486437-adb7-44d3-9fef-0bfc4c041cc3';
const PRELOAD_PATH = path.resolve(__dirname, '../../electron/preload.js');
const DIST_INDEX = path.resolve(__dirname, '../../dist/index.html');

app.whenReady().then(async () => {
  // Wallpaper background with vibrant colors to verify frosted blur opacity and no wallpaper bleed-through
  const bg = new BrowserWindow({
    width: 900, height: 750, x: 50, y: 50,
    frame: false, show: true,
  });
  await bg.loadURL('data:text/html,<body style="margin:0; background: radial-gradient(circle at 70% 30%, #e11d48 0%, #d97706 35%, #1e1b4b 70%, #09090b 100%); height: 100vh;"><div style=\"position:absolute; right:40px; top:40px; color:white; font-size:32px; font-weight:bold;\">WALLPAPER CONTENT</div></body>');
  await new Promise(r => setTimeout(r, 400));

  const win = new BrowserWindow({
    width: 780,
    height: 560,
    x: 100,
    y: 100,
    titleBarStyle: 'hidden',
    titleBarOverlay: false,
    transparent: false,
    backgroundColor: '#00000000',
    backgroundMaterial: 'acrylic',
    roundedCorners: true,
    show: false,
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  await win.loadURL(`file://${DIST_INDEX}#settings?tab=aura`);
  win.show();
  await new Promise(r => setTimeout(r, 1200));

  const image = await win.capturePage();
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'settings_two_pane_aura_studio.png'), image.toPNG());
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'current_settings_window_capture.png'), image.toPNG());
  console.log('[Captured] settings_two_pane_aura_studio.png');

  bg.destroy();
  win.destroy();
  app.quit();
});
