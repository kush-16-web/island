'use strict';

const path = require('path');
const { app, BrowserWindow, screen, shell } = require('electron');

/**
 * Clamps window bounds within the active or primary display's workArea.
 * Prevents windows from appearing off-screen (e.g. after disconnecting a secondary display).
 */
function clampBoundsToWorkArea(bounds, defaultBounds = { width: 960, height: 720, minWidth: 800, minHeight: 600 }, customScreen = null) {
  const sc = customScreen || (typeof screen !== 'undefined' ? screen : null);
  const fallbackDisplay = { bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1040 } };
  const displays = (sc && typeof sc.getAllDisplays === 'function') ? sc.getAllDisplays() : [fallbackDisplay];
  const primary = (sc && typeof sc.getPrimaryDisplay === 'function') ? sc.getPrimaryDisplay() : displays[0];

  const minW = defaultBounds.minWidth || 600;
  const minH = defaultBounds.minHeight || 400;

  // Find display containing the bounds center, or fallback to primary
  let targetDisplay = primary || fallbackDisplay;
  if (bounds && typeof bounds.x === 'number' && typeof bounds.y === 'number') {
    const cx = bounds.x + (bounds.width || defaultBounds.width) / 2;
    const cy = bounds.y + (bounds.height || defaultBounds.height) / 2;
    const found = displays.find((d) => {
      const b = d.bounds;
      return cx >= b.x && cx < b.x + b.width && cy >= b.y && cy < b.y + b.height;
    });
    if (found) targetDisplay = found;
  }

  const workArea = targetDisplay.workArea || fallbackDisplay.workArea;

  const width = Math.min(
    Math.max(Number.isFinite(bounds?.width) ? bounds.width : defaultBounds.width, minW),
    workArea.width
  );
  const height = Math.min(
    Math.max(Number.isFinite(bounds?.height) ? bounds.height : defaultBounds.height, minH),
    workArea.height
  );

  let x = Number.isFinite(bounds?.x) ? bounds.x : Math.round(workArea.x + (workArea.width - width) / 2);
  let y = Number.isFinite(bounds?.y) ? bounds.y : Math.round(workArea.y + (workArea.height - height) / 2);

  // Clamp within workArea edges
  x = Math.max(workArea.x, Math.min(x, workArea.x + workArea.width - width));
  y = Math.max(workArea.y, Math.min(y, workArea.y + workArea.height - height));

  return { x, y, width, height };
}

function debounce(fn, waitMs = 300) {
  let timer = null;
  return (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, waitMs);
  };
}

/**
 * WindowManager: Authoritative Electron Multi-Window Lifecycle Controller (Phase 1A).
 * 
 * Manages:
 * 1. islandWin: Transparent, frameless, click-through ambient overlay (720x500)
 * 2. workspaceWin: Resizable dedicated AI workspace (min 800x600, default 960x720)
 * 3. settingsWin: Dedicated Settings window (min 680x480, default 760x560)
 * 4. petWin: Optional, on-demand desktop companion (190x175, disabled by default)
 */
class WindowManager {
  constructor({ store, devUrl, preloadPath, distHtmlPath, iconPath }) {
    this.store = store;
    this.devUrl = devUrl || '';
    this.preloadPath = preloadPath;
    this.distHtmlPath = distHtmlPath;
    this.iconPath = iconPath;

    this.islandWin = null;
    this.workspaceWin = null;
    this.settingsWin = null;
    this.petWin = null;
    this.cinemaWin = null;
    this.lastMediaState = null;
  }

  setIslandWindow(win) {
    this.islandWin = win;
  }

  setPetWindow(win) {
    this.petWin = win;
  }

  /**
   * Broadcast an IPC message to all active, non-destroyed windows.
   */
  broadcast(channel, payload) {
    if (channel === 'media') {
      this.lastMediaState = payload;
    }
    const wins = [this.islandWin, this.workspaceWin, this.settingsWin, this.petWin, this.cinemaWin];
    for (const w of wins) {
      if (w && !w.isDestroyed() && w.webContents && !w.webContents.isDestroyed()) {
        try {
          w.webContents.send(channel, payload);
        } catch { }
      }
    }
  }

  /**
   * Dedicated AI Chat Workspace (Implementation B)
   * Single-instance: repeated open requests focus existing window.
   */
  openWorkspace() {
    if (this.workspaceWin && !this.workspaceWin.isDestroyed()) {
      if (this.workspaceWin.isMinimized()) this.workspaceWin.restore();
      if (!this.workspaceWin.isVisible()) this.workspaceWin.show();
      this.workspaceWin.focus();
      return this.workspaceWin;
    }

    const defaultBounds = { width: 680, height: 520, minWidth: 600, minHeight: 440 };
    const saved = this.store ? this.store.get('workspace_bounds', null) : null;
    // Migrate away from legacy defaults (960x720 or 440x560)
    const isLegacyDefault = saved && (
      (saved.width === 440 && saved.height === 560) ||
      (saved.width === 960 && saved.height === 720) ||
      (saved.width >= 800 && saved.height >= 700)
    );
    const effectiveSaved = isLegacyDefault ? null : saved;
    const bounds = clampBoundsToWorkArea(effectiveSaved, defaultBounds);

    this.workspaceWin = new BrowserWindow({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      minWidth: 600,
      minHeight: 440,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      backgroundMaterial: 'acrylic',
      hasShadow: false,
      skipTaskbar: false,
      focusable: true,
      alwaysOnTop: false,
      icon: this.iconPath,
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        spellcheck: false,
        backgroundThrottling: false,
      },
    });

    // Suppress native Windows active border highlighting safely
    if (this.workspaceWin && typeof this.workspaceWin.setAccentColor === 'function') {
      try { this.workspaceWin.setAccentColor(false); } catch { /* platform fallback */ }
    }

    const targetUrl = this.devUrl
      ? `${this.devUrl}#workspace`
      : `file://${this.distHtmlPath}#workspace`;

    this.workspaceWin.loadURL(targetUrl);

    this.workspaceWin.once('ready-to-show', () => {
      if (this.workspaceWin && !this.workspaceWin.isDestroyed()) {
        this.workspaceWin.show();
        this.workspaceWin.focus();
        if (this.lastMediaState) {
          try {
            this.workspaceWin.webContents.send('media', this.lastMediaState);
          } catch { }
        }
      }
    });

    // Window maximize notification for custom titlebar toggle state
    this.workspaceWin.on('maximize', () => {
      this.workspaceWin?.webContents?.send?.('window:maximize-change', { isMaximized: true });
    });
    this.workspaceWin.on('unmaximize', () => {
      this.workspaceWin?.webContents?.send?.('window:maximize-change', { isMaximized: false });
    });

    // Debounced bounds persistence
    const saveBounds = debounce(() => {
      if (!this.workspaceWin || this.workspaceWin.isDestroyed() || this.workspaceWin.isMaximized()) return;
      try {
        const b = this.workspaceWin.getBounds();
        this.store?.set('workspace_bounds', b);
      } catch { }
    }, 400);

    this.workspaceWin.on('resize', saveBounds);
    this.workspaceWin.on('move', saveBounds);

    // Secure navigation & link handling
    this.workspaceWin.webContents.setWindowOpenHandler(({ url }) => {
      if (url && (url.startsWith('https:') || url.startsWith('http:'))) {
        shell.openExternal(url);
      }
      return { action: 'deny' };
    });
    this.workspaceWin.webContents.on('will-navigate', (event) => event.preventDefault());

    this.workspaceWin.on('closed', () => {
      this.workspaceWin = null;
    });

    return this.workspaceWin;
  }

  /**
   * Dedicated Settings Window (Implementation C)
   * Single-instance: repeated open requests focus existing window.
   */
  openSettings(initialTab) {
    if (this.settingsWin && !this.settingsWin.isDestroyed()) {
      if (this.settingsWin.isMinimized()) this.settingsWin.restore();
      if (!this.settingsWin.isVisible()) this.settingsWin.show();
      this.settingsWin.focus();
      if (initialTab) {
        this.settingsWin.webContents.send('settings:tab-change', { tab: initialTab });
      }
      return this.settingsWin;
    }

    // Two-Pane Split Layout bounds (migrated from legacy width: 540, height: 520)
    const defaultBounds = { width: 780, height: 560, minWidth: 700, minHeight: 480 };
    const saved = this.store ? this.store.get('settings_bounds', null) : null;
    const bounds = clampBoundsToWorkArea(saved, defaultBounds);

    this.settingsWin = new BrowserWindow({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      minWidth: 700,
      minHeight: 480,
      show: false,
      titleBarStyle: 'hidden',
      titleBarOverlay: false,
      transparent: false,
      backgroundColor: '#00000000',
      backgroundMaterial: 'acrylic',
      roundedCorners: true,
      skipTaskbar: false,
      focusable: true,
      alwaysOnTop: false,
      icon: this.iconPath,
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        spellcheck: false,
        backgroundThrottling: false,
      },
    });

    // Suppress native Windows active border highlighting safely
    if (this.settingsWin && typeof this.settingsWin.setAccentColor === 'function') {
      try { this.settingsWin.setAccentColor(false); } catch { /* platform fallback */ }
    }

    const targetUrl = this.devUrl
      ? `${this.devUrl}#settings`
      : `file://${this.distHtmlPath}#settings`;

    this.settingsWin.loadURL(targetUrl);

    this.settingsWin.once('ready-to-show', () => {
      if (this.settingsWin && !this.settingsWin.isDestroyed()) {
        this.settingsWin.show();
        this.settingsWin.focus();
        if (this.lastMediaState) {
          try {
            this.settingsWin.webContents.send('media', this.lastMediaState);
          } catch { }
        }
        if (initialTab) {
          this.settingsWin.webContents.send('settings:tab-change', { tab: initialTab });
        }
      }
    });

    this.settingsWin.on('maximize', () => {
      this.settingsWin?.webContents?.send?.('window:maximize-change', { isMaximized: true });
    });
    this.settingsWin.on('unmaximize', () => {
      this.settingsWin?.webContents?.send?.('window:maximize-change', { isMaximized: false });
    });

    const saveBounds = debounce(() => {
      if (!this.settingsWin || this.settingsWin.isDestroyed() || this.settingsWin.isMaximized()) return;
      try {
        const b = this.settingsWin.getBounds();
        this.store?.set('settings_bounds', b);
      } catch { }
    }, 400);

    this.settingsWin.on('resize', saveBounds);
    this.settingsWin.on('move', saveBounds);

    this.settingsWin.webContents.setWindowOpenHandler(({ url }) => {
      if (url && (url.startsWith('https:') || url.startsWith('http:'))) {
        shell.openExternal(url);
      }
      return { action: 'deny' };
    });
    this.settingsWin.webContents.on('will-navigate', (event) => event.preventDefault());

    this.settingsWin.on('closed', () => {
      this.settingsWin = null;
    });

    return this.settingsWin;
  }

  /**
   * Dedicated Fullscreen Cinema Mode (Immersive Visualizer & Lyrics)
   */
  openCinema() {
    // Hide top Island notch while in Fullscreen Cinema mode
    if (this.islandWin && !this.islandWin.isDestroyed()) {
      this.islandWin.hide();
    }

    if (this.cinemaWin && !this.cinemaWin.isDestroyed()) {
      if (this.cinemaWin.isMinimized()) this.cinemaWin.restore();
      if (!this.cinemaWin.isVisible()) this.cinemaWin.show();
      this.cinemaWin.focus();
      if (this.lastMediaState) {
        this.cinemaWin.webContents.send('media', this.lastMediaState);
      }
      return this.cinemaWin;
    }

    const primaryDisplay = screen ? screen.getPrimaryDisplay() : null;
    const bounds = primaryDisplay ? primaryDisplay.bounds : { x: 0, y: 0, width: 1920, height: 1080 };

    this.cinemaWin = new BrowserWindow({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      fullscreen: true,
      frame: false,
      transparent: false,
      backgroundColor: '#090a0f',
      show: false,
      skipTaskbar: false,
      focusable: true,
      alwaysOnTop: false,
      icon: this.iconPath,
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        spellcheck: false,
        backgroundThrottling: false,
      },
    });

    const targetUrl = this.devUrl
      ? `${this.devUrl}#cinema`
      : `file://${this.distHtmlPath}#cinema`;

    this.cinemaWin.loadURL(targetUrl);

    this.cinemaWin.once('ready-to-show', () => {
      if (this.cinemaWin && !this.cinemaWin.isDestroyed()) {
        this.cinemaWin.show();
        this.cinemaWin.focus();
        if (this.lastMediaState) {
          this.cinemaWin.webContents.send('media', this.lastMediaState);
        }
      }
    });

    this.cinemaWin.on('closed', () => {
      this.cinemaWin = null;
      // Restore Island notch when cinema window closes
      if (this.islandWin && !this.islandWin.isDestroyed()) {
        this.islandWin.show();
        this.islandWin.focus();
      }
    });

    return this.cinemaWin;
  }

  closeCinema() {
    if (this.cinemaWin && !this.cinemaWin.isDestroyed()) {
      this.cinemaWin.close();
      this.cinemaWin = null;
    }
    if (this.islandWin && !this.islandWin.isDestroyed()) {
      this.islandWin.show();
      this.islandWin.focus();
    }
  }

  /**
   * Optional Desktop Pet Window Control (Implementation D)
   * Turning on creates/shows petWin; turning off hides/destroys safely.
   */
  setPetVisible(vis, createPetWindowFn) {
    const isVis = Boolean(vis);
    if (this.store) this.store.set('island_pet_visible', isVis);

    if (isVis) {
      if (!this.petWin || this.petWin.isDestroyed()) {
        if (typeof createPetWindowFn === 'function') {
          this.petWin = createPetWindowFn();
        }
      } else {
        this.petWin.showInactive();
      }
    } else {
      if (this.petWin && !this.petWin.isDestroyed()) {
        this.petWin.hide();
        // Fully destroy window to stop Three.js WebGL rendering loop and free VRAM/RAM
        try {
          this.petWin.destroy();
        } catch { }
        this.petWin = null;
      }
    }

    this.broadcast('pet:visibility-changed', { visible: isVis });
    return isVis;
  }

  /**
   * Handles custom titlebar window controls (minimize, maximize, close) from IPC.
   * Sender is strictly determined via event.sender to prevent cross-window spoofing.
   */
  handleWindowControl(senderWebContents, action) {
    const targetWin = BrowserWindow.fromWebContents(senderWebContents);
    if (!targetWin || targetWin.isDestroyed()) return;

    if (action === 'minimize') {
      targetWin.minimize();
    } else if (action === 'maximize') {
      if (targetWin.isMaximized()) {
        targetWin.unmaximize();
      } else {
        targetWin.maximize();
      }
    } else if (action === 'close') {
      targetWin.close();
    }
  }

  isWindowMaximized(senderWebContents) {
    const targetWin = BrowserWindow.fromWebContents(senderWebContents);
    return targetWin && !targetWin.isDestroyed() ? targetWin.isMaximized() : false;
  }
}

module.exports = {
  WindowManager,
  clampBoundsToWorkArea,
};
