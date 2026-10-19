'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, Menu, Tray, globalShortcut, ipcMain, nativeImage, screen, session } = require('electron');

const { Store } = require('./store');
const { Scheduler } = require('./scheduler');
const { createNotifyServer, DEFAULT_PORT } = require('./notify-server');
const { MediaWatcher } = require('./media');
const { FullscreenWatcher } = require('./fullscreen');

const DEV_URL = process.env.ISLAND_DEV_URL || '';
const WIN_W = 720;
const WIN_H = 500;
const INBOX_LIMIT = 100;
const HUB_SHORTCUT = 'CommandOrControl+Alt+Space';
const HUB_SHORTCUT_LABEL = 'Ctrl+Alt+Space';

let win = null;
let tray = null;
let store = null;
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

function getDisplayBounds() {
  const display = screen.getPrimaryDisplay();
  return display ? display.bounds : { x: 0, y: 0, width: 1920, height: 1080 };
}

function clampWindowX(targetX) {
  const { x: dispX, width: dispW } = getDisplayBounds();
  const minX = dispX - Math.round(WIN_W / 2) + 140;
  const maxX = dispX + dispW - Math.round(WIN_W / 2) - 140;
  return Math.max(minX, Math.min(maxX, Math.round(targetX)));
}

function getPresetX(preset) {
  const { x: dispX, width: dispW } = getDisplayBounds();
  if (preset === 'left') {
    return Math.round(dispX + (dispW * 0.16) - (WIN_W / 2));
  }
  if (preset === 'right') {
    return Math.round(dispX + (dispW * 0.84) - (WIN_W / 2));
  }
  return Math.round(dispX + (dispW - WIN_W) / 2);
}

function placeWindow() {
  if (!win || win.isDestroyed()) return;
  const { y: dispY } = getDisplayBounds();
  const savedX = store ? store.get('window_x', null) : null;
  const initialX = savedX !== null ? clampWindowX(savedX) : getPresetX('center');
  win.setBounds({ x: initialX, y: dispY, width: WIN_W, height: WIN_H });
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
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  win.setIgnoreMouseEvents(true, { forward: true });
  placeWindow();

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());

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

function toggleVisible() {
  visible = !visible;
  if (!win) return;
  if (visible) win.showInactive();
  else win.hide();
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

// ---------------------------------------------------------------- tray

function buildTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: visible ? 'Hide Island' : 'Show Island', click: toggleVisible },
      { label: `Open hub  (${HUB_SHORTCUT_LABEL})`, click: openHub },
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
  media.on('state', (state) => {
    mediaState = state;
    send('media', state);
  });
  media.start();
}

function wireNotifyServer() {
  notifyServer = createNotifyServer({ onNotify: (n) => pushNotification({ ...n, source: 'api' }) });
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
  }));

  handle('scheduler:add-alarm', (input) => guard(() => ({ item: scheduler.addAlarm(input) })));
  handle('scheduler:add-timer', (input) => guard(() => ({ item: scheduler.addTimer(input) })));
  handle('scheduler:snooze', (input) => guard(() => ({ item: scheduler.snooze(input) })));
  handle('scheduler:remove', (id) => guard(() => ({ removed: scheduler.remove(String(id)) })));
  handle('scheduler:set-enabled', (id, enabled) => guard(() => ({ updated: scheduler.setEnabled(String(id), enabled) })));

  listen('win:ignore-mouse', (ignore) => {
    if (!win || win.isDestroyed()) return;
    if (ignore) win.setIgnoreMouseEvents(true, { forward: true });
    else win.setIgnoreMouseEvents(false);
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

  listen('inbox:clear', () => setInbox([]));
  listen('inbox:remove', (id) => setInbox(inbox.filter((n) => n.id !== id)));
  listen('inbox:mark-read', () => {
    if (inbox.some((n) => !n.read)) setInbox(inbox.map((n) => ({ ...n, read: true })));
  });

  // Dynamic Island dragging & positioning
  listen('window:move-by', ({ dx, dy }) => {
    if (!win || win.isDestroyed()) return;
    const [currX, currY] = win.getPosition();
    const newX = clampWindowX(currX + (Number(dx) || 0));
    win.setPosition(newX, currY);
    if (store) {
      store.set('window_x', newX);
      store.set('window_preset', 'custom');
    }
    send('window:pos-changed', { x: newX, preset: 'custom' });
  });

  listen('window:set-preset', (preset) => {
    if (!win || win.isDestroyed()) return;
    const { y: dispY } = getDisplayBounds();
    const newX = clampWindowX(getPresetX(preset));
    win.setPosition(newX, dispY);
    if (store) {
      store.set('window_x', newX);
      store.set('window_preset', preset);
    }
    send('window:pos-changed', { x: newX, preset });
  });

  listen('window:reset-pos', () => {
    if (!win || win.isDestroyed()) return;
    const { y: dispY } = getDisplayBounds();
    const newX = getPresetX('center');
    win.setPosition(newX, dispY);
    if (store) {
      store.set('window_x', newX);
      store.set('window_preset', 'center');
    }
    send('window:pos-changed', { x: newX, preset: 'center' });
  });

  handle('window:get-pos', () => {
    if (!win || win.isDestroyed()) return { x: 0, preset: 'center' };
    const [x] = win.getPosition();
    return {
      x,
      preset: store ? store.get('window_preset', 'center') : 'center',
    };
  });

  // Focus management for manual expansion (enabling click-outside blur dismissal)
  listen('island:expand', (expanded) => {
    if (!win || win.isDestroyed()) return;
    if (expanded) {
      win.setFocusable(true);
      win.focus();
    } else {
      win.blur();
      win.setFocusable(false);
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
}

function wireFullscreen() {
  const scriptSource = fs.readFileSync(path.join(__dirname, 'ps', 'fullscreen.ps1'), 'utf8');
  fullscreenWatcher = new FullscreenWatcher({ workDir: path.join(app.getPath('userData'), 'scripts'), scriptSource });
  fullscreenWatcher.on('change', (isFullscreen) => {
    const autoHide = store ? store.get('autohide_fullscreen') !== false : true;
    if (isFullscreen && autoHide) {
      if (win && !win.isDestroyed()) {
        win.setOpacity(0);
      }
      send('fullscreen:change', true);
    } else {
      if (win && !win.isDestroyed()) {
        win.setOpacity(1);
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
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));

    store = new Store(path.join(app.getPath('userData'), 'island-state.json'));
    inbox = sanitizeInbox(store.get('inbox', []));

    wireScheduler();
    wireIpc();
    createWindow();
    createTray();
    wireMedia();
    wireNotifyServer();
    wireFullscreen();

    globalShortcut.register(HUB_SHORTCUT, openHub);

    for (const event of ['display-metrics-changed', 'display-added', 'display-removed']) {
      screen.on(event, placeWindow);
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
