const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');

const DIST_HTML = path.resolve(__dirname, '../../dist/index.html');
const PRELOAD = path.resolve(__dirname, '../../electron/preload.js');

let currentMedia = {
  active: true,
  title: 'Borderline',
  artist: 'Tame Impala',
  status: 'playing',
  art: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
};

ipcMain.handle('window:is-maximized', () => false);
ipcMain.handle('settings:get-appearance-mode', () => 'dynamic_frosted');
ipcMain.handle('pet:get-visible', () => false);
ipcMain.handle('state:get', () => ({ media: currentMedia }));

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 680,
    height: 520,
    frame: false,
    transparent: true,
    show: false,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.webContents.on('console-message', (e, level, message) => {
    console.log('[RENDERER CONSOLE]:', message);
  });

  await win.loadURL(`file://${DIST_HTML}#workspace`);
  await new Promise(r => setTimeout(r, 600));

  const diag = await win.webContents.executeJavaScript(`
    (() => {
      const el = document.querySelector('.quiet-glass-window');
      el.style.transition = 'none';
      el.style.animation = 'none';
      el.style.backgroundColor = 'color-mix(in srgb, rgb(233, 99, 177) 12%, rgba(14, 16, 22, 0.70))';
      const cs = window.getComputedStyle(el);
      return {
        computedBg: cs.backgroundColor
      };
    })()
  `);

  console.log('[DOM DIAGNOSTIC]:', JSON.stringify(diag, null, 2));
  win.destroy();
  app.quit();
});
