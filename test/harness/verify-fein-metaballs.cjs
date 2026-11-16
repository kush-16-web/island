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
    <linearGradient id="utopia" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#b45309" />
      <stop offset="40%" stop-color="#78350f" />
      <stop offset="100%" stop-color="#1c1917" />
    </linearGradient>
  </defs>
  <rect width="300" height="300" rx="20" fill="url(#utopia)" />
  <circle cx="150" cy="130" r="64" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="6" />
  <text x="150" y="240" font-family="sans-serif" font-size="24" font-weight="900" fill="#f59e0b" text-anchor="middle" letter-spacing="4">UTOPIA</text>
</svg>
`);

  const currentMedia = {
    active: true,
    title: 'FE!N',
    artist: 'Travis Scott ft. Playboi Carti',
    album: 'UTOPIA',
    art: artDataUrl,
    durationMs: 191000,
    durationSec: 191,
    positionMs: 65000,
    positionSec: 65,
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
        { id: 'l1', timeMs: 60000, endMs: 64000, text: "The career's more at stake when you in your prime" },
        { id: 'l2', timeMs: 65000, endMs: 69000, text: 'FE!N, FE!N, FE!N, FE!N-FE!N' },
        { id: 'l3', timeMs: 70000, endMs: 75000, text: 'Fuck that shit up!' },
      ],
    },
  };

  let currentVol = 80;
  let currentMuted = false;

  ipcMain.handle('window:get-dynamic-frosted-color', () => '#b45309');
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

  // Ensure metaballs mode is 'dynamic'
  await win.webContents.executeJavaScript(`
    localStorage.setItem('island_metaballs_mode', 'dynamic');
    window.dispatchEvent(new CustomEvent('island:metaballs-mode-changed', { detail: 'dynamic' }));
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

  // Frame 1: Initial organic fluid state with satellite droplets calving
  await captureWindow('fein_metaball_calving_frame1.png');

  // Let fluid drift and droplets float outward for 1.2s
  await wait(1200);
  await captureWindow('fein_metaball_calving_frame2.png');

  app.quit();
});
