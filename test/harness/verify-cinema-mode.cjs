const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const ARTIFACT_DIR = 'C:/Users/harsh/.gemini/antigravity/brain/00486437-adb7-44d3-9fef-0bfc4c041cc3';
const PRELOAD_PATH = path.resolve(__dirname, '../../electron/preload.js');
const DIST_INDEX = path.resolve(__dirname, '../../dist/index.html');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    show: false,
    frame: false,
    backgroundColor: '#090a0f',
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Authentic dark red Ghajini artwork
  const artDataUrl = 'data:image/svg+xml;utf8,' + encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#450a0a" />
      <stop offset="50%" stop-color="#991b1b" />
      <stop offset="100%" stop-color="#1c0505" />
    </linearGradient>
  </defs>
  <rect width="600" height="600" rx="20" fill="url(#g)" />
  <circle cx="300" cy="260" r="90" fill="#7f1d1d" />
  <text x="300" y="470" font-family="sans-serif" font-size="34" font-weight="bold" fill="#ffffff" text-anchor="middle">GUZARISH</text>
  <text x="300" y="520" font-family="sans-serif" font-size="22" font-weight="500" fill="#fca5a5" text-anchor="middle">Javed Ali &amp; A.R. Rahman</text>
</svg>
`);

  const sampleMedia = {
    active: true,
    title: 'Guzarish',
    artist: 'Javed Ali, A.R. Rahman, & Prasoon Joshi',
    album: 'Ghajini',
    durationMs: 328000,
    positionMs: 27000,
    reportedAt: Date.now(),
    status: 'playing',
    art: artDataUrl,
  };

  ipcMain.handle('state:get', () => ({
    media: sampleMedia,
  }));

  ipcMain.handle('media:get-volume', () => ({
    volume: 75,
    muted: false,
  }));

  ipcMain.handle('aura:get-settings', () => ({
    mode: 'dynamic',
    blur: 25,
    reactive: true,
  }));

  await win.loadURL(`file://${DIST_INDEX}#cinema`);

  // Mock Guzarish lyrics from Ghajini with word-by-word sync
  await win.webContents.executeJavaScript(`
    window.__mockLyricsData = {
      found: true,
      isSynced: true,
      lines: [
        {
          timeMs: 22000,
          endMs: 26000,
          text: "तू आ गई मन को रास-रास",
        },
        {
          timeMs: 26000,
          endMs: 34000,
          text: "तू मेरी अधूरी प्यास-प्यास",
          syncType: "word",
          words: [
            { text: "तू", startMs: 26000, endMs: 27000 },
            { text: "मेरी", startMs: 27000, endMs: 28500 },
            { text: "अधूरी", startMs: 28500, endMs: 30500 },
            { text: "प्यास-प्यास", startMs: 30500, endMs: 34000 }
          ]
        },
        {
          timeMs: 34000,
          endMs: 40000,
          text: "तू आ गई मन को रास-रास, अब तो...",
        },
        {
          timeMs: 40000,
          endMs: 48000,
          text: "तू दर्द से कर दे आज़ाद",
        }
      ]
    };
    window.dispatchEvent(new Event('cinema:mock-lyrics'));
  `);
  win.show();
  await new Promise((r) => setTimeout(r, 2200));

  const image = await win.capturePage();
  const outPath = path.join(ARTIFACT_DIR, 'cinema_player_verified.png');
  fs.writeFileSync(outPath, image.toPNG());
  console.log('[Captured] cinema_player_verified.png');

  win.destroy();
  app.quit();
});
