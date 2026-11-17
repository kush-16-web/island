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
    <linearGradient id="chestpain" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1e3a8a" />
      <stop offset="50%" stop-color="#172554" />
      <stop offset="100%" stop-color="#0f172a" />
    </linearGradient>
  </defs>
  <rect width="300" height="300" rx="20" fill="url(#chestpain)" />
  <circle cx="150" cy="130" r="50" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="4" />
  <text x="150" y="240" font-family="sans-serif" font-size="18" font-weight="bold" fill="#60a5fa" text-anchor="middle">MALCOLM TODD</text>
</svg>
`);

  const currentMedia = {
    active: true,
    title: "We Don't Talk Anymore",
    artist: 'Atif Aslam & Sumedha Karmahe (Special Edition Extended)',
    album: 'Nine Track Mind',
    art: artDataUrl,
    durationMs: 200000,
    durationSec: 200,
    positionMs: 24000,
    positionSec: 24,
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
        { id: 'l1', timeMs: 20000, endMs: 23000, text: "I just heard you found the one you've been lookin'" },
        { id: 'l2', timeMs: 24000, endMs: 28000, text: "You've been lookin' for" },
        { id: 'l3', timeMs: 29000, endMs: 33000, text: "I wish I would have known that wasn't me" },
      ],
    },
  };

  let currentVol = 75;

  ipcMain.handle('window:get-dynamic-frosted-color', () => '#2563eb');
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
  ipcMain.handle('app-volume:get-volume', () => ({ volume: currentVol, muted: false }));
  ipcMain.handle('app-volume:set-volume', (_e, v) => { currentVol = v; return true; });
  ipcMain.handle('media:get-volume', () => ({ volume: currentVol, muted: false }));
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

  // Set metaballs mode to 'shards'
  await win.webContents.executeJavaScript(`
    localStorage.setItem('island_metaballs_mode', 'shards');
    window.dispatchEvent(new CustomEvent('island:metaballs-mode-changed', { detail: 'shards' }));
  `);

  win.webContents.send('media', currentMedia);
  win.webContents.send('hub:open', 'playing');
  await wait(1400);

  const captureWindow = async (filename) => {
    await wait(300);
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

  // 1. Capture unhovered resting state (Volume button is 28px circle matching Setting button)
  await captureWindow('volume_rest_matching_setting.png');

  // 2. Capture hovered volume state (expands to the left, mute button and controls stay anchored)
  await win.webContents.executeJavaScript(`
    (() => {
      const vol = document.querySelector('.np__volume-inline');
      if (vol) {
        vol.classList.add('is-dragging');
      }
    })()
  `);
  await wait(400);
  await captureWindow('volume_hovered_anchored_left.png');

  // 3. Remove hover on volume, and set mode to 'classic' (OG default ambient aura)
  await win.webContents.executeJavaScript(`
    (() => {
      const vol = document.querySelector('.np__volume-inline');
      if (vol) {
        vol.classList.remove('is-dragging');
      }
      localStorage.setItem('island_metaballs_mode', 'classic');
      window.dispatchEvent(new CustomEvent('island:metaballs-mode-changed', { detail: 'classic' }));
    })()
  `);
  await wait(600);
  await captureWindow('classic_aura_og_verified.png');

  // 4. Open Settings Popover to show Classic selected
  await win.webContents.executeJavaScript(`
    (() => {
      const gearBtn = document.querySelector('.np__tab-pill--gear');
      if (gearBtn) {
        gearBtn.click();
      }
    })()
  `);
  await wait(600);
  await captureWindow('lyrics_settings_classic_aura_popover.png');

  app.quit();
});
