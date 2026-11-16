const { app, BrowserWindow, screen, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const ARTIFACT_DIR = 'C:/Users/harsh/.gemini/antigravity/brain/00486437-adb7-44d3-9fef-0bfc4c041cc3';
const PRELOAD_PATH = path.resolve(__dirname, '../../electron/preload.js');
const DIST_INDEX = path.resolve(__dirname, '../../dist/index.html');

app.whenReady().then(async () => {
  const currentMedia = {
    active: true,
    title: 'Duvet',
    artist: 'bôa',
    album: 'Twilight',
    art: 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/91/92/ff/9192ffbf-a3d1-fae7-9d7a-8f8306df145d/886445695028.jpg/1000x1000bb.jpg',
    durationMs: 204000,
    durationSec: 204,
    positionMs: 14000,
    positionSec: 14,
    status: 'playing',
    lyrics: {
      found: true,
      isSynced: true,
      hasWordSync: true,
      syncType: 'word',
      lines: [
        { id: 'l0', timeMs: 8000, endMs: 12000, text: 'And you don\'t seem to understand' },
        { id: 'l1', timeMs: 13000, endMs: 18000, text: 'A shame you seemed an honest man' },
        { id: 'l2', timeMs: 19000, endMs: 25000, text: 'And all the fears you hold so dear' },
        { id: 'l3', timeMs: 26000, endMs: 32000, text: 'Will turn to whisper in your ear' },
      ],
    },
  };

  ipcMain.handle('window:is-maximized', () => false);
  ipcMain.handle('settings:get-appearance-mode', () => 'dynamic-frosted');
  ipcMain.handle('state:get', () => ({ media: currentMedia, playbackState: 'PLAYING', status: 'playing' }));
  ipcMain.handle('notch:get-visibility-mode', () => 'always');
  ipcMain.handle('app-volume:get-capabilities', () => ({ supported: true }));
  ipcMain.handle('app-volume:get-volume', () => ({ volume: 75, muted: false }));
  ipcMain.handle('media:get-volume', () => ({ volume: 75, muted: false }));
  ipcMain.handle('companion:get-status', () => ({ connected: false }));
  ipcMain.handle('media:control', () => true);

  const win = new BrowserWindow({
    width: 600,
    height: 400,
    show: false,
    frame: false,
    transparent: true,
    webPreferences: { preload: PRELOAD_PATH, sandbox: false },
  });

  await win.loadFile(DIST_INDEX);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  await wait(800);

  win.webContents.send('media', currentMedia);
  win.webContents.send('hub:open', 'playing');
  await wait(1000);

  const bounds = await win.webContents.executeJavaScript(`
    (() => {
      const el = document.querySelector('.island--notch') || document.querySelector('.island');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        x: Math.max(0, Math.floor(r.left - 12)),
        y: Math.max(0, Math.floor(r.top)),
        width: Math.min(Math.ceil(r.width + 24), 600),
        height: Math.min(Math.ceil(r.height + 24), 400),
      };
    })()
  `);

  const image = await win.capturePage();

  const outPath = path.join(ARTIFACT_DIR, 'borderless_volume_aligned.png');
  fs.writeFileSync(outPath, image.toPNG());
  console.log('[Captured] borderless_volume_aligned.png');

  win.close();
  app.quit();
});
