'use strict';

const crypto = require('crypto');
const fs = require('fs');
const https = require('https');
const path = require('path');
const { app, BrowserWindow, Menu, Tray, desktopCapturer, globalShortcut, ipcMain, nativeImage, screen, session, shell, systemPreferences } = require('electron');

function getSystemAccentColor() {
  if (process.platform !== 'win32' || !systemPreferences || !systemPreferences.getAccentColor) return null;
  try {
    const raw = systemPreferences.getAccentColor();
    if (!raw || typeof raw !== 'string') return null;
    const hex = raw.length >= 6 ? raw.slice(0, 6) : raw;
    return `#${hex}`;
  } catch {
    return null;
  }
}

// High-performance GPU compositing & tile memory management
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('force-gpu-mem-available-mb', '2048');
app.commandLine.appendSwitch('gpu-rasterization-msaa-sample-count', '0');

const { Store } = require('./store');
const { Scheduler } = require('./scheduler');
const { createNotifyServer, DEFAULT_PORT } = require('./notify-server');
const { MediaWatcher } = require('./media');
const { FullscreenWatcher } = require('./fullscreen');
const { RealtimeSessionBroker } = require('./realtime');
const { GeminiVoiceService } = require('./gemini');

let geminiVoiceService = null;

const DEV_URL = process.env.ISLAND_DEV_URL || '';
const WIN_W = 720;
const WIN_H = 500;
const PET_WIN_W = 190;
const PET_WIN_H = 175;
const INBOX_LIMIT = 100;
const HUB_SHORTCUT = 'CommandOrControl+Alt+Space';
const HUB_SHORTCUT_LABEL = 'Ctrl+Alt+Space';
const VOICE_SHORTCUT = 'CommandOrControl+Shift+Space';
const VOICE_SHORTCUT_LABEL = 'Ctrl+Shift+Space';

let win = null;
let petWin = null;
let tray = null;
let store = null;
let realtimeBroker = null;
let scheduler = null;
let media = null;
let notifyServer = null;
let notifyPort = DEFAULT_PORT;
let fullscreenWatcher = null;
let inbox = [];
let mediaState = { active: false };
let visible = true;

// ---------------------------------------------------------------- helpers

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  if (petWin && !petWin.isDestroyed()) petWin.webContents.send(channel, payload);
}

function trusted(event) {
  const url = event.senderFrame ? event.senderFrame.url : '';
  return url.startsWith('file://') || (DEV_URL !== '' && url.startsWith(DEV_URL));
}

function handle(channel, fn) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!trusted(event)) throw new Error('Untrusted sender');
    return fn(...args);
  });
}

function listen(channel, fn) {
  ipcMain.on(channel, (event, ...args) => {
    if (trusted(event)) fn(...args);
  });
}

function guard(fn) {
  try {
    return { ok: true, ...fn() };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function sanitizeInbox(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((n) => n && typeof n.id === 'string' && typeof n.title === 'string')
    .slice(0, INBOX_LIMIT)
    .map((n) => ({
      id: n.id,
      title: n.title.slice(0, 120),
      body: typeof n.body === 'string' ? n.body.slice(0, 400) : '',
      app: typeof n.app === 'string' ? n.app.slice(0, 40) : 'Notification',
      kind: ['info', 'success', 'warning', 'error'].includes(n.kind) ? n.kind : 'info',
      source: typeof n.source === 'string' ? n.source : 'api',
      ts: Number.isFinite(n.ts) ? n.ts : Date.now(),
      read: n.read === true,
    }));
}

// ---------------------------------------------------------------- inbox + notifications

function addToInbox({ title, body = '', app: appName = 'Notification', kind = 'info', source = 'api' }) {
  const entry = { id: crypto.randomUUID(), title, body, app: appName, kind, source, ts: Date.now(), read: false };
  inbox.unshift(entry);
  if (inbox.length > INBOX_LIMIT) inbox.length = INBOX_LIMIT;
  store.set('inbox', inbox);
  send('inbox:state', inbox);
  return entry;
}

function pushNotification(input) {
  const entry = addToInbox(input);
  send('notification', { ...entry, timeoutMs: input.timeoutMs || 5000 });
  return entry.id;
}

function setInbox(next) {
  inbox = next;
  store.set('inbox', inbox);
  send('inbox:state', inbox);
}

// ---------------------------------------------------------------- window

// ---------------------------------------------------------------- window & 4-edge docking

const PRESET_SNAP_THRESHOLD = 0.09;

function getDisplayForPoint(x, y) {
  if (Number.isFinite(x) && Number.isFinite(y)) {
    return screen.getDisplayNearestPoint({ x: Math.round(x), y: Math.round(y) });
  }
  return screen.getPrimaryDisplay();
}

function getSavedDock() {
  if (!store) return { edge: 'top', preset: 'center', align: 'center', offset: null, displayId: null };
  const saved = store.get('island_dock', null);
  if (saved && saved.edge) return saved;

  const oldX = store.get('window_x', null);
  const oldPreset = store.get('window_preset', 'center');
  return {
    edge: 'top',
    preset: oldPreset,
    align: oldPreset === 'left' ? 'left' : oldPreset === 'right' ? 'right' : 'center',
    offset: oldX,
    displayId: null,
  };
}

function computeDockPosition(dock) {
  const allDisplays = screen.getAllDisplays();
  const display = (dock.displayId && allDisplays.find((d) => d.id === dock.displayId)) || screen.getPrimaryDisplay();
  const { x: waX, y: waY, width: waW, height: waH } = display.workArea;

  const edge = dock.edge || 'top';
  const preset = dock.preset || 'center';
  let posX = waX + Math.round((waW - WIN_W) / 2);
  let posY = waY;
  let align = dock.align || 'center';

  if (edge === 'free') {
    const rawPillX = Number.isFinite(dock.pillX) ? dock.pillX : (Number.isFinite(dock.x) ? dock.x + WIN_W / 2 : waX + Math.round(waW / 2));
    const rawPillY = Number.isFinite(dock.pillY) ? dock.pillY : (Number.isFinite(dock.y) ? dock.y + WIN_H / 2 : waY + Math.round(waH / 2));
    const pillX = Math.max(waX + 30, Math.min(waX + waW - 30, rawPillX));
    const pillY = Math.max(waY + 18, Math.min(waY + waH - 18, rawPillY));

    return {
      x: Math.round(pillX - WIN_W / 2),
      y: Math.round(pillY - WIN_H / 2),
      pillX: Math.round(pillX),
      pillY: Math.round(pillY),
      edge: 'free',
      preset: 'custom',
      align: 'center',
      vAlign: 'center',
      offset: Math.round(pillX),
      displayId: display.id,
    };
  }

  if (edge === 'top' || edge === 'bottom') {
    posY = edge === 'top' ? waY : waY + waH - WIN_H;
    if (preset === 'left') {
      align = 'left';
      posX = waX;
    } else if (preset === 'right') {
      align = 'right';
      posX = waX + waW - WIN_W;
    } else if (preset === 'center') {
      align = 'center';
      posX = waX + Math.round((waW - WIN_W) / 2);
    } else if (Number.isFinite(dock.offset)) {
      posX = dock.offset;
      if (posX <= waX + 80) {
        align = 'left';
        posX = waX;
      } else if (posX >= waX + waW - WIN_W - 80) {
        align = 'right';
        posX = waX + waW - WIN_W;
      } else {
        align = 'center';
      }
    }
    posX = Math.max(waX, Math.min(waX + waW - WIN_W, posX));
  } else if (edge === 'left' || edge === 'right') {
    posX = edge === 'left' ? waX : waX + waW - WIN_W;
    if (preset === 'top') {
      align = 'top';
      posY = waY;
    } else if (preset === 'bottom') {
      align = 'bottom';
      posY = waY + waH - WIN_H;
    } else if (preset === 'middle') {
      align = 'middle';
      posY = waY + Math.round((waH - WIN_H) / 2);
    } else if (Number.isFinite(dock.offset)) {
      posY = dock.offset;
      if (posY <= waY + 60) {
        align = 'top';
        posY = waY;
      } else if (posY >= waY + waH - WIN_H - 60) {
        align = 'bottom';
        posY = waY + waH - WIN_H;
      } else {
        align = 'middle';
      }
    }
    posY = Math.max(waY, Math.min(waY + waH - WIN_H, posY));
  }

  return {
    x: Math.round(posX),
    y: Math.round(posY),
    edge,
    preset,
    align,
    offset: edge === 'top' || edge === 'bottom' ? Math.round(posX) : Math.round(posY),
    displayId: display.id,
  };
}

function snapWindowToEdges(currX, currY) {
  const centerPoint = { x: currX + WIN_W / 2, y: currY + WIN_H / 2 };
  const display = getDisplayForPoint(centerPoint.x, centerPoint.y);
  const { x: waX, y: waY, width: waW, height: waH } = display.workArea;

  const distTop = Math.abs(currY - waY);
  const distBottom = Math.abs(currY + WIN_H - (waY + waH));
  const distLeft = Math.abs(currX - waX);
  const distRight = Math.abs(currX + WIN_W - (waX + waW));

  const minDist = Math.min(distTop, distBottom, distLeft, distRight);
  const dockMode = store ? store.get('dock_mode', 'smart') : 'smart';
  const snapThreshold = store ? store.get('snap_threshold', 85) : 85;

  // Free floating mode or smart snapping threshold
  if (dockMode === 'free' || (dockMode === 'smart' && minDist > snapThreshold)) {
    const pillX = Math.max(waX + 30, Math.min(waX + waW - 30, currX + WIN_W / 2));
    const pillY = Math.max(waY + 18, Math.min(waY + waH - 18, currY + WIN_H / 2));

    return {
      x: Math.round(pillX - WIN_W / 2),
      y: Math.round(pillY - WIN_H / 2),
      pillX: Math.round(pillX),
      pillY: Math.round(pillY),
      edge: 'free',
      preset: 'custom',
      align: 'center',
      vAlign: 'center',
      offset: Math.round(pillX),
      displayId: display.id,
    };
  }

  let edge = 'top';

  if (minDist === distTop) edge = 'top';
  else if (minDist === distBottom) edge = 'bottom';
  else if (minDist === distLeft) edge = 'left';
  else edge = 'right';

  let snapX = currX;
  let snapY = currY;
  let preset = 'custom';
  let align = 'center';

  if (edge === 'top' || edge === 'bottom') {
    snapY = edge === 'top' ? waY : waY + waH - WIN_H;
    const relX = (currX + WIN_W / 2 - waX) / waW;
    if (Math.abs(relX - 0.5) < 0.12) {
      preset = 'center';
      align = 'center';
      snapX = waX + Math.round((waW - WIN_W) / 2);
    } else if (relX < 0.28) {
      preset = 'left';
      align = 'left';
      snapX = waX;
    } else if (relX > 0.72) {
      preset = 'right';
      align = 'right';
      snapX = waX + waW - WIN_W;
    } else {
      preset = 'custom';
      align = 'center';
      snapX = Math.max(waX, Math.min(waX + waW - WIN_W, currX));
    }
  } else {
    snapX = edge === 'left' ? waX : waX + waW - WIN_W;
    const relY = (currY + WIN_H / 2 - waY) / waH;
    if (Math.abs(relY - 0.5) < 0.14) {
      preset = 'middle';
      align = 'middle';
      snapY = waY + Math.round((waH - WIN_H) / 2);
    } else if (relY < 0.28) {
      preset = 'top';
      align = 'top';
      snapY = waY;
    } else if (relY > 0.72) {
      preset = 'bottom';
      align = 'bottom';
      snapY = waY + waH - WIN_H;
    } else {
      preset = 'custom';
      align = 'middle';
      snapY = Math.max(waY, Math.min(waY + waH - WIN_H, currY));
    }
  }

  return {
    x: Math.round(snapX),
    y: Math.round(snapY),
    edge,
    preset,
    align,
    offset: edge === 'top' || edge === 'bottom' ? Math.round(snapX) : Math.round(snapY),
    displayId: display.id,
  };
}

function findMediaSource(sources) {
  const currentApp = (mediaState?.app || '').toLowerCase();
  const currentTitle = (mediaState?.title || '').toLowerCase();

  // 1. Direct match with current title
  if (currentTitle && currentTitle.length > 3) {
    const snippet = currentTitle.slice(0, 15).trim();
    const byTitle = sources.find((s) => s.name.toLowerCase().includes(snippet));
    if (byTitle) return byTitle;
  }

  // 2. Direct match with app name
  if (currentApp) {
    const byApp = sources.find((s) => {
      const n = s.name.toLowerCase();
      return n.includes(currentApp) || (currentApp.includes('chrome') && n.includes('chrome')) || (currentApp.includes('edge') && n.includes('edge'));
    });
    if (byApp) return byApp;
  }

  // 3. Known browser / media player window
  const byBrowser = sources.find((s) => {
    const n = s.name.toLowerCase();
    return n.includes('youtube') || n.includes('netflix') || n.includes('chrome') ||
           n.includes('edge') || n.includes('vlc') || n.includes('brave') || n.includes('firefox');
  });
  if (byBrowser) return byBrowser;

  // 4. Any top-level window except Island itself
  const fallbackWindow = sources.find((s) => {
    const n = s.name.toLowerCase();
    return !n.includes('island') && !n.includes('electron') && s.id.startsWith('window:');
  });
  if (fallbackWindow) return fallbackWindow;

  // 5. Fallback to primary screen (guarantees live stream on Windows 11 when cross-thread window enum is restricted)
  const screenFallback = sources.find((s) => s.id.startsWith('screen:'));
  return screenFallback || sources[0] || null;
}

const ytCache = new Map();

function resolveYouTubeId(query) {
  if (!query) return Promise.resolve(null);
  const clean = String(query).replace(/[()[\]{}\-–—]/g, ' ').replace(/\s+/g, ' ').trim();
  if (ytCache.has(clean)) return Promise.resolve(ytCache.get(clean));

  return new Promise((resolve) => {
    const req = https.get(`https://www.youtube.com/results?search_query=${encodeURIComponent(clean)}`, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
        const m = data.match(/\/watch\?v=([a-zA-Z0-9_-]{11})/);
        if (m) {
          req.destroy();
          ytCache.set(clean, m[1]);
          resolve(m[1]);
        }
      });
      res.on('end', () => {
        const m = data.match(/\/watch\?v=([a-zA-Z0-9_-]{11})/);
        const id = m ? m[1] : null;
        if (id) ytCache.set(clean, id);
        resolve(id);
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(3500, () => {
      req.destroy();
      resolve(null);
    });
  });
}

function placeWindow() {
  if (!win || win.isDestroyed()) return;
  const saved = getSavedDock();
  const target = computeDockPosition(saved);
  win.setBounds({ x: target.x, y: target.y, width: WIN_W, height: WIN_H });
  send('window:dock-changed', target);
}

function createWindow() {
  win = new BrowserWindow({
    width: WIN_W,
    height: WIN_H,
    show: false,
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    focusable: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  win.setIgnoreMouseEvents(true, { forward: true });
  placeWindow();

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url && (url.startsWith('https:') || url.startsWith('http:'))) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, targetUrl) => {
    if (targetUrl !== DEV_URL && !targetUrl.startsWith('file://')) {
      event.preventDefault();
    }
  });

  // Click-outside dismissal: when the expanded island window loses OS focus, notify the renderer
  win.on('blur', () => {
    send('window:blur');
  });

  if (DEV_URL) win.loadURL(DEV_URL);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));

  win.once('ready-to-show', () => {
    if (visible) win.showInactive();
  });
}

function getDisplayBounds() {
  const display = screen.getPrimaryDisplay();
  return display ? (display.workArea || display.bounds) : { x: 0, y: 0, width: 1920, height: 1080 };
}

function placePetWindow() {
  if (!petWin || petWin.isDestroyed()) return;
  const { x: dispX, y: dispY, width: dispW, height: dispH } = getDisplayBounds();
  const saved = store ? store.get('pet_pos', null) : null;
  const initialX = saved && Number.isFinite(saved.x) ? saved.x : Math.round(dispX + dispW - PET_WIN_W - 60);
  const initialY = saved && Number.isFinite(saved.y) ? saved.y : Math.round(dispY + dispH - PET_WIN_H - 60);
  petWin.setBounds({ x: initialX, y: initialY, width: PET_WIN_W, height: PET_WIN_H });
}

function createPetWindow() {
  petWin = new BrowserWindow({
    width: PET_WIN_W,
    height: PET_WIN_H,
    show: false,
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    focusable: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });

  petWin.setAlwaysOnTop(true, 'screen-saver');
  petWin.setIgnoreMouseEvents(true, { forward: true });
  placePetWindow();

  petWin.webContents.setWindowOpenHandler(({ url }) => {
    if (url && (url.startsWith('https:') || url.startsWith('http:'))) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
  petWin.webContents.on('will-navigate', (event) => event.preventDefault());

  const targetUrl = DEV_URL ? `${DEV_URL}#pet` : `file://${path.join(__dirname, '..', 'dist', 'index.html')}#pet`;
  petWin.loadURL(targetUrl);

  petWin.once('ready-to-show', () => {
    const petVisible = store ? store.get('island_pet_visible', false) : false;
    if (visible && petVisible === true) petWin.showInactive();
  });
}

function toggleVisible() {
  visible = !visible;
  if (win && !win.isDestroyed()) {
    if (visible) win.showInactive();
    else win.hide();
  }
  if (petWin && !petWin.isDestroyed()) {
    const petVisible = store ? store.get('island_pet_visible', false) : false;
    if (visible && petVisible === true) petWin.showInactive();
    else petWin.hide();
  }
  buildTrayMenu();
}

function openHub() {
  if (!visible) {
    visible = true;
    win.showInactive();
    buildTrayMenu();
  }
  send('hub:toggle');
}

function toggleVoice() {
  if (!visible && win && !win.isDestroyed()) {
    visible = true;
    win.showInactive();
    buildTrayMenu();
  }
  send('voice:toggle');
}

// ---------------------------------------------------------------- tray

function buildTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: visible ? 'Hide Island' : 'Show Island', click: toggleVisible },
      { label: `Open hub  (${HUB_SHORTCUT_LABEL})`, click: openHub },
      { label: `Talk to Island  (${VOICE_SHORTCUT_LABEL})`, click: toggleVoice },
      { type: 'separator' },
      {
        label: 'Launch at startup',
        type: 'checkbox',
        enabled: app.isPackaged, // in dev this would register electron.exe itself
        checked: app.getLoginItemSettings().openAtLogin,
        click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }),
      },
      {
        label: 'Send test notification',
        click: () => pushNotification({ title: 'Hello from Island', body: 'Notifications from your tools show up here.', app: 'Island' }),
      },
      { type: 'separator' },
      { label: 'Quit Island', click: () => app.quit() },
    ]),
  );
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'tray.png'));
  tray = new Tray(icon);
  tray.setToolTip('Island');
  tray.on('click', openHub);
  buildTrayMenu();
}

// ---------------------------------------------------------------- services

function wireScheduler() {
  scheduler = new Scheduler({ items: store.get('schedule', []) });

  scheduler.on('change', (items) => {
    store.set('schedule', scheduler.serialize());
    send('scheduler:state', items);
  });

  scheduler.on('fire', (item) => {
    const isAlarm = item.kind === 'alarm';
    addToInbox({
      app: 'Clock',
      source: 'clock',
      title: isAlarm ? item.label || 'Alarm' : `${item.label || 'Timer'} finished`,
      body: isAlarm ? `Alarm for ${item.time}` : '',
    });
    send('ring', { kind: item.kind, item });
  });

  scheduler.on('missed', (item) => {
    const isAlarm = item.kind === 'alarm';
    pushNotification({
      app: 'Clock',
      source: 'clock',
      kind: 'warning',
      title: isAlarm ? `Missed alarm ${item.time}` : `Missed timer`,
      body: item.label || '',
      timeoutMs: 8000,
    });
  });
}

function wireMedia() {
  const scriptSource = fs.readFileSync(path.join(__dirname, 'ps', 'smtc.ps1'), 'utf8');
  media = new MediaWatcher({ workDir: path.join(app.getPath('userData'), 'scripts'), scriptSource });
  media.on('state', async (state) => {
    mediaState = state;
    if (state.active && state.title) {
      // Check for direct watch?v= in title or thumbnail
      const directMatch = state.title.match(/watch\?v=([a-zA-Z0-9_-]{11})/) || (state.art && state.art.match(/\/vi(?:_webp)?\/([a-zA-Z0-9_-]{11})\//));
      if (directMatch) {
        state.youtubeId = directMatch[1];
      }
    }
    send('media', state);
  });
  media.start();
}

function wireNotifyServer() {
  notifyServer = createNotifyServer({
    onNotify: (n) => pushNotification({ ...n, source: 'api' }),
    onVideoState: (state) => {
      if (mediaState) {
        if (state.videoId) mediaState.youtubeId = state.videoId;
        if (state.color) mediaState.ambientColor = state.color;
      }
      send('video:ambient-update', state);
    },
  });
  notifyServer
    .listen()
    .then((port) => {
      notifyPort = port;
    })
    .catch((err) => console.warn(`[notify] could not listen on port ${DEFAULT_PORT}: ${err.message}`));
}

function wireIpc() {
  handle('state:get', () => ({
    schedule: scheduler.list(),
    inbox,
    media: mediaState,
    platform: process.platform,
    port: notifyPort,
    hotkey: HUB_SHORTCUT_LABEL,
    systemAccent: getSystemAccentColor(),
  }));

  handle('scheduler:add-alarm', (input) => guard(() => ({ item: scheduler.addAlarm(input) })));
  handle('scheduler:add-timer', (input) => guard(() => ({ item: scheduler.addTimer(input) })));
  handle('scheduler:snooze', (input) => guard(() => ({ item: scheduler.snooze(input) })));
  handle('scheduler:remove', (id) => guard(() => ({ removed: scheduler.remove(String(id)) })));
  handle('scheduler:set-enabled', (id, enabled) => guard(() => ({ updated: scheduler.setEnabled(String(id), enabled) })));

  ipcMain.on('win:ignore-mouse', (event, ignore) => {
    if (!trusted(event)) return;
    const targetWin = BrowserWindow.fromWebContents(event.sender);
    if (!targetWin || targetWin.isDestroyed()) return;
    if (ignore) targetWin.setIgnoreMouseEvents(true, { forward: true });
    else targetWin.setIgnoreMouseEvents(false);
  });

  // The window never takes focus on its own. It becomes focusable only while you type in a field.
  listen('win:focusable', (focusable) => {
    if (!win || win.isDestroyed()) return;
    if (focusable) {
      win.setFocusable(true);
      win.focus();
    } else {
      win.blur();
      win.setFocusable(false);
    }
  });

  listen('media:control', (action) => media && media.control(String(action)));
  listen('media:seek', (pos) => media && media.seek(Number(pos) || 0));

  listen('inbox:clear', () => setInbox([]));
  listen('inbox:remove', (id) => setInbox(inbox.filter((n) => n.id !== id)));
  listen('inbox:mark-read', () => {
    if (inbox.some((n) => !n.read)) setInbox(inbox.map((n) => ({ ...n, read: true })));
  });

  // Dynamic Island 4-edge dragging, magnetic docking & positioning
  let isDraggingWindow = false;
  let dragStartCursor = { x: 0, y: 0 };
  let dragStartWinPos = [0, 0];

  listen('window:drag-start', () => {
    if (!win || win.isDestroyed()) return;
    dragStartCursor = screen.getCursorScreenPoint();
    dragStartWinPos = win.getPosition();
    isDraggingWindow = true;
  });

  listen('window:drag-move', () => {
    if (!win || win.isDestroyed() || !isDraggingWindow) return;
    const currentCursor = screen.getCursorScreenPoint();
    const dx = currentCursor.x - dragStartCursor.x;
    const dy = currentCursor.y - dragStartCursor.y;

    const targetX = Math.round(dragStartWinPos[0] + dx);
    const targetY = Math.round(dragStartWinPos[1] + dy);

    const display = getDisplayForPoint(currentCursor.x, currentCursor.y);
    const { x: waX, y: waY, width: waW, height: waH } = display.workArea;

    // Unrestricted desktop floating from top edge to taskbar!
    const pillX = targetX + WIN_W / 2;
    const pillY = targetY + WIN_H / 2;
    const clampedPillX = Math.max(waX + 30, Math.min(waX + waW - 30, pillX));
    const clampedPillY = Math.max(waY + 18, Math.min(waY + waH - 18, pillY));

    win.setPosition(Math.round(clampedPillX - WIN_W / 2), Math.round(clampedPillY - WIN_H / 2));
  });

  listen('window:move-by', ({ dx, dy }) => {
    if (!win || win.isDestroyed()) return;
    const [currX, currY] = win.getPosition();
    const nx = Math.round(currX + (Number(dx) || 0));
    const ny = Math.round(currY + (Number(dy) || 0));
    const display = getDisplayForPoint(nx + WIN_W / 2, ny + WIN_H / 2);
    const { x: waX, y: waY, width: waW, height: waH } = display.workArea;
    const clampedX = Math.max(waX, Math.min(waX + waW - WIN_W, nx));
    const clampedY = Math.max(waY, Math.min(waY + waH - WIN_H, ny));
    win.setPosition(clampedX, clampedY);
  });

  listen('window:drag-end', () => {
    if (!win || win.isDestroyed()) return;
    isDraggingWindow = false;
    const [currX, currY] = win.getPosition();
    const snapped = snapWindowToEdges(currX, currY);
    win.setPosition(snapped.x, snapped.y);
    if (store) {
      store.set('island_dock', snapped);
      store.set('window_edge', snapped.edge);
      store.set('window_preset', snapped.preset);
      store.set('window_x', snapped.x);
    }
    send('window:dock-changed', snapped);
  });

  listen('window:set-preset', (payload) => {
    if (!win || win.isDestroyed()) return;
    const current = getSavedDock();
    const preset = typeof payload === 'string' ? payload : (payload && payload.preset) || 'center';
    const edge = (payload && payload.edge) || current.edge || 'top';
    const next = computeDockPosition({ ...current, preset, edge });
    win.setPosition(next.x, next.y);
    if (store) {
      store.set('island_dock', next);
      store.set('window_edge', next.edge);
      store.set('window_preset', next.preset);
      store.set('window_x', next.x);
    }
    send('window:dock-changed', next);
  });

  listen('window:reset-pos', () => {
    if (!win || win.isDestroyed()) return;
    const resetDock = { edge: 'top', preset: 'center', offset: null, displayId: null };
    const next = computeDockPosition(resetDock);
    win.setPosition(next.x, next.y);
    if (store) {
      store.set('island_dock', next);
      store.set('window_edge', 'top');
      store.set('window_preset', 'center');
      store.set('window_x', next.x);
    }
    send('window:dock-changed', next);
  });

  handle('window:get-pos', () => {
    if (!win || win.isDestroyed()) return { x: 0, preset: 'center' };
    const [x] = win.getPosition();
    const saved = getSavedDock();
    return {
      x,
      preset: saved.preset || 'center',
      edge: saved.edge || 'top',
    };
  });

  handle('window:get-dock', () => {
    const saved = getSavedDock();
    return computeDockPosition(saved);
  });

  // Focus management for manual expansion (enabling click-outside blur dismissal)
  listen('island:expand', (expanded) => {
    if (!win || win.isDestroyed()) return;
    if (expanded) {
      win.setFocusable(true);
      win.focus();
      const saved = getSavedDock();
      if (saved.edge === 'free') {
        const [currX, currY] = win.getPosition();
        const display = getDisplayForPoint(currX + WIN_W / 2, currY + WIN_H / 2);
        const { y: waY, height: waH } = display.workArea;
        // Hub bounds inside the 720x500 window: center is at WIN_H / 2 (250).
        // Hub height is up to 390px, extending from y=55 to y=445 in window coordinates.
        const hubTop = currY + 55;
        const hubBottom = currY + 445;
        let adjY = currY;
        if (hubTop < waY + 8) adjY = waY + 8 - 55;
        else if (hubBottom > waY + waH - 8) adjY = waY + waH - 8 - 445;
        if (adjY !== currY) {
          win.setPosition(currX, Math.round(adjY));
        }
      }
    } else {
      win.blur();
      win.setFocusable(false);
      const saved = getSavedDock();
      if (saved.edge === 'free' && Number.isFinite(saved.pillY)) {
        const [currX] = win.getPosition();
        win.setPosition(currX, Math.round(saved.pillY - WIN_H / 2));
      }
    }
  });

  // Fullscreen autohide settings
  handle('settings:get-autohide', () => (store ? store.get('autohide_fullscreen') !== false : true));
  handle('settings:set-autohide', (enabled) => {
    if (store) store.set('autohide_fullscreen', Boolean(enabled));
    return true;
  });
  handle('settings:get-autohide-pet', () => (store ? store.get('autohide_pet_fullscreen') !== false : true));
  handle('settings:set-autohide-pet', (enabled) => {
    if (store) store.set('autohide_pet_fullscreen', Boolean(enabled));
    return true;
  });

  // Docking mode (smart, free, always)
  handle('settings:get-dock-mode', () => (store ? store.get('dock_mode', 'smart') : 'smart'));
  handle('settings:set-dock-mode', (mode) => {
    if (store) store.set('dock_mode', mode);
    return true;
  });
  handle('settings:get-snap-threshold', () => (store ? store.get('snap_threshold', 85) : 85));
  handle('settings:set-snap-threshold', (dist) => {
    if (store) store.set('snap_threshold', Number(dist) || 85);
    return true;
  });

  // Dedicated Pet Window IPC
  listen('pet:move-by', ({ dx, dy }) => {
    if (!petWin || petWin.isDestroyed()) return;
    const display = screen.getPrimaryDisplay();
    const { x: dispX, y: dispY, width: dispW, height: dispH } = display ? display.workArea : { x: 0, y: 0, width: 1920, height: 1040 };
    const [currX, currY] = petWin.getPosition();
    const minX = dispX + 16;
    const maxX = dispX + dispW - PET_WIN_W - 16;
    const minY = dispY + 16;
    const maxY = dispY + dispH - PET_WIN_H - 16;
    const newX = Math.max(minX, Math.min(maxX, Math.round(currX + (Number(dx) || 0))));
    const newY = Math.max(minY, Math.min(maxY, Math.round(currY + (Number(dy) || 0))));
    petWin.setPosition(newX, newY);
    if (store) store.set('pet_pos', { x: newX, y: newY });
    send('pet:pos-changed', { x: newX, y: newY });
  });

  handle('video:get-source-id', async () => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['window', 'screen'],
        thumbnailSize: { width: 120, height: 120 },
      });
      const matched = findMediaSource(sources);
      return matched ? matched.id : (sources[0] ? sources[0].id : null);
    } catch (err) {
      console.warn('[video] error getting sources:', err.message);
      return null;
    }
  });

  handle('video:resolve-youtube-id', async (_event, query) => {
    return resolveYouTubeId(query);
  });

  listen('pet:set-pos', ({ x, y }) => {
    if (!petWin || petWin.isDestroyed()) return;
    const nx = Math.round(Number(x) || 0);
    const ny = Math.round(Number(y) || 0);
    petWin.setPosition(nx, ny);
    if (store) store.set('pet_pos', { x: nx, y: ny });
    send('pet:pos-changed', { x: nx, y: ny });
  });

  listen('pet:reset-pos', () => {
    placePetWindow();
    if (petWin && !petWin.isDestroyed()) {
      const [x, y] = petWin.getPosition();
      if (store) store.set('pet_pos', { x, y });
      send('pet:pos-changed', { x, y });
    }
  });

  handle('pet:get-pos', () => {
    if (!petWin || petWin.isDestroyed()) return { x: 0, y: 0 };
    const [x, y] = petWin.getPosition();
    return { x, y };
  });

  listen('pet:set-visible', (vis) => {
    if (store) store.set('island_pet_visible', Boolean(vis));
    if (!petWin || petWin.isDestroyed()) return;
    if (vis && visible) petWin.showInactive();
    else petWin.hide();
  });

  // Gemini Voice Service
  handle('gemini:process-speech', (params) => {
    if (!geminiVoiceService) geminiVoiceService = new GeminiVoiceService();
    return geminiVoiceService.processSpeech(params);
  });

  handle('gemini:synthesize-speech', (params) => {
    if (!geminiVoiceService) geminiVoiceService = new GeminiVoiceService();
    return geminiVoiceService.synthesizeSpeech(params);
  });

  handle('gemini:get-status', () => {
    if (!geminiVoiceService) geminiVoiceService = new GeminiVoiceService();
    return { hasKey: geminiVoiceService.hasKey(), provider: 'gemini' };
  });

  // OpenAI Realtime voice broker (development session creation)
  handle('realtime:create-session', (options) => {
    if (!realtimeBroker) realtimeBroker = new RealtimeSessionBroker();
    return realtimeBroker.createSession(options);
  });

  // Pet voice reaction broadcast
  listen('pet:set-voice-mood', (voiceState) => {
    send('voice:state', voiceState);
  });

  // Windows system accent color
  handle('system:get-accent-color', () => getSystemAccentColor());
}

function wireFullscreen() {
  const scriptSource = fs.readFileSync(path.join(__dirname, 'ps', 'fullscreen.ps1'), 'utf8');
  fullscreenWatcher = new FullscreenWatcher({ workDir: path.join(app.getPath('userData'), 'scripts'), scriptSource });
  fullscreenWatcher.on('change', (isFullscreen) => {
    const autoHide = store ? store.get('autohide_fullscreen') !== false : true;
    const autoHidePet = store ? store.get('autohide_pet_fullscreen') !== false : true;

    if (isFullscreen) {
      if (autoHide && win && !win.isDestroyed()) {
        win.hide();
      }
      if (autoHidePet && petWin && !petWin.isDestroyed()) {
        petWin.hide();
      }
      send('fullscreen:change', true);
    } else {
      if (win && !win.isDestroyed() && visible) {
        win.showInactive();
      }
      const petVisible = store ? store.get('island_pet_visible', false) : false;
      if (petWin && !petWin.isDestroyed() && visible && petVisible) {
        petWin.showInactive();
      }
      send('fullscreen:change', false);
    }
  });
  fullscreenWatcher.start();
}

// ---------------------------------------------------------------- lifecycle

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) openHub();
  });

  // Keep running in the tray even though the window can't be closed.
  app.on('window-all-closed', () => {});

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
      if (permission === 'media' || permission === 'display-capture') return true;
      return false;
    });

    session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
      if (permission === 'media' || permission === 'display-capture') {
        callback(true);
        return;
      }
      callback(false);
    });

    if (session.defaultSession.setDisplayMediaRequestHandler) {
      session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
        try {
          const sources = await desktopCapturer.getSources({
            types: ['window', 'screen'],
            thumbnailSize: { width: 120, height: 120 },
          });
          const matched = findMediaSource(sources);
          callback({ video: matched || sources[0] || null });
        } catch {
          callback({ video: null });
        }
      });
    }

    store = new Store(path.join(app.getPath('userData'), 'island-state.json'));
    inbox = sanitizeInbox(store.get('inbox', []));

    wireScheduler();
    wireIpc();
    createWindow();
    createPetWindow();
    createTray();
    wireMedia();
    wireNotifyServer();
    wireFullscreen();

    realtimeBroker = new RealtimeSessionBroker();

    globalShortcut.register(HUB_SHORTCUT, openHub);
    globalShortcut.register(VOICE_SHORTCUT, toggleVoice);

    for (const event of ['display-metrics-changed', 'display-added', 'display-removed']) {
      screen.on(event, () => {
        placeWindow();
        placePetWindow();
      });
    }

    if (process.platform === 'win32' && systemPreferences && systemPreferences.on) {
      try {
        systemPreferences.on('accent-color-changed', (_event, newColor) => {
          const hex = (newColor && typeof newColor === 'string')
            ? `#${newColor.slice(0, 6)}`
            : getSystemAccentColor();
          if (hex) {
            send('system:accent-color', hex);
          }
        });
      } catch (err) {
        console.warn('[accent] listener error:', err.message);
      }
    }
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    if (media) media.stop();
    if (fullscreenWatcher) fullscreenWatcher.stop();
    if (scheduler) scheduler.stop();
    if (notifyServer) notifyServer.close();
    if (store) store.flush();
  });
}
