const { app, BrowserWindow, screen, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { computeNotchPosition, NOTCH_WIN_W, NOTCH_WIN_H } = require('../../electron/notch-geometry');

const ARTIFACT_DIR = 'C:/Users/harsh/.gemini/antigravity/brain/00486437-adb7-44d3-9fef-0bfc4c041cc3';
const PRELOAD_PATH = path.resolve(__dirname, '../../electron/preload.js');

app.whenReady().then(async () => {
  let activeAppearance = 'dynamic-frosted';
  let activeFrostedColor = '#2b1a16'; // Adele / Charlie Puth warm theme
  let currentVol = 75;
  let currentMuted = false;

  const tracks = {
    adele_intro: {
      active: true,
      title: 'Lovesong',
      artist: 'Adele',
      album: '21',
      art: 'https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/bf/2d/a9/bf2da9a8-e4b2-299d-16f3-1634b17bfb4a/886443027814.jpg/1000x1000bb.jpg',
      durationMs: 316000,
      durationSec: 316,
      positionMs: 6000, // 0:06 intro (Adele has not sung yet, intro guitar solo)
      positionSec: 6,
      status: 'playing',
      reportedAt: Date.now(),
      canSeek: true,
      lyrics: {
        found: true,
        isSynced: true,
        hasWordSync: true,
        syncType: 'word',
        provider: 'LRC.RED',
        lines: [
          {
            id: 'l0',
            timeMs: 26252,
            endMs: 31160,
            text: "Whenever I'm alone with you",
            syncType: 'word',
            words: [
              { text: 'Whenever', startMs: 26252, endMs: 27276, durationMs: 1024 },
              { text: "I'm", startMs: 27276, endMs: 28133, durationMs: 857 },
              { text: 'alone', startMs: 28133, endMs: 29507, durationMs: 1374 },
              { text: 'with', startMs: 29507, endMs: 29941, durationMs: 434 },
              { text: 'you', startMs: 29941, endMs: 31160, durationMs: 1219 },
            ],
          },
          {
            id: 'l1',
            timeMs: 34283,
            endMs: 39786,
            text: 'You make me feel like I am home again',
            syncType: 'word',
            words: [
              { text: 'You', startMs: 34283, endMs: 34771, durationMs: 488 },
              { text: 'make', startMs: 34771, endMs: 35199, durationMs: 428 },
              { text: 'me', startMs: 35199, endMs: 35443, durationMs: 244 },
              { text: 'feel', startMs: 35443, endMs: 36348, durationMs: 905 },
              { text: 'like', startMs: 36348, endMs: 36871, durationMs: 523 },
              { text: 'I', startMs: 36871, endMs: 37121, durationMs: 250 },
              { text: 'am', startMs: 37121, endMs: 37966, durationMs: 845 },
              { text: 'home', startMs: 37966, endMs: 38686, durationMs: 720 },
              { text: 'again', startMs: 38686, endMs: 39786, durationMs: 1100 },
            ],
          },
        ],
      },
    },
    adele_active: {
      active: true,
      title: 'Lovesong',
      artist: 'Adele',
      album: '21',
      art: 'https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/bf/2d/a9/bf2da9a8-e4b2-299d-16f3-1634b17bfb4a/886443027814.jpg/1000x1000bb.jpg',
      durationMs: 316000,
      durationSec: 316,
      positionMs: 28500, // 0:28 active line 0 singing
      positionSec: 28,
      status: 'playing',
      reportedAt: Date.now(),
      canSeek: true,
      lyrics: {
        found: true,
        isSynced: true,
        hasWordSync: true,
        syncType: 'word',
        provider: 'LRC.RED',
        lines: [
          {
            id: 'l0',
            timeMs: 26252,
            endMs: 31160,
            text: "Whenever I'm alone with you",
            syncType: 'word',
            words: [
              { text: 'Whenever', startMs: 26252, endMs: 27276, durationMs: 1024 },
              { text: "I'm", startMs: 27276, endMs: 28133, durationMs: 857 },
              { text: 'alone', startMs: 28133, endMs: 29507, durationMs: 1374 },
              { text: 'with', startMs: 29507, endMs: 29941, durationMs: 434 },
              { text: 'you', startMs: 29941, endMs: 31160, durationMs: 1219 },
            ],
          },
          {
            id: 'l1',
            timeMs: 34283,
            endMs: 39786,
            text: 'You make me feel like I am home again',
            syncType: 'word',
            words: [
              { text: 'You', startMs: 34283, endMs: 34771, durationMs: 488 },
              { text: 'make', startMs: 34771, endMs: 35199, durationMs: 428 },
              { text: 'me', startMs: 35199, endMs: 35443, durationMs: 244 },
              { text: 'feel', startMs: 35443, endMs: 36348, durationMs: 905 },
              { text: 'like', startMs: 36348, endMs: 36871, durationMs: 523 },
              { text: 'I', startMs: 36871, endMs: 37121, durationMs: 250 },
              { text: 'am', startMs: 37121, endMs: 37966, durationMs: 845 },
              { text: 'home', startMs: 37966, endMs: 38686, durationMs: 720 },
              { text: 'again', startMs: 38686, endMs: 39786, durationMs: 1100 },
            ],
          },
        ],
      },
    },
    joy_crookes_yaml: {
      active: true,
      title: "Feet Don't Fail Me Now",
      artist: 'Joy Crookes',
      album: 'Skin',
      art: 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/eb/fa/69/ebfa69f8-7440-a3e9-a0ca-7fa9d8dcb2a3/886449339348.jpg/1000x1000bb.jpg',
      durationMs: 198000,
      durationSec: 198,
      positionMs: 18000,
      positionSec: 18,
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
          {
            id: 'l0',
            timeMs: 15420,
            endMs: 20120,
            text: "I've been thinking about my life",
            syncType: 'word',
            words: [
              { text: "I've", startMs: 15420, endMs: 15900, durationMs: 480 },
              { text: 'been', startMs: 15900, endMs: 16400, durationMs: 500 },
              { text: 'thinking', startMs: 16400, endMs: 17200, durationMs: 800 },
              { text: 'about', startMs: 17200, endMs: 17900, durationMs: 700 },
              { text: 'my', startMs: 17900, endMs: 18300, durationMs: 400 },
              { text: 'life', startMs: 18300, endMs: 20120, durationMs: 1820 },
            ],
          },
          {
            id: 'l1',
            timeMs: 21500,
            endMs: 26800,
            text: 'And how I want to live it',
            syncType: 'word',
            words: [
              { text: 'And', startMs: 21500, endMs: 22000, durationMs: 500 },
              { text: 'how', startMs: 22000, endMs: 22500, durationMs: 500 },
              { text: 'I', startMs: 22500, endMs: 23000, durationMs: 500 },
              { text: 'want', startMs: 23000, endMs: 23800, durationMs: 800 },
              { text: 'to', startMs: 23800, endMs: 24200, durationMs: 400 },
              { text: 'live', startMs: 24200, endMs: 24900, durationMs: 700 },
              { text: 'it', startMs: 24900, endMs: 26800, durationMs: 1900 },
            ],
          },
        ],
      },
    },
    line_only_track: {
      active: true,
      title: 'Borderline',
      artist: 'Tame Impala',
      album: 'The Slow Rush',
      art: 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/71/c6/3d/71c63db6-b1cb-4bc1-aa05-1a74d2b27442/19UMGIM98322.rgb.jpg/1000x1000bb.jpg',
      durationMs: 237000,
      durationSec: 237,
      positionMs: 35000,
      positionSec: 35,
      status: 'playing',
      reportedAt: Date.now(),
      canSeek: true,
      lyrics: {
        found: true,
        isSynced: true,
        hasWordSync: false,
        syncType: 'line',
        provider: 'LRCLIB',
        lines: [
          { id: 'l0', timeMs: 25000, endMs: 32000, text: 'Gone a little far and I can not trace' },
          { id: 'l1', timeMs: 33000, endMs: 40000, text: 'Time goes on, maybe I will know the difference' },
          { id: 'l2', timeMs: 41000, endMs: 48000, text: 'Between the love and the hate' },
        ],
      },
    },
    no_lyrics_track: {
      active: true,
      title: 'Midnight Instrumental',
      artist: 'The Studio',
      album: 'Atmosphere',
      art: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="%231a202c"/><circle cx="100" cy="100" r="60" fill="%234a5568"/><text x="100" y="105" font-family="sans-serif" font-size="14" font-weight="700" fill="%23ffffff" text-anchor="middle">INSTRUMENTAL</text></svg>',
      durationMs: 180000,
      durationSec: 180,
      positionMs: 45000,
      positionSec: 45,
      status: 'playing',
      reportedAt: Date.now(),
      canSeek: true,
      lyrics: {
        found: false,
        notFound: true,
        lines: [],
      },
    },
  };

  let currentMedia = tracks.adele_intro;

  ipcMain.handle('window:is-maximized', () => false);
  ipcMain.handle('window:get-dynamic-frosted-color', () => activeFrostedColor);
  ipcMain.handle('settings:get-appearance-mode', () => activeAppearance);
  ipcMain.handle('island:get-appearance', () => activeAppearance);
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
    windowWidth: Math.max(NOTCH_WIN_W, 680),
    windowHeight: Math.max(NOTCH_WIN_H, 440),
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

  await win.loadFile(path.resolve(__dirname, '../../dist/index.html'));
  win.show();

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  await wait(800);

  // Send media and expand to music view
  win.webContents.send('media', currentMedia);
  win.webContents.send('hub:open', 'playing');
  await wait(1000);

  async function captureNotch(filename, label) {
    await wait(250);
    const bounds = await win.webContents.executeJavaScript(`
      (() => {
        const el = document.querySelector('.island--notch') || document.querySelector('.island');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return {
          x: Math.max(0, Math.floor(r.left - 12)),
          y: Math.max(0, Math.floor(r.top)),
          width: Math.min(Math.ceil(r.width + 24), ${placement.width}),
          height: Math.min(Math.ceil(r.height + 24), ${placement.height}),
          renderedWidth: Math.round(r.width),
          renderedHeight: Math.round(r.height),
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
    console.log(`[Captured] ${label} -> ${filename}`);
    return bounds;
  }

  const getLayoutMetrics = async () => {
    return await win.webContents.executeJavaScript(`
      (() => {
        const coverWrap = document.querySelector('.np--two-col .np__cover-wrap');
        const meta = document.querySelector('.np--two-col .np__meta');
        const progress = document.querySelector('.np__progress--left');
        const miniLyrics = document.querySelector('.np--two-col .np__right .mini-lyrics');
        const activeLine = document.querySelector('.mini-lyrics__line.is-active') || document.querySelector('.mini-lyrics__line');
        const footer = document.querySelector('.np__right-footer');

        const r = (el) => el ? el.getBoundingClientRect() : null;

        const coverRect = r(coverWrap);
        const activeRect = r(activeLine);
        const progRect = r(progress);
        const footerRect = r(footer);
        const lyricsRect = r(miniLyrics);

        const artworkCenterY = coverRect ? Math.round(coverRect.top + coverRect.height / 2) : 0;
        const activeLyricCenterY = activeRect ? Math.round(activeRect.top + activeRect.height / 2) : 0;
        const progressBarTop = progRect ? Math.round(progRect.top) : 0;
        const dividerTop = footerRect ? Math.round(footerRect.top) : 0;

        return {
          artwork: {
            width: coverRect ? Math.round(coverRect.width) : 0,
            height: coverRect ? Math.round(coverRect.height) : 0,
            top: coverRect ? Math.round(coverRect.top) : 0,
            centerY: artworkCenterY,
          },
          activeLyric: {
            top: activeRect ? Math.round(activeRect.top) : 0,
            centerY: activeLyricCenterY,
            text: activeLine ? activeLine.textContent.trim().substring(0, 30) : '',
            classes: activeLine ? activeLine.className : '',
          },
          alignment: {
            artworkCenterY,
            activeLyricCenterY,
            centerDeltaPx: Math.abs(artworkCenterY - activeLyricCenterY),
            progressBarTop,
            dividerTop,
            dividerDeltaPx: Math.abs(progressBarTop - dividerTop),
          },
          miniLyricsHeight: lyricsRect ? Math.round(lyricsRect.height) : 0,
        };
      })()
    `);
  };

  const results = {};

  // 1. Adele — Lovesong at 0:06 (Intro)
  currentMedia = tracks.adele_intro;
  win.webContents.send('media', currentMedia);
  await wait(700);
  results.adele_intro = await getLayoutMetrics();
  await captureNotch('gate_b1_4_adele_006_intro.png', 'Adele Lovesong at 0:06 (Intro)');

  // 2. Adele — Lovesong at 0:28 (Active Word-by-Word Line 0)
  currentMedia = tracks.adele_active;
  win.webContents.send('media', currentMedia);
  await wait(700);
  results.adele_active = await getLayoutMetrics();
  await captureNotch('gate_b1_4_adele_028_active.png', 'Adele Lovesong at 0:28 (Active Word-by-Word)');

  // 3. Joy Crookes — Feet Don't Fail Me Now (YAML Word Sync)
  currentMedia = tracks.joy_crookes_yaml;
  win.webContents.send('media', currentMedia);
  await wait(700);
  results.joy_crookes_yaml = await getLayoutMetrics();
  await captureNotch('gate_b1_4_joy_crookes_yaml_sync.png', 'Joy Crookes (YAML Word Sync)');

  // 4. Line-only track (Borderline)
  currentMedia = tracks.line_only_track;
  win.webContents.send('media', currentMedia);
  await wait(700);
  results.line_only = await getLayoutMetrics();
  await captureNotch('gate_b1_4_line_only_sync.png', 'Line-only Sync (Borderline)');

  // 5. No lyrics track (Instrumental)
  currentMedia = tracks.no_lyrics_track;
  win.webContents.send('media', currentMedia);
  await wait(700);
  results.no_lyrics = await getLayoutMetrics();
  await captureNotch('gate_b1_4_no_lyrics_empty.png', 'No Lyrics / Instrumental State');

  fs.writeFileSync(
    path.join(ARTIFACT_DIR, 'gate_b1_4_metrics.json'),
    JSON.stringify(results, null, 2)
  );

  console.log('\n========================================');
  console.log('REAL ELECTRON VERIFICATION MEASUREMENTS:');
  console.log(JSON.stringify(results, null, 2));
  console.log('========================================\n');

  win.close();
  app.quit();
});
