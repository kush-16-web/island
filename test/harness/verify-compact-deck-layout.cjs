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
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#7c2d12" />
      <stop offset="50%" stop-color="#b45309" />
      <stop offset="100%" stop-color="#1c1917" />
    </linearGradient>
  </defs>
  <rect width="300" height="300" rx="20" fill="url(#g)" />
  <circle cx="150" cy="140" r="70" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="8" />
  <circle cx="150" cy="140" r="26" fill="rgba(255,255,255,0.28)" />
  <text x="150" y="250" font-family="sans-serif" font-size="18" font-weight="bold" fill="#fff" text-anchor="middle" letter-spacing="2">LADY LADY</text>
</svg>
`);

  const currentMedia = {
    active: true,
    title: 'Tadow',
    artist: 'Masego & FKJ',
    album: 'Lady Lady',
    art: artDataUrl,
    durationMs: 302000,
    durationSec: 302,
    positionMs: 44000, // 0:44 into Tadow ("Oh, (tadow)")
    positionSec: 44,
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
        { id: 'l1', timeMs: 38000, endMs: 42000, text: 'Yeah, yeah, oh' },
        { id: 'l2', timeMs: 43000, endMs: 47000, text: 'Oh, (tadow)' },
        { id: 'l3', timeMs: 48000, endMs: 54000, text: 'I saw her and she hit me like (tadow)' },
        { id: 'l4', timeMs: 55000, endMs: 60000, text: 'Saw her from the corner of my eye' },
      ],
    },
  };

  let currentVol = 75;
  let currentMuted = false;

  ipcMain.handle('window:get-dynamic-frosted-color', () => '#2d1410');
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

  // Send media and open expanded player
  win.webContents.send('media', currentMedia);
  win.webContents.send('hub:open', 'playing');
  await wait(1200);

  async function captureWindow(filename) {
    await wait(200);
    const bounds = await win.webContents.executeJavaScript(`
      (() => {
        const el = document.querySelector('.island--notch') || document.querySelector('.island');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const pop = document.querySelector('.lyrics-settings-popover');
        const popR = pop ? pop.getBoundingClientRect() : null;
        const topY = popR ? Math.min(r.top, popR.top) : r.top;
        const botY = popR ? Math.max(r.bottom, popR.bottom) : r.bottom;
        return {
          x: Math.max(0, Math.floor(r.left - 16)),
          y: Math.max(0, Math.floor(topY - 8)),
          width: Math.min(Math.ceil(r.width + 32), ${placement.width}),
          height: Math.min(Math.ceil(botY - topY + 24), ${placement.height}),
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
    console.log('[Captured]', filename);
  }

  // 1. Measure Horizontal & Vertical Alignment Coordinates
  const metrics = await win.webContents.executeJavaScript(`
    (() => {
      const art = document.querySelector('.np__cover-wrap');
      const title = document.querySelector('.np__title');
      const artist = document.querySelector('.np__artist');
      const lyrics = document.querySelector('.mini-lyrics');
      const progress = document.querySelector('.np__progress--deck');
      const controlsRow = document.querySelector('.np__controls-row');
      const volInline = document.querySelector('.np__volume-inline');
      const playControls = document.querySelector('.np__controls--left-aligned');
      const gearBtn = document.querySelector('.np__tab-pill--gear');
      const island = document.querySelector('.island--notch') || document.querySelector('.island');

      const toRect = (el) => el ? {
        top: Math.round(el.getBoundingClientRect().top),
        bottom: Math.round(el.getBoundingClientRect().bottom),
        left: Math.round(el.getBoundingClientRect().left),
        right: Math.round(el.getBoundingClientRect().right),
        width: Math.round(el.getBoundingClientRect().width),
        height: Math.round(el.getBoundingClientRect().height),
      } : null;

      const islandR = island ? island.getBoundingClientRect() : { top: 0, left: 0 };

      return {
        art: toRect(art),
        title: toRect(title),
        artist: toRect(artist),
        lyrics: toRect(lyrics),
        progress: toRect(progress),
        controlsRow: toRect(controlsRow),
        volInline: toRect(volInline),
        playControls: toRect(playControls),
        gearBtn: toRect(gearBtn),
        deckGapFromLyrics: progress && lyrics ? Math.round(progress.getBoundingClientRect().top - lyrics.getBoundingClientRect().bottom) : null,
        titleToProgressTopDiff: title && progress ? Math.round(progress.getBoundingClientRect().top - title.getBoundingClientRect().top) : null,
        artistToControlsTopDiff: artist && controlsRow ? Math.round(controlsRow.getBoundingClientRect().top - artist.getBoundingClientRect().top) : null,
      };
    })()
  `);

  console.log('[Layout Alignment Metrics]:', JSON.stringify(metrics, null, 2));

  // 2. Capture Closed State (Option A: inline volume on deck at rest, tightened 244px height)
  await captureWindow('compact_deck_option_a_aligned.png');

  // 3. Trigger hover on volume control to verify horizontal expand
  await win.webContents.executeJavaScript(`
    (() => {
      const vol = document.querySelector('.np__volume-inline');
      if (vol) {
        vol.classList.add('is-dragging'); // keeps expanded for clean capture
      }
    })()
  `);
  await wait(300);
  await captureWindow('volume_hover_expanded.png');

  // Revert hover expand
  await win.webContents.executeJavaScript(`
    (() => {
      const vol = document.querySelector('.np__volume-inline');
      if (vol) {
        vol.classList.remove('is-dragging');
      }
    })()
  `);
  await wait(200);

  // 4. Open Player Settings Popover by clicking gear button
  const gearClicked = await win.webContents.executeJavaScript(`
    (() => {
      const btn = document.querySelector('.np__tab-pill--gear');
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    })()
  `);
  console.log('Gear button clicked:', gearClicked);

  // Wait 450ms for Framer Motion spring to settle
  await wait(500);

  // 5. Capture Open State (Apple Liquid glass popover with Liquid Aura selector)
  await captureWindow('player_settings_liquid_glass.png');

  // 6. Test Pause Playback (Verifies Island stays completely visible and does NOT crash/disappear)
  await win.webContents.executeJavaScript(`
    (() => {
      // Close settings popover
      const btn = document.querySelector('.np__tab-pill--gear');
      if (btn) btn.click();
      
      // Click pause button
      const playBtn = document.querySelector('.play-btn--compact');
      if (playBtn) playBtn.click();
    })()
  `);
  await wait(500);

  const isStillVisible = await win.webContents.executeJavaScript(`
    (() => {
      const island = document.querySelector('.island--notch') || document.querySelector('.island');
      const controls = document.querySelector('.np__controls-row');
      return {
        islandPresent: Boolean(island),
        controlsPresent: Boolean(controls),
        islandHeight: island ? island.getBoundingClientRect().height : 0
      };
    })()
  `);
  console.log('[Pause Verification]:', isStillVisible);
  await captureWindow('compact_deck_paused_verified.png');

  // 7. Verify switching Liquid Aura to "Off" restores classic blurred album art backdrop
  await win.webContents.executeJavaScript(`
    (() => {
      // Re-open settings popover
      const gearBtn = document.querySelector('.np__tab-pill--gear');
      if (gearBtn) gearBtn.click();
    })()
  `);
  await wait(400);

  await win.webContents.executeJavaScript(`
    (() => {
      // Click 'Off' pill in Liquid Aura section
      const pills = Array.from(document.querySelectorAll('.lsp__pill-btn'));
      const offPill = pills.find(p => p.textContent.trim().toLowerCase() === 'off');
      if (offPill) offPill.click();

      // Close popover
      const gearBtn = document.querySelector('.np__tab-pill--gear');
      if (gearBtn) gearBtn.click();
    })()
  `);
  await wait(400);
  await captureWindow('metaballs_switched_off_classic_aura.png');

  app.quit();
});
