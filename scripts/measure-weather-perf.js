'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const PRELOAD_PATH = path.resolve(__dirname, '../electron/preload.js');

app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('ignore-gpu-blocklist');

app.whenReady().then(async () => {
  console.log('[Perf Measurement] Booting Electron for empirical weather benchmark...');

  const mockSurat = {
    city: 'Surat',
    temp: 31,
    high: 33,
    low: 20,
    condition: 'Sunny',
    weatherCode: 0,
    isDay: true,
    feelsLike: 37,
    humidity: 42,
    windSpeed: 2,
    windDirectionDeg: 315,
    windDisplay: '2 km/h Northwest',
    rainChance: 0,
    sourceAttribution: 'Microsoft Weather / Foreca',
    isStale: false,
    astronomy: {
      solarElevation: 35.5,
      twilightPhase: 'daylight',
      lunar: {
        fractionIlluminated: 0.98,
        waxing: false,
        phaseName: 'Full Moon'
      }
    },
    hourlyForecast: [
      { time: 'Now', temp: 31, weatherCode: 0, isDay: true },
      { time: '2 PM', temp: 33, weatherCode: 1, isDay: true },
      { time: '3 PM', temp: 33, weatherCode: 1, isDay: true },
      { time: '4 PM', temp: 31, weatherCode: 1, isDay: true },
      { time: '5 PM', temp: 29, weatherCode: 1, isDay: true },
      { time: '6 PM', temp: 27, weatherCode: 0, isDay: false }
    ],
    dailyForecasts: [
      { day: 'Today', low: 20, high: 33, weatherCode: 0, condition: 'Sunny' },
      { day: 'Thu', low: 20, high: 33, weatherCode: 0, condition: 'Sunny' },
      { day: 'Fri', low: 21, high: 34, weatherCode: 1, condition: 'Mostly sunny' },
      { day: 'Sat', low: 21, high: 34, weatherCode: 1, condition: 'Mostly sunny' },
      { day: 'Sun', low: 20, high: 33, weatherCode: 0, condition: 'Sunny' },
      { day: 'Mon', low: 19, high: 32, weatherCode: 0, condition: 'Sunny' },
      { day: 'Tue', low: 18, high: 31, weatherCode: 0, condition: 'Sunny' }
    ]
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
    weather: mockSurat,
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
  ipcMain.handle('weather:get', () => mockSurat);
  ipcMain.handle('weather:fetch', () => mockSurat);

  const win = new BrowserWindow({
    width: 720,
    height: 480,
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

  // Navigate into weather and let layout settle
  await win.webContents.executeJavaScript(`
    (() => {
      localStorage.setItem('island_weather_cache', JSON.stringify(${JSON.stringify(mockSurat)}));
      localStorage.setItem('island_idle_flags', JSON.stringify({ leftWidget: 'weather', rightWidget: 'clock' }));

      window.dispatchEvent(new CustomEvent('island:navigate', { detail: { tab: 'launcher', openHub: true } }));
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('island:utility-change', { detail: { activeUtility: 'weather' } }));
      }, 120);
    })()
  `);

  await sleep(2000);

  // Measure 120 consecutive frames in renderer
  const rendererMetrics = await win.webContents.executeJavaScript(`
    new Promise((resolve) => {
      const frameDeltas = [];
      let lastTime = performance.now();
      let framesCount = 0;
      const targetFrames = 120;

      function sampleFrame(now) {
        const delta = now - lastTime;
        lastTime = now;
        if (framesCount > 0) { // ignore first jump
          frameDeltas.push(delta);
        }
        framesCount++;
        if (framesCount <= targetFrames) {
          requestAnimationFrame(sampleFrame);
        } else {
          // Analyze frame times
          const sorted = [...frameDeltas].sort((a, b) => a - b);
          const sum = frameDeltas.reduce((a, b) => a + b, 0);
          const avg = sum / frameDeltas.length;
          const min = sorted[0];
          const max = sorted[sorted.length - 1];
          const p95 = sorted[Math.floor(sorted.length * 0.95)];
          const fps = 1000 / avg;

          // Memory info
          const mem = performance.memory ? {
            usedJSHeapMB: +(performance.memory.usedJSHeapSize / (1024 * 1024)).toFixed(2),
            totalJSHeapMB: +(performance.memory.totalJSHeapSize / (1024 * 1024)).toFixed(2),
          } : null;

          resolve({
            sampleCount: frameDeltas.length,
            avgFrameTimeMs: +avg.toFixed(3),
            minFrameTimeMs: +min.toFixed(3),
            maxFrameTimeMs: +max.toFixed(3),
            p95FrameTimeMs: +p95.toFixed(3),
            effectiveFps: +fps.toFixed(1),
            rendererMemory: mem,
          });
        }
      }

      requestAnimationFrame(sampleFrame);
    })
  `);

  // Measure Electron process metrics (GPU and Renderer PIDs)
  const appMetrics = app.getAppMetrics();
  const gpuMetric = appMetrics.find((m) => m.type === 'GPU');
  const rendererMetric = appMetrics.find((m) => m.type === 'Tab');
  const mainMetric = appMetrics.find((m) => m.type === 'Browser');

  const mainProcessMem = await process.getProcessMemoryInfo();

  const report = {
    tag: process.argv[2] || 'baseline',
    timestamp: new Date().toISOString(),
    frameTiming: rendererMetrics,
    gpuProcess: gpuMetric ? {
      pid: gpuMetric.pid,
      cpuPercent: +gpuMetric.cpu.percentCPUUsage.toFixed(2),
      workingSetMB: +(gpuMetric.memory.workingSetSize / 1024).toFixed(2),
      privateMB: +(gpuMetric.memory.privateBytes / 1024).toFixed(2),
    } : null,
    rendererProcess: rendererMetric ? {
      pid: rendererMetric.pid,
      cpuPercent: +rendererMetric.cpu.percentCPUUsage.toFixed(2),
      workingSetMB: +(rendererMetric.memory.workingSetSize / 1024).toFixed(2),
      privateMB: +(rendererMetric.memory.privateBytes / 1024).toFixed(2),
    } : null,
    mainProcess: {
      residentSetMB: +(mainProcessMem.residentSet / 1024).toFixed(2),
      privateMB: +(mainProcessMem.private / 1024).toFixed(2),
    }
  };

  console.log('--- EMPIRICAL METRICS RESULT ---');
  console.log(JSON.stringify(report, null, 2));

  const outPath = path.resolve(__dirname, `../perf-${report.tag}.json`);
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

  win.close();
  app.quit();
});
