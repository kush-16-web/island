const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { computeNotchPosition, NOTCH_WIN_W, NOTCH_WIN_H } = require('../../electron/notch-geometry');

const ARTIFACT_DIR = path.resolve('C:/Users/harsh/.gemini/antigravity/brain/00486437-adb7-44d3-9fef-0bfc4c041cc3');
const PRELOAD_PATH = path.resolve(__dirname, '../../electron/preload.js');

app.whenReady().then(async () => {
  console.log('[VERIFY GATE B] Launching Electron Verification Harness...');

  let activeFrostedColor = '#d35400';
  let activeAppearance = 'dynamic_frosted';
  let currentVol = 75;
  let currentMuted = false;
  let mockSchedule = [];

  ipcMain.handle('window:is-maximized', () => false);
  ipcMain.handle('window:get-dynamic-frosted-color', () => activeFrostedColor);
  ipcMain.handle('settings:get-appearance-mode', () => activeAppearance);
  ipcMain.handle('island:get-appearance', () => activeAppearance);
  ipcMain.handle('state:get', () => ({ schedule: mockSchedule, inbox: [], rings: [], media: { active: false } }));
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

  // Scheduler IPC handlers
  ipcMain.handle('scheduler:add-timer', (_e, t) => {
    mockSchedule.push(t);
    return t;
  });
  ipcMain.handle('scheduler:add-alarm', (_e, a) => {
    mockSchedule.push(a);
    return a;
  });
  ipcMain.handle('scheduler:remove', (_e, id) => {
    mockSchedule = mockSchedule.filter(x => x.id !== id);
    return true;
  });
  ipcMain.handle('scheduler:set-enabled', (_e, id, en) => {
    mockSchedule = mockSchedule.map(x => x.id === id ? { ...x, enabled: en } : x);
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

  // Helper to capture a named crop of the notch
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
    console.log(`[Captured] ${label} -> ${filename} (${bounds ? `${bounds.renderedWidth}x${bounds.renderedHeight}px, bg: ${bounds.backgroundColor}` : 'full'})`);
    return bounds;
  }

  // -----------------------------------------------------------------
  // 1. Idle Pitch-Black Notch
  // -----------------------------------------------------------------
  console.log('Capturing Scenario 1: Idle pitch-black notch...');
  win.webContents.send('media', { active: false });
  win.webContents.send('scheduler:state', []);
  // Click Companion Eyes to minimize if open
  await win.webContents.executeJavaScript(`
    (() => {
      const btn = document.querySelector('.expanded-music__eyes-btn') || document.querySelector('.utilities-eyes-btn');
      if (btn) btn.click();
    })()
  `);
  await new Promise((r) => setTimeout(r, 300));
  results.idle = await captureNotch('gate_b_1_idle_pitch_black.png', '1. Idle Pitch-Black Notch');

  // -----------------------------------------------------------------
  // 2. Idle Utilities Grid (No Music, Pure #000000)
  // -----------------------------------------------------------------
  console.log('Capturing Scenario 2: Idle Utilities grid with no music...');
  win.webContents.send('media', { active: false });
  win.webContents.send('scheduler:state', []);
  win.webContents.send('hub:open', 'launcher');
  await new Promise((r) => setTimeout(r, 400));
  results.utilitiesNoMusic = await captureNotch('gate_b_2_utilities_no_music.png', '2. Utilities Grid (No Music, Pitch Black)');

  // -----------------------------------------------------------------
  // 3. Utilities Grid with Active Music (Now Playing widget + Dynamic Frosted)
  // -----------------------------------------------------------------
  console.log('Capturing Scenario 3: Utilities grid with active music...');
  activeFrostedColor = '#d35400';
  const track1 = {
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
  win.webContents.send('media', track1);
  win.webContents.send('hub:open', 'launcher');
  await new Promise((r) => setTimeout(r, 400));
  results.utilitiesWithMusic = await captureNotch('gate_b_3_utilities_active_music.png', '3. Utilities Grid with Active Music');

  // -----------------------------------------------------------------
  // 4. Timer Countdown Picker (HH:MM:SS spinners + presets)
  // -----------------------------------------------------------------
  console.log('Capturing Scenario 4: Timer countdown picker...');
  win.webContents.send('media', { active: false });
  win.webContents.send('scheduler:state', []);
  win.webContents.send('hub:open', 'clock');
  await new Promise((r) => setTimeout(r, 400));
  // Ensure we are in Countdown mode
  await win.webContents.executeJavaScript(`
    (() => {
      const countdownBtn = Array.from(document.querySelectorAll('.clock-segmented__btn')).find(b => b.textContent.includes('Countdown'));
      if (countdownBtn) countdownBtn.click();
    })()
  `);
  results.timerPicker = await captureNotch('gate_b_4_timer_countdown_picker.png', '4. Timer Countdown Picker');

  // -----------------------------------------------------------------
  // 5. Running Countdown View
  // -----------------------------------------------------------------
  console.log('Capturing Scenario 5: Running countdown view...');
  const now = Date.now();
  const activeTimer = {
    id: 'test-timer-1',
    kind: 'timer',
    label: 'Focus Timer',
    createdAt: now,
    fireAt: now + 14 * 60 * 1000 + 42 * 1000,
    durationMs: 15 * 60 * 1000,
  };
  win.webContents.send('scheduler:state', [activeTimer]);
  win.webContents.send('hub:open', 'clock');
  await new Promise((r) => setTimeout(r, 400));
  results.countdownRunning = await captureNotch('gate_b_5_countdown_running.png', '5. Running Countdown');

  // -----------------------------------------------------------------
  // 6. Paused Countdown View
  // -----------------------------------------------------------------
  console.log('Capturing Scenario 6: Paused countdown view...');
  await win.webContents.executeJavaScript(`
    (() => {
      const pauseBtn = Array.from(document.querySelectorAll('.clock-btn')).find(b => b.textContent.includes('Pause'));
      if (pauseBtn) pauseBtn.click();
    })()
  `);
  await new Promise((r) => setTimeout(r, 300));
  results.countdownPaused = await captureNotch('gate_b_6_countdown_paused.png', '6. Paused Countdown');

  // -----------------------------------------------------------------
  // 7. Alarms List View
  // -----------------------------------------------------------------
  console.log('Capturing Scenario 7: Alarms list view...');
  const alarms = [
    {
      id: 'alarm-1',
      kind: 'alarm',
      label: 'Morning Standup',
      time: '09:00',
      days: [1, 2, 3, 4, 5],
      enabled: true,
      fireAt: now + 3600000,
    },
    {
      id: 'alarm-2',
      kind: 'alarm',
      label: 'Workout & Stretch',
      time: '07:30',
      days: [0, 6],
      enabled: false,
    },
    {
      id: 'alarm-3',
      kind: 'alarm',
      label: 'Island Sync Review',
      time: '14:15',
      days: [1, 3, 5],
      enabled: true,
      fireAt: now + 18000000,
    }
  ];
  win.webContents.send('scheduler:state', alarms);
  win.webContents.send('hub:open', 'clock');
  await new Promise((r) => setTimeout(r, 300));
  await win.webContents.executeJavaScript(`
    (() => {
      const alarmsBtn = Array.from(document.querySelectorAll('.clock-segmented__btn')).find(b => b.textContent.includes('Alarms'));
      if (alarmsBtn) alarmsBtn.click();
    })()
  `);
  await new Promise((r) => setTimeout(r, 300));
  results.alarmsList = await captureNotch('gate_b_7_alarms_list.png', '7. Alarms List');

  // -----------------------------------------------------------------
  // 8. Add Alarm Editor View
  // -----------------------------------------------------------------
  console.log('Capturing Scenario 8: Add Alarm editor view...');
  await win.webContents.executeJavaScript(`
    (() => {
      const addBtn = document.querySelector('.clock-add-alarm-btn') || Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Set an Alarm') || b.textContent.includes('New Alarm'));
      if (addBtn) addBtn.click();
    })()
  `);
  await new Promise((r) => setTimeout(r, 300));
  results.alarmEditor = await captureNotch('gate_b_8_alarm_add_editor.png', '8. Add Alarm Editor');

  // -----------------------------------------------------------------
  // 9. Dynamic Frosted Utilities with 2 Different Albums
  // -----------------------------------------------------------------
  console.log('Capturing Scenario 9: Dynamic Frosted Utilities with Album 2 (Teal)...');
  activeFrostedColor = '#008b8b';
  const track2 = {
    active: true,
    status: 'playing',
    title: 'Deep Ocean Blue',
    artist: 'Solar Fields',
    album: 'Origin',
    art: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="%23008b8b"/><circle cx="50" cy="50" r="30" fill="%2320b2aa"/></svg>',
    isPlaying: true,
    durationMs: 380000,
    positionMs: 120000,
  };
  win.webContents.send('media', track2);
  await new Promise((r) => setTimeout(r, 250));
  win.webContents.send('hub:open', 'launcher');
  await new Promise((r) => setTimeout(r, 600));
  results.dynamicFrostedAlbum2 = await captureNotch('gate_b_9_dynamic_frosted_album2.png', '9. Dynamic Frosted Utilities (Teal Album)');

  // -----------------------------------------------------------------
  // 10. Utilities Returning to Pitch Black after Track Clears
  // -----------------------------------------------------------------
  console.log('Capturing Scenario 10: Utilities returning to pitch black after track clears...');
  win.webContents.send('media', { active: false });
  win.webContents.send('scheduler:state', []);
  await new Promise((r) => setTimeout(r, 250));
  win.webContents.send('hub:open', 'launcher');
  await new Promise((r) => setTimeout(r, 600));
  results.utilitiesReturnBlack = await captureNotch('gate_b_10_utilities_return_pitch_black.png', '10. Utilities Returning to Pitch Black');

  // Save measured layout metrics
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'gate_b_measured_metrics.json'), JSON.stringify(results, null, 2));
  console.log('[VERIFY GATE B] All 10 screenshots captured and metrics saved successfully!');

  // Close harness cleanly
  setTimeout(() => {
    win.destroy();
    app.quit();
  }, 400);
});
