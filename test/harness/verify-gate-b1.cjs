const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { computeNotchPosition, NOTCH_WIN_W, NOTCH_WIN_H } = require('../../electron/notch-geometry');

const ARTIFACT_DIR = path.resolve('C:/Users/harsh/.gemini/antigravity/brain/00486437-adb7-44d3-9fef-0bfc4c041cc3');
const PRELOAD_PATH = path.resolve(__dirname, '../../electron/preload.js');

app.whenReady().then(async () => {
  console.log('[VERIFY GATE B.1] Launching Electron Verification Harness...');

  let activeFrostedColor = '#d35400';
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
    canSeek: true,
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
    console.log('[VERIFY GATE B.1] Received media control action:', action);
    if (action === 'playpause' || action === 'play-pause' || action === 'playPause') {
      const nextPlaying = currentMedia.status !== 'playing';
      currentMedia = {
        ...currentMedia,
        status: nextPlaying ? 'playing' : 'paused',
        isPlaying: nextPlaying,
      };
      if (win) win.webContents.send('media', currentMedia);
      return true;
    }
    return true;
  };
  ipcMain.on('media:control', (_e, action) => handleMediaControl(action));
  ipcMain.handle('media:control', (_e, action) => handleMediaControl(action));

  // Scheduler IPC handlers
  ipcMain.handle('scheduler:add-timer', (_e, t) => {
    const item = { ...t, id: `timer-${Date.now()}`, kind: 'timer', fireAt: Date.now() + (t.durationMs || 300000) };
    mockSchedule.push(item);
    if (win) win.webContents.send('scheduler:state', mockSchedule);
    return item;
  });
  ipcMain.handle('scheduler:add-alarm', (_e, a) => {
    const item = { ...a, id: `alarm-${Date.now()}`, kind: 'alarm' };
    mockSchedule.push(item);
    if (win) win.webContents.send('scheduler:state', mockSchedule);
    return item;
  });
  ipcMain.handle('scheduler:remove', (_e, id) => {
    mockSchedule = mockSchedule.filter((x) => x.id !== id);
    if (win) win.webContents.send('scheduler:state', mockSchedule);
    return true;
  });
  ipcMain.handle('scheduler:set-enabled', (_e, id, en) => {
    mockSchedule = mockSchedule.map((x) => (x.id === id ? { ...x, enabled: en } : x));
    if (win) win.webContents.send('scheduler:state', mockSchedule);
    return true;
  });

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

  async function captureNotch(filename, label, delayMs = 350) {
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
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

  // =================================================================
  // SCENARIO E: Idle pitch-black notch
  // =================================================================
  console.log('[Scenario E] Idle pitch-black notch...');
  win.webContents.send('media', { active: false });
  win.webContents.send('scheduler:state', []);
  await win.webContents.executeJavaScript(`
    (() => {
      const btn = document.querySelector('.expanded-music__eyes-btn') || document.querySelector('.utilities-eyes-btn');
      if (btn) btn.click();
    })()
  `);
  results.scenarioE = await captureNotch('gate_b1_e_idle_notch.png', 'E. Idle Pitch-Black Notch');

  // =================================================================
  // SCENARIO A: Utilities -> Timer -> Utilities (Start, Midpoint, Completion)
  // =================================================================
  console.log('[Scenario A1] Utilities Root Grid (Start)...');
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
    canSeek: true,
  };
  win.webContents.send('media', currentMedia);
  win.webContents.send('scheduler:state', []);
  win.webContents.send('hub:open', 'launcher');
  await new Promise((r) => setTimeout(r, 450));
  results.scenarioA1 = await captureNotch('gate_b1_a1_utilities_root.png', 'A1. Utilities Root (Start of Morph)');

  console.log('[Scenario A2] Trigger morph and capture Midpoint...');
  // Trigger click on Timer tile
  await win.webContents.executeJavaScript(`
    (() => {
      const timerTile = Array.from(document.querySelectorAll('.utility-tile')).find(t => t.textContent.includes('Timer'));
      if (timerTile) timerTile.click();
    })()
  `);
  // Capture at 120ms (morph duration is 300ms, midpoint is ~120-150ms)
  results.scenarioA2 = await captureNotch('gate_b1_a2_timer_morph_mid.png', 'A2. Timer Morph (Midpoint)', 130);

  console.log('[Scenario A3] Capture Complete Timer Morph...');
  results.scenarioA3 = await captureNotch('gate_b1_a3_timer_morph_complete.png', 'A3. Timer Morph (Completion)', 300);

  console.log('[Scenario A4] Click back arrow and reverse morph to Utilities...');
  await win.webContents.executeJavaScript(`
    (() => {
      const backBtn = document.querySelector('.utilities-back-btn') || document.querySelector('.utility-surface__back');
      if (backBtn) backBtn.click();
    })()
  `);
  results.scenarioA4 = await captureNotch('gate_b1_a4_back_to_utilities.png', 'A4. Reverse Morph (Back to Utilities Grid)', 400);

  // =================================================================
  // SCENARIO B: Utilities -> Weather -> Utilities
  // =================================================================
  console.log('[Scenario B] Weather utility detail morph...');
  await win.webContents.executeJavaScript(`
    (() => {
      const weatherTile = Array.from(document.querySelectorAll('.utility-tile')).find(t => t.textContent.includes('Weather'));
      if (weatherTile) weatherTile.click();
    })()
  `);
  results.scenarioB = await captureNotch('gate_b1_b_weather_morph.png', 'B. Weather Utility Morph', 400);

  // Return to root
  await win.webContents.executeJavaScript(`
    (() => {
      const backBtn = document.querySelector('.utilities-back-btn') || document.querySelector('.utility-surface__back');
      if (backBtn) backBtn.click();
    })()
  `);
  await new Promise((r) => setTimeout(r, 300));

  // =================================================================
  // SCENARIO D: Rapid navigation to Quick Controls
  // =================================================================
  console.log('[Scenario D] Rapid navigation to Quick Controls...');
  await win.webContents.executeJavaScript(`
    (() => {
      const ctrlTile = Array.from(document.querySelectorAll('.utility-tile')).find(t => t.textContent.includes('Quick Controls') || t.textContent.includes('Controls'));
      if (ctrlTile) ctrlTile.click();
    })()
  `);
  results.scenarioD = await captureNotch('gate_b1_d_rapid_navigation.png', 'D. Rapid Navigation (Quick Controls)', 350);

  // Return to root
  await win.webContents.executeJavaScript(`
    (() => {
      const backBtn = document.querySelector('.utilities-back-btn') || document.querySelector('.utility-surface__back');
      if (backBtn) backBtn.click();
    })()
  `);
  await new Promise((r) => setTimeout(r, 300));

  // =================================================================
  // SCENARIO F: Proper iOS-like Wheel Picker in Timer
  // =================================================================
  console.log('[Scenario F] Proper iOS-like Wheel Picker (HH:MM:SS)...');
  await win.webContents.executeJavaScript(`
    (() => {
      const timerTile = Array.from(document.querySelectorAll('.utility-tile')).find(t => t.textContent.includes('Timer'));
      if (timerTile) timerTile.click();
    })()
  `);
  await new Promise((r) => setTimeout(r, 400));
  const wheelInfo = await win.webContents.executeJavaScript(`
    (() => {
      const wheels = document.querySelectorAll('[data-rwp]');
      const highlight = document.querySelector('[data-rwp-highlight-wrapper]');
      const labels = Array.from(document.querySelectorAll('.timer-wheel-label')).map(l => l.textContent);
      return {
        wheelCount: wheels.length,
        hasHighlight: highlight !== null,
        labels,
      };
    })()
  `);
  console.log('[Wheel Info]', wheelInfo);
  results.scenarioF = await captureNotch('gate_b1_f_timer_wheel_picker.png', 'F. iOS Wheel Picker (3 Cylinders)', 200);
  results.scenarioF.wheelInfo = wheelInfo;

  // =================================================================
  // SCENARIO C: Countdown <-> Alarms smooth mode transition
  // =================================================================
  console.log('[Scenario C1] Countdown Mode...');
  results.scenarioC1 = await captureNotch('gate_b1_c1_countdown_mode.png', 'C1. Countdown Mode Segment', 100);

  console.log('[Scenario C2] Switch to Alarms Mode...');
  await win.webContents.executeJavaScript(`
    (() => {
      const alarmsBtn = Array.from(document.querySelectorAll('.clock-segmented__btn')).find(b => b.textContent.includes('Alarms'));
      if (alarmsBtn) alarmsBtn.click();
    })()
  `);
  results.scenarioC2 = await captureNotch('gate_b1_c2_alarms_mode.png', 'C2. Alarms Mode Segment', 300);

  // Return to countdown
  await win.webContents.executeJavaScript(`
    (() => {
      const cdBtn = Array.from(document.querySelectorAll('.clock-segmented__btn')).find(b => b.textContent.includes('Countdown'));
      if (cdBtn) cdBtn.click();
    })()
  `);
  await new Promise((r) => setTimeout(r, 300));

  // =================================================================
  // SCENARIO G: Timer running with animated Rolling Digits
  // =================================================================
  console.log('[Scenario G] Start timer and capture Rolling Digits countdown...');
  const now = Date.now();
  const testTimer = {
    id: 'test-timer-live',
    kind: 'timer',
    label: 'Focus Timer',
    createdAt: now,
    fireAt: now + 14 * 60 * 1000 + 45 * 1000,
    durationMs: 15 * 60 * 1000,
  };
  mockSchedule = [testTimer];
  win.webContents.send('scheduler:state', mockSchedule);
  await new Promise((r) => setTimeout(r, 400));
  const rollingDigitsInfo = await win.webContents.executeJavaScript(`
    (() => {
      const display = document.querySelector('.rolling-time-display');
      const digits = document.querySelectorAll('.rolling-digit-box');
      return {
        hasRollingDisplay: display !== null,
        digitBoxCount: digits.length,
        text: display ? display.textContent.trim() : null,
      };
    })()
  `);
  console.log('[Rolling Digits Info]', rollingDigitsInfo);
  results.scenarioG = await captureNotch('gate_b1_g_timer_running_rolling_digits.png', 'G. Running Timer (Rolling Digits)', 200);
  results.scenarioG.rollingDigitsInfo = rollingDigitsInfo;

  // Clear timers
  mockSchedule = [];
  win.webContents.send('scheduler:state', mockSchedule);

  // =================================================================
  // SCENARIO H: Expanded Music with SHORT title (Centered beneath cover)
  // =================================================================
  console.log('[Scenario H] Expanded Music with Short Title (Borderline / Tame Impala)...');
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
    canSeek: true,
  };
  win.webContents.send('media', currentMedia);
  win.webContents.send('hub:open', 'playing');
  await new Promise((r) => setTimeout(r, 500));

  const shortTitleAlign = await win.webContents.executeJavaScript(`
    (() => {
      const title = document.querySelector('.np__title--expanded');
      const artist = document.querySelector('.np__artist--expanded');
      return {
        titleClass: title ? title.className : null,
        titleJustify: title ? window.getComputedStyle(title).justifyContent : null,
        isTitleCentered: title ? title.classList.contains('is-centered') : false,
        artistJustify: artist ? window.getComputedStyle(artist).justifyContent : null,
        isArtistCentered: artist ? artist.classList.contains('is-centered') : false,
      };
    })()
  `);
  console.log('[Short Title Alignment]', shortTitleAlign);
  results.scenarioH = await captureNotch('gate_b1_h_expanded_music_short_title.png', 'H. Short Title Centered', 250);
  results.scenarioH.alignment = shortTitleAlign;

  // =================================================================
  // SCENARIO I: Expanded Music with LONG title (Left-aligned + Marquee)
  // =================================================================
  console.log('[Scenario I] Expanded Music with Long Title...');
  currentMedia = {
    active: true,
    status: 'playing',
    title: 'The Less I Know The Better (Live from Spotify Studios NYC)',
    artist: 'Tame Impala with Orchestra and Chorus Ensemble',
    album: 'Currents (Collector Edition)',
    art: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="%236366f1"/><circle cx="50" cy="50" r="30" fill="%23a855f7"/></svg>',
    isPlaying: true,
    durationMs: 315000,
    positionMs: 120000,
    canSeek: true,
  };
  win.webContents.send('media', currentMedia);
  await new Promise((r) => setTimeout(r, 500));

  const longTitleAlign = await win.webContents.executeJavaScript(`
    (() => {
      const title = document.querySelector('.np__title--expanded');
      const titleContent = title ? title.querySelector('.marquee-content') : null;
      const artist = document.querySelector('.np__artist--expanded');
      const artistContent = artist ? artist.querySelector('.marquee-content') : null;
      return {
        hasTitleOverflow: title ? title.classList.contains('has-overflow') : false,
        isTitleMarquee: titleContent ? titleContent.classList.contains('is-marquee') : false,
        titleJustify: title ? window.getComputedStyle(title).justifyContent : null,
        hasArtistOverflow: artist ? artist.classList.contains('has-overflow') : false,
        isArtistMarquee: artistContent ? artistContent.classList.contains('is-marquee') : false,
        artistJustify: artist ? window.getComputedStyle(artist).justifyContent : null,
      };
    })()
  `);
  console.log('[Long Title Marquee]', longTitleAlign);
  results.scenarioI = await captureNotch('gate_b1_i_expanded_music_long_title.png', 'I. Long Title Marquee', 300);
  results.scenarioI.marquee = longTitleAlign;

  // =================================================================
  // SCENARIO J: Expanded Music Centered Playback Controls Cluster
  // =================================================================
  console.log('[Scenario J] Expanded Music Centered Playback Controls Cluster...');
  const controlsCheck = await win.webContents.executeJavaScript(`
    (() => {
      const container = document.querySelector('.np__controls--left-aligned');
      const buttons = container ? container.querySelectorAll('button') : [];
      const playBtn = container ? container.querySelector('.play-btn--compact') : null;
      const prevBtn = buttons.length > 0 ? buttons[0] : null;
      const cStyle = container ? window.getComputedStyle(container) : null;
      const playStyle = playBtn ? window.getComputedStyle(playBtn) : null;
      const prevStyle = prevBtn ? window.getComputedStyle(prevBtn) : null;
      return {
        buttonCount: buttons.length,
        justifyContent: cStyle ? cStyle.justifyContent : null,
        gap: cStyle ? cStyle.gap : null,
        playBtnWidth: playStyle ? playStyle.width : null,
        playBtnHeight: playStyle ? playStyle.height : null,
        secBtnWidth: prevStyle ? prevStyle.width : null,
        secBtnHeight: prevStyle ? prevStyle.height : null,
      };
    })()
  `);
  console.log('[Controls Check]', controlsCheck);
  results.scenarioJ = await captureNotch('gate_b1_j_music_centered_controls.png', 'J. Centered Playback Controls Cluster', 200);
  results.scenarioJ.controls = controlsCheck;

  // Save all layout metrics
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'gate_b1_measured_metrics.json'), JSON.stringify(results, null, 2));
  console.log('[VERIFY GATE B.1] All scenarios successfully captured and measured!');

  setTimeout(() => {
    win.destroy();
    app.quit();
  }, 400);
});

