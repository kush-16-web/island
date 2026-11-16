const { app, BrowserWindow, screen, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { computeNotchPosition, NOTCH_WIN_W, NOTCH_WIN_H } = require('../../electron/notch-geometry');

const ARTIFACT_DIR = 'C:/Users/harsh/.gemini/antigravity/brain/00486437-adb7-44d3-9fef-0bfc4c041cc3';
const PRELOAD_PATH = path.resolve(__dirname, '../../electron/preload.js');
const DIST_INDEX = path.resolve(__dirname, '../../dist/index.html');

app.whenReady().then(async () => {
  const artDataUrl = 'data:image/svg+xml;utf8,' + encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">
  <defs>
    <linearGradient id="mirrors" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ca8a04" />
      <stop offset="50%" stop-color="#854d0e" />
      <stop offset="100%" stop-color="#18181b" />
    </linearGradient>
  </defs>
  <rect width="300" height="300" rx="20" fill="url(#mirrors)" />
  <circle cx="150" cy="130" r="50" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="4" />
  <text x="150" y="240" font-family="sans-serif" font-size="20" font-weight="bold" fill="#facc15" text-anchor="middle">20/20 EXPERIENCE</text>
</svg>
`);

  const currentMedia = {
    active: true,
    title: 'Mirrors',
    artist: 'Justin Timberlake',
    album: 'The 20/20 Experience',
    art: artDataUrl,
    durationMs: 484000,
    durationSec: 484,
    positionMs: 244000,
    positionSec: 244,
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
        { id: 'l1', timeMs: 240000, endMs: 243000, text: 'I\'ll tell you, baby, it was easy coming back here to you' },
        { id: 'l2', timeMs: 244000, endMs: 247000, text: 'You were right here all along' },
        { id: 'l3', timeMs: 248000, endMs: 252000, text: 'It\'s like you\'re my mirror' },
      ],
    },
  };

  let currentVol = 75;
  let currentMuted = false;

  ipcMain.handle('window:get-dynamic-frosted-color', () => '#ca8a04');
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

  // Set metaballs mode to 'aurora' (Fluid Wave)
  await win.webContents.executeJavaScript(`
    localStorage.setItem('island_metaballs_mode', 'aurora');
    window.dispatchEvent(new CustomEvent('island:metaballs-mode-changed', { detail: 'aurora' }));
  `);

  win.webContents.send('media', currentMedia);
  win.webContents.send('hub:open', 'playing');
  await wait(1500);

  const captureWindow = async (filename) => {
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

    const outPath = path.join(ARTIFACT_DIR, filename);
    fs.writeFileSync(outPath, image.toPNG());
    console.log(`[Captured] ${filename}`);
  };

  await captureWindow('mirrors_ios_fluid_aurora_verified.png');

  app.quit();
});
