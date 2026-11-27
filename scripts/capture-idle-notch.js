'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const CAPTURE_DIR = path.resolve(__dirname, '../assets/weather/captures');
const ARTIFACT_DIR = path.resolve('C:/Users/harsh/.gemini/antigravity/brain/00486437-adb7-44d3-9fef-0bfc4c041cc3');
const PRELOAD_PATH = path.resolve(__dirname, '../electron/preload.js');

if (!fs.existsSync(CAPTURE_DIR)) fs.mkdirSync(CAPTURE_DIR, { recursive: true });

app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('ignore-gpu-blocklist');

app.whenReady().then(async () => {
  console.log('[Idle Notch Capture] Starting Electron instance...');

  const mockWeatherNight = {
    city: 'Surat',
    temp: 30,
    condition: 'Clear',
    weatherCode: 0,
    isDay: false,
    astronomy: { solarElevation: -25, twilightPhase: 'night' }
  };

  const mockWeatherDay = {
    city: 'Surat',
    temp: 31,
    condition: 'Sunny',
    weatherCode: 0,
    isDay: true,
    astronomy: { solarElevation: 35, twilightPhase: 'daylight' }
  };

  ipcMain.handle('window:is-maximized', () => false);
  ipcMain.handle('window:get-dynamic-frosted-color', () => '#0e3472');
  ipcMain.handle('settings:get-appearance-mode', () => 'dynamic_frosted');
  ipcMain.handle('island:get-appearance', () => 'dynamic_frosted');
  ipcMain.handle('state:get', () => ({
    schedule: [],
    inbox: [],
    rings: [],
    media: { active: false },
    playbackState: 'PAUSED',
    status: 'paused',
    weather: mockWeatherNight,
  }));
  ipcMain.handle('window:get-dock', () => false);
  ipcMain.handle('notch:get-visibility-mode', () => 'always');
  ipcMain.handle('win:get-cursor-context', () => ({ x: 0, y: 0 }));
  ipcMain.handle('diagnostics:get-system-status', () => ({ ok: true }));
  ipcMain.handle('app-volume:get-capabilities', () => ({ supported: true }));
  ipcMain.handle('app-volume:get-volume', () => ({ volume: 75, muted: false }));
  ipcMain.handle('media:get-volume', () => ({ volume: 75, muted: false }));
  ipcMain.handle('companion:get-status', () => ({ connected: false }));
  ipcMain.handle('windows-tts:cancel', () => true);
  ipcMain.handle('kokoro:cancel', () => true);
  ipcMain.handle('companion:dispatch', () => true);
  ipcMain.handle('weather:get', () => mockWeatherNight);
  ipcMain.handle('weather:fetch', () => mockWeatherNight);

  const win = new BrowserWindow({
    width: 600,
    height: 200,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    webPreferences: {
      preload: PRELOAD_PATH,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
    show: false,
  });

  await win.loadFile(path.resolve(__dirname, '../dist/index.html'));
  win.show();

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  await sleep(600);

  // Seed idle flags with weather on left, battery on right, centered eyes
  await win.webContents.executeJavaScript(`
    (() => {
      localStorage.setItem('island_idle_flags', JSON.stringify({
        leftWidget: 'weather',
        rightWidget: 'battery',
        showEyes: true,
      }));
      localStorage.setItem('island_weather_cache', JSON.stringify(${JSON.stringify(mockWeatherNight)}));
      window.dispatchEvent(new CustomEvent('island:idle-prefs-changed'));
    })()
  `);
  await sleep(1000);

  async function captureNotch(filename, label) {
    const bounds = await win.webContents.executeJavaScript(`
      (() => {
        const notch = document.querySelector('.island--notch') || document.querySelector('.island');
        if (!notch) return null;
        const r = notch.getBoundingClientRect();
        return {
          x: Math.max(0, Math.floor(r.left - 8)),
          y: Math.max(0, Math.floor(r.top - 4)),
          width: Math.min(Math.ceil(r.width + 16), 600),
          height: Math.min(Math.ceil(r.height + 8), 200),
          renderedWidth: Math.round(r.width),
          renderedHeight: Math.round(r.height),
        };
      })()
    `);

    const image = await win.webContents.capturePage(bounds || undefined);
    const localFile = path.join(CAPTURE_DIR, filename);
    const artifactFile = path.join(ARTIFACT_DIR, filename);
    fs.writeFileSync(localFile, image.toPNG());
    fs.writeFileSync(artifactFile, image.toPNG());
    console.log(`[Captured] ${label} -> ${filename} (${bounds ? `${bounds.renderedWidth}x${bounds.renderedHeight}px` : 'full'})`);
  }

  // 1. Capture Night Weather + 86% Battery
  await captureNotch('idle-notch-ios-night.png', 'Idle Notch (Night Moon 30° + iOS Battery 86%)');

  // 2. Switch to Day Weather + 86% Battery
  await win.webContents.executeJavaScript(`
    (() => {
      localStorage.setItem('island_weather_cache', JSON.stringify(${JSON.stringify(mockWeatherDay)}));
      window.dispatchEvent(new CustomEvent('island:weather-updated', { detail: ${JSON.stringify(mockWeatherDay)} }));
    })()
  `);
  await sleep(500);
  await captureNotch('idle-notch-ios-day.png', 'Idle Notch (Day Sun 31° + iOS Battery 86%)');

  console.log('[Idle Notch Capture] Successfully captured all states!');
  win.close();
  app.quit();
});
