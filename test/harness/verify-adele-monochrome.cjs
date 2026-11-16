const { app, BrowserWindow, screen, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { computeNotchPosition, NOTCH_WIN_W, NOTCH_WIN_H } = require('../../electron/notch-geometry');

const ARTIFACT_DIR = 'C:/Users/harsh/.gemini/antigravity/brain/00486437-adb7-44d3-9fef-0bfc4c041cc3';
const PRELOAD_PATH = path.resolve(__dirname, '../../electron/preload.js');
const DIST_INDEX = path.resolve(__dirname, '../../dist/index.html');

app.whenReady().then(async () => {
  // Adele 21 Monochrome Artwork SVG
  const artDataUrl = 'data:image/svg+xml;utf8,' + encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#262626" />
      <stop offset="50%" stop-color="#171717" />
      <stop offset="100%" stop-color="#0a0a0a" />
    </linearGradient>
  </defs>
  <rect width="300" height="300" rx="20" fill="url(#g)" />
  <circle cx="150" cy="140" r="70" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="6" />
  <circle cx="150" cy="140" r="26" fill="rgba(255,255,255,0.35)" />
  <text x="150" y="250" font-family="sans-serif" font-size="20" font-weight="bold" fill="#e5e5e5" text-anchor="middle" letter-spacing="3">ADELE 21</text>
</svg>
`);

  const currentMedia = {
    active: true,
    title: 'Lovesong',
    artist: 'Adele',
    album: '21',
    art: artDataUrl,
    durationMs: 316000,
    durationSec: 316,
    positionMs: 30000,
    positionSec: 30,
    status: 'playing',
    reportedAt: Date.now(),
    canSeek: true,
    lyrics: {
      found: true,
      isSynced: true,
      hasWordSync: true,
      syncType: 'word',
      provider: 'LRCLIB',
      lines: [
        { id: 'l1', timeMs: 28000, endMs: 33000, text: 'Whenever I\'m alone with you' },
        { id: 'l2', timeMs: 34000, endMs: 40000, text: 'You make me feel like I am home again' },
      ],
    },
  };

  let currentVol = 75;
  let currentMuted = false;

  ipcMain.handle('settings:get-appearance-mode', () => 'dynamic-frosted');
  ipcMain.handle('island:get-appearance', () => 'dynamic-frosted');
  ipcMain.handle('state:get', () => ({
    schedule: [],
    inbox: [],
    rings: [],
    media: currentMedia,
    playbackState: 'PLAYING',
    status: currentMedia.status,
  }));
  ipcMain.handle('window:get-dock', () => false);
  ipcMain.handle('notch:get-visibility-mode', () => 'always');
  ipcMain.handle('win:get-cursor-context', () => ({ x: 0, y: 0 }));
  ipcMain.handle('app-volume:get-capabilities', () => ({ supported: true }));
  ipcMain.handle('app-volume:get-volume', () => ({ volume: currentVol, muted: currentMuted }));
  ipcMain.handle('app-volume:set-volume', (_e, v) => { currentVol = v; return true; });
  ipcMain.handle('media:get-volume', () => ({ volume: currentVol, muted: currentMuted }));
  ipcMain.handle('media:set-volume', (_e, v) => { currentVol = v; return true; });
  ipcMain.handle('companion:get-status', () => ({ connected: false }));
  ipcMain.handle('windows-tts:cancel', () => true);
  ipcMain.handle('kokoro:cancel', () => true);
  ipcMain.handle('companion:dispatch', () => true);
  ipcMain.handle('media:control', () => true);
  ipcMain.on('media:control', () => true);
  ipcMain.handle('media:seek', () => true);
  ipcMain.handle('notch:report-interactive-bounds', () => true);
  ipcMain.handle('notch:request-expansion', () => true);
  ipcMain.handle('notch:request-collapse', () => true);

  const primaryDisplay = screen.getPrimaryDisplay();
  const placement = computeNotchPosition({
    primaryDisplay,
    allDisplays: screen.getAllDisplays(),
    windowWidth: Math.max(NOTCH_WIN_W, 720),
    windowHeight: Math.max(NOTCH_WIN_H, 480),
  });

  const win = new BrowserWindow({
    x: placement.x,
    y: placement.y,
    width: placement.width,
    height: placement.height,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: PRELOAD_PATH,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  await win.loadFile(DIST_INDEX);
  win.show();
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  await wait(800);

  // Set metaballs mode to dynamic
  await win.webContents.executeJavaScript(`
    localStorage.setItem('island_metaballs_mode', 'dynamic');
    window.dispatchEvent(new CustomEvent('island:metaballs-mode-changed', { detail: 'dynamic' }));
  `);

  win.webContents.send('media', currentMedia);
  win.webContents.send('hub:open', 'playing');
  await wait(1400);

  const bounds = await win.webContents.executeJavaScript(`
    (() => {
      const el = document.querySelector('.island--notch') || document.querySelector('.island');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        x: Math.max(0, Math.floor(r.left - 16)),
        y: Math.max(0, Math.floor(r.top - 8)),
        width: Math.min(Math.ceil(r.width + 32), ${placement.width}),
        height: Math.min(Math.ceil(r.height + 24), ${placement.height}),
      };
    })()
  `);

  const image = await win.webContents.capturePage({
    x: bounds ? bounds.x : 0,
    y: bounds ? bounds.y : 0,
    width: bounds ? bounds.width : placement.width,
    height: bounds ? bounds.height : placement.height,
  });

  const outPath = path.join(ARTIFACT_DIR, 'adele_monochrome_silver_verified.png');
  fs.writeFileSync(outPath, image.toPNG());
  console.log('[Captured] adele_monochrome_silver_verified.png');

  app.quit();
});
