const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { computeNotchPosition, NOTCH_WIN_W, NOTCH_WIN_H } = require('../../electron/notch-geometry');

const ARTIFACT_DIR = path.resolve('C:/Users/harsh/.gemini/antigravity/brain/00486437-adb7-44d3-9fef-0bfc4c041cc3');
const PRELOAD_PATH = path.resolve(__dirname, '../../electron/preload.js');

app.whenReady().then(async () => {
  console.log('[HOTFIX HARNESS] Launching Electron Hotfix Verification...');

  let activeFrostedColor = '#d35400'; // Album red for Borderline
  let activeAppearance = 'dynamic_frosted';
  let currentVol = 75;
  let currentMuted = false;
  let mockSchedule = [];

  let currentMedia = {
    active: true,
    status: 'playing',
    title: 'Borderline',
    artist: 'Tame Impala',
    album: 'The Slow Rush',
    art: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="%23d35400"/><circle cx="50" cy="50" r="30" fill="%23e67e22"/></svg>',
    isPlaying: true,
    durationMs: 237000,
    positionMs: 84000,
  };

  ipcMain.handle('window:is-maximized', () => false);
  ipcMain.handle('window:get-dynamic-frosted-color', () => activeFrostedColor);
  ipcMain.handle('settings:get-appearance-mode', () => activeAppearance);
  ipcMain.handle('island:get-appearance', () => activeAppearance);
  ipcMain.handle('state:get', () => ({
    schedule: mockSchedule,
    inbox: [],
    rings: [],
    media: currentMedia,
    playbackState: currentMedia.status === 'playing' ? 'PLAYING' : 'PAUSED',
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

  // Authoritative media control handler
  const handleMediaControl = (action) => {
    console.log('[HOTFIX HARNESS] Received media control action:', action);
    if (action === 'playpause' || action === 'play-pause' || action === 'playPause') {
      const nextPlaying = currentMedia.status !== 'playing';
      currentMedia = {
        ...currentMedia,
        status: nextPlaying ? 'playing' : 'paused',
        isPlaying: nextPlaying,
      };
      if (win) {
        win.webContents.send('media', currentMedia);
      }
      return true;
    }
    return true;
  };
  ipcMain.on('media:control', (_e, action) => handleMediaControl(action));
  ipcMain.handle('media:control', (_e, action) => handleMediaControl(action));

  // Scheduler IPC handlers
  ipcMain.handle('scheduler:add-timer', (_e, t) => { mockSchedule.push(t); return t; });
  ipcMain.handle('scheduler:add-alarm', (_e, a) => { mockSchedule.push(a); return a; });
  ipcMain.handle('scheduler:remove', (_e, id) => { mockSchedule = mockSchedule.filter(x => x.id !== id); return true; });
  ipcMain.handle('scheduler:set-enabled', (_e, id, en) => { mockSchedule = mockSchedule.map(x => x.id === id ? { ...x, enabled: en } : x); return true; });

  const primary = screen.getPrimaryDisplay();
  const placement = computeNotchPosition({
    display: primary,
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
    show: false,
  });

  win.webContents.on('console-message', (_e, _level, message) => {
    console.log('[Renderer Log]', message);
  });

  await win.loadFile(path.resolve(__dirname, '../../dist/index.html'));
  win.show();
  await new Promise((r) => setTimeout(r, 600));

  const results = {};

  async function captureNotch(filename, label) {
    await new Promise((r) => setTimeout(r, 350));
    const bounds = await win.webContents.executeJavaScript(`
      (() => {
        const el = document.querySelector('.island--notch') || document.querySelector('.island');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return {
          x: Math.max(0, Math.floor(r.left - 12)),
          y: Math.max(0, Math.floor(r.top)),
          width: Math.min(Math.ceil(r.width + 24), ${placement.width}),
          height: Math.min(Math.ceil(r.height + 24), ${placement.height}),
          renderedWidth: Math.round(r.width),
          renderedHeight: Math.round(r.height),
          backgroundColor: style.backgroundColor,
          borderBottomLeftRadius: style.borderBottomLeftRadius,
          borderBottomRightRadius: style.borderBottomRightRadius,
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
    console.log(`[Captured] ${label} -> ${filename} (${bounds ? `${bounds.renderedWidth}x${bounds.renderedHeight}px` : 'full'})`);
    return bounds;
  }

  // -----------------------------------------------------------------
  // SCENARIO A: Music playing — Pause icon visible in Utilities
  // -----------------------------------------------------------------
  console.log('[Scenario A] Music playing (Borderline / Tame Impala) — Pause icon visible...');
  activeFrostedColor = '#d35400';
  currentMedia = {
    active: true,
    status: 'playing',
    title: 'Borderline',
    artist: 'Tame Impala',
    album: 'The Slow Rush',
    art: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="%23d35400"/><circle cx="50" cy="50" r="30" fill="%23e67e22"/></svg>',
    isPlaying: true,
    durationMs: 237000,
    positionMs: 84000,
  };
  win.webContents.send('media', currentMedia);
  win.webContents.send('hub:open', 'launcher');
  await new Promise((r) => setTimeout(r, 450));

  const scenarioAState = await win.webContents.executeJavaScript(`
    (() => {
      const btn = document.querySelector('.utilities-np__ctrl-btn--play');
      const hasPauseIcon = btn && btn.querySelector('rect') !== null;
      const hasPlayIcon = btn && btn.querySelector('path') !== null;
      return {
        title: btn ? btn.getAttribute('title') : null,
        ariaLabel: btn ? btn.getAttribute('aria-label') : null,
        hasPauseIcon,
        hasPlayIcon,
      };
    })()
  `);
  console.log('[Scenario A State]', scenarioAState);
  results.scenarioA = await captureNotch('gate_b_hotfix_a_music_playing_pause.png', 'A. Music Playing (Pause Icon Visible)');
  results.scenarioA.state = scenarioAState;

  // -----------------------------------------------------------------
  // SCENARIO B: Music paused — Play icon visible in Utilities
  // -----------------------------------------------------------------
  console.log('[Scenario B] Trigger pause via button click and verify Play icon appears...');
  await win.webContents.executeJavaScript(`
    (() => {
      const btn = document.querySelector('.utilities-np__ctrl-btn--play');
      if (btn) btn.click();
    })()
  `);
  await new Promise((r) => setTimeout(r, 500));

  const scenarioBState = await win.webContents.executeJavaScript(`
    (() => {
      const btn = document.querySelector('.utilities-np__ctrl-btn--play');
      const hasPauseIcon = btn && btn.querySelector('rect') !== null;
      const hasPlayIcon = btn && btn.querySelector('path') !== null;
      return {
        title: btn ? btn.getAttribute('title') : null,
        ariaLabel: btn ? btn.getAttribute('aria-label') : null,
        hasPauseIcon,
        hasPlayIcon,
      };
    })()
  `);
  console.log('[Scenario B State]', scenarioBState);
  results.scenarioB = await captureNotch('gate_b_hotfix_b_music_paused_play.png', 'B. Music Paused (Play Icon Visible)');
  results.scenarioB.state = scenarioBState;

  // -----------------------------------------------------------------
  // SCENARIO C: Dynamic Frosted Utilities with album-reactive tiles
  // -----------------------------------------------------------------
  console.log('[Scenario C] Resume playback to show Dynamic Frosted with album-reactive tiles...');
  await win.webContents.executeJavaScript(`
    (() => {
      const btn = document.querySelector('.utilities-np__ctrl-btn--play');
      if (btn) btn.click();
    })()
  `);
  await new Promise((r) => setTimeout(r, 500));

  const scenarioCStyles = await win.webContents.executeJavaScript(`
    (() => {
      const tile = document.querySelector('.utility-tile');
      const np = document.querySelector('.utilities-now-playing');
      const island = document.querySelector('.island--notch');
      return {
        tileBg: tile ? window.getComputedStyle(tile).backgroundColor : null,
        tileBackdrop: tile ? window.getComputedStyle(tile).backdropFilter : null,
        tileBorder: tile ? window.getComputedStyle(tile).borderColor : null,
        npBg: np ? window.getComputedStyle(np).backgroundColor : null,
        npBackdrop: np ? window.getComputedStyle(np).backdropFilter : null,
        islandBg: island ? window.getComputedStyle(island).backgroundColor : null,
        islandClasses: island ? island.className : null,
      };
    })()
  `);
  console.log('[Scenario C Styles]', scenarioCStyles);
  results.scenarioC = await captureNotch('gate_b_hotfix_c_dynamic_frosted_tiles.png', 'C. Dynamic Frosted (Album-Reactive Tiles)');
  results.scenarioC.styles = scenarioCStyles;

  // -----------------------------------------------------------------
  // SCENARIO D: No track — pitch-black Utilities with natural dark tiles
  // -----------------------------------------------------------------
  console.log('[Scenario D] Clear media track — pitch-black Utilities...');
  currentMedia = { active: false };
  win.webContents.send('media', currentMedia);
  win.webContents.send('hub:open', 'launcher');
  await new Promise((r) => setTimeout(r, 500));

  const scenarioDStyles = await win.webContents.executeJavaScript(`
    (() => {
      const island = document.querySelector('.island--notch');
      const tile = document.querySelector('.utility-tile');
      const np = document.querySelector('.utilities-now-playing');
      return {
        isPitchBlack: island ? island.classList.contains('is-pitch-black') : false,
        islandBg: island ? window.getComputedStyle(island).backgroundColor : null,
        tileBg: tile ? window.getComputedStyle(tile).backgroundColor : null,
        hasNowPlaying: np !== null,
      };
    })()
  `);
  console.log('[Scenario D Styles]', scenarioDStyles);
  results.scenarioD = await captureNotch('gate_b_hotfix_d_pitch_black_utilities.png', 'D. Pitch-Black Utilities (No Track)');
  results.scenarioD.styles = scenarioDStyles;

  // -----------------------------------------------------------------
  // SCENARIO E: Utilities root screen showing 'Little Island' title without chevron
  // -----------------------------------------------------------------
  console.log('[Scenario E] Verify Utilities root has NO chevron...');
  const scenarioEHeader = await win.webContents.executeJavaScript(`
    (() => {
      const headerLeft = document.querySelector('.utilities-header__left');
      const title = document.querySelector('.utilities-header__title');
      const chevrons = headerLeft ? headerLeft.querySelectorAll('svg') : [];
      const buttons = headerLeft ? headerLeft.querySelectorAll('button') : [];
      return {
        titleText: title ? title.textContent.trim() : null,
        chevronCount: chevrons.length,
        buttonCount: buttons.length,
      };
    })()
  `);
  console.log('[Scenario E Header Check]', scenarioEHeader);
  results.scenarioE = await captureNotch('gate_b_hotfix_e_root_no_chevron.png', 'E. Root Utilities (No Chevron Beside Title)');
  results.scenarioE.header = scenarioEHeader;

  // -----------------------------------------------------------------
  // SCENARIO F: Timer detail screen showing left-pointing back arrow
  // -----------------------------------------------------------------
  console.log('[Scenario F] Navigate into Timer detail screen and verify left-pointing back arrow...');
  await win.webContents.executeJavaScript(`
    (() => {
      const timerTile = Array.from(document.querySelectorAll('.utility-tile')).find(t => t.textContent.includes('Timer'));
      if (timerTile) timerTile.click();
    })()
  `);
  await new Promise((r) => setTimeout(r, 500));

  const scenarioFBack = await win.webContents.executeJavaScript(`
    (() => {
      const backBtn = document.querySelector('.utilities-back-btn') || document.querySelector('.utility-surface__back');
      const path = backBtn ? backBtn.querySelector('path') : null;
      const title = document.querySelector('.utilities-header__title');
      return {
        hasBackBtn: backBtn !== null,
        pathD: path ? path.getAttribute('d') : null,
        titleText: title ? title.textContent.trim() : null,
      };
    })()
  `);
  console.log('[Scenario F Back Button Check]', scenarioFBack);
  results.scenarioF = await captureNotch('gate_b_hotfix_f_timer_back_arrow.png', 'F. Timer Detail (Left Back Arrow)');
  results.scenarioF.back = scenarioFBack;

  // Save metrics
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'gate_b_hotfix_measured_metrics.json'), JSON.stringify(results, null, 2));
  console.log('[HOTFIX HARNESS] All 6 scenarios successfully executed and captured!');

  setTimeout(() => {
    win.destroy();
    app.quit();
  }, 400);
});
