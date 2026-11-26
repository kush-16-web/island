'use strict';

const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');

const CAPTURE_DIR = path.join(__dirname, '..', 'assets', 'weather', 'captures');
const ARTIFACT_DIR = path.join(
  process.env.USERPROFILE || 'C:\\Users\\harsh',
  '.gemini',
  'antigravity',
  'brain',
  '00486437-adb7-44d3-9fef-0bfc4c041cc3'
);

if (!fs.existsSync(CAPTURE_DIR)) fs.mkdirSync(CAPTURE_DIR, { recursive: true });

function startServer(rootDir, port = 9876) {
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.json': 'application/json',
  };

  const server = http.createServer((req, res) => {
    let reqPath = decodeURI(req.url.split('?')[0]);
    if (reqPath === '/') reqPath = '/harness.html';

    // Map /weather/ to public/weather/ or assets/weather/
    let filePath;
    if (reqPath.startsWith('/weather/')) {
      filePath = path.join(rootDir, 'public', reqPath);
    } else {
      filePath = path.join(rootDir, reqPath.replace(/^\//, ''));
    }

    if (!fs.existsSync(filePath)) {
      res.writeHead(404);
      res.end('Not found: ' + reqPath);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
    });
    fs.createReadStream(filePath).pipe(res);
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      resolve(server);
    });
  });
}

// Ensure Chromium renders frames continuously even when off-screen
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-background-timer-throttling');

app.whenReady().then(async () => {
  console.log('[Phase B Capture] Starting local asset server on port 9876...');

  const server = await startServer(path.join(__dirname, '..'), 9876);

  // Write dedicated harness HTML with self-contained bundle
  const harnessHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <link rel="stylesheet" href="/src/styles.css">
      <style>
        body {
          margin: 0;
          padding: 16px;
          background: #000000;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          overflow: hidden;
        }
        #surface-container {
          width: 576px;
          height: 320px;
          border-radius: 28px;
          position: relative;
          overflow: hidden;
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.7);
        }
      </style>
      <script src="/assets/weather/daylight-renderer.bundle.js"></script>
    </head>
    <body>
      <div id="surface-container" class="ios-weather-surface">
        <div class="weather-atmosphere weather-atmosphere--daylight">
          <div class="weather-atmosphere__base-gradient"></div>
          <canvas id="gl-canvas" class="weather-atmosphere__gl-canvas"></canvas>
          <div class="weather-atmosphere__scrim"></div>
        </div>

        <div class="weather-surface__topbar" style="position: relative; z-index: 5; padding: 16px 20px 0;">
          <div class="weather-surface__back-btn" style="display: flex; align-items: center; gap: 4px;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m15 18-6-6 6-6"/></svg>
            <span class="weather-surface__back-text" style="color: #fff; font-weight: 600; font-size: 13.5px;">Weather</span>
          </div>
          <div style="color: #fff; font-size: 13px; font-weight: 600; opacity: 0.95; letter-spacing: -0.2px;" id="scene-indicator">Living Daylight Atmosphere</div>
          <div style="width: 26px;"></div>
        </div>

        <div class="weather-surface__hero" style="position: relative; z-index: 5; padding: 12px 24px;">
          <div class="weather-surface__hero-info">
            <div class="weather-surface__location-row" style="display: flex; align-items: center; gap: 4px; color: rgba(255, 255, 255, 0.9); font-size: 13px; font-weight: 600;">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
              <span id="hero-city">Surat</span>
            </div>
            <div class="weather-surface__temp-display" style="font-size: 54px; font-weight: 200; color: #ffffff; line-height: 1; margin: 4px 0 2px;">
              <span id="hero-temp">30°</span>
            </div>
            <div id="hero-condition" style="color: rgba(255, 255, 255, 0.88); font-size: 13.5px; font-weight: 500;">Clear Sky</div>
            <div class="weather-surface__hilo-text" style="color: rgba(255, 255, 255, 0.65); font-size: 12px; margin-top: 2px;">
              <span>H: 34°</span> · <span>L: 21°</span>
            </div>
          </div>
          <div class="weather-surface__hero-emblem" id="hero-emblem-wrap">
            <svg width="68" height="68" viewBox="0 0 100 100" fill="none">
              <circle cx="50" cy="50" r="46" fill="url(#apple-sun-corona)" />
              <circle cx="50" cy="50" r="24" fill="url(#apple-sun-core)" />
              <ellipse cx="44" cy="40" rx="10" ry="6" fill="rgba(255, 255, 255, 0.40)" transform="rotate(-25 44 40)" />
              <defs>
                <radialGradient id="apple-sun-corona" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stop-color="#fef08a" stop-opacity="0.45" />
                  <stop offset="50%" stop-color="#f59e0b" stop-opacity="0.15" />
                  <stop offset="100%" stop-color="#f59e0b" stop-opacity="0" />
                </radialGradient>
                <radialGradient id="apple-sun-core" cx="36%" cy="32%" r="68%">
                  <stop offset="0%" stop-color="#ffffff" />
                  <stop offset="32%" stop-color="#fef08a" />
                  <stop offset="72%" stop-color="#f59e0b" />
                  <stop offset="100%" stop-color="#d97706" />
                </radialGradient>
              </defs>
            </svg>
          </div>
        </div>

        <div style="position: relative; z-index: 5; margin: 0 20px; padding: 12px 16px; background: rgba(255, 255, 255, 0.08); backdrop-filter: blur(20px); border-radius: 18px; border: 1px solid rgba(255, 255, 255, 0.12); display: flex; justify-content: space-between; color: #fff;">
          <div><div style="font-size: 11px; opacity: 0.65;">FEELS LIKE</div><div style="font-size: 15px; font-weight: 600;">29°</div></div>
          <div><div style="font-size: 11px; opacity: 0.65;">HUMIDITY</div><div style="font-size: 15px; font-weight: 600;">48%</div></div>
          <div><div style="font-size: 11px; opacity: 0.65;">WIND</div><div style="font-size: 15px; font-weight: 600;">11 km/h</div></div>
          <div><div style="font-size: 11px; opacity: 0.65;">PRECIPITATION</div><div style="font-size: 15px; font-weight: 600;">0%</div></div>
        </div>
      </div>

      <script>
        const canvas = document.getElementById('gl-canvas');
        const RendererClass = window.DaylightSkyRendererBundle.DaylightSkyRenderer;
        window.renderer = new RendererClass(canvas);
        window.renderer.resize(576, 320);
        window.renderer.start();

        window.measurePerformance = () => {
          let frames = 0;
          let samples = [];
          let lastT = performance.now();

          return new Promise(resolve => {
            function loop(now) {
              const dt = now - lastT;
              lastT = now;
              if (dt > 0) samples.push(1000 / dt);
              frames++;
              if (frames < 50) {
                requestAnimationFrame(loop);
              } else {
                const avgFps = samples.reduce((a, b) => a + b, 0) / samples.length;
                resolve({
                  fps: Math.round(avgFps * 10) / 10,
                  minFps: Math.round(Math.min(...samples) * 10) / 10,
                  maxFps: Math.round(Math.max(...samples) * 10) / 10,
                });
              }
            }
            requestAnimationFrame(loop);
          });
        };

        window.setScene = (config) => {
          document.getElementById('scene-indicator').textContent = config.label;
          document.getElementById('hero-condition').textContent = config.cond;
          document.getElementById('hero-temp').textContent = config.temp + '°';
          
          window.renderer.setTelemetry({
            solarElevation: config.elev,
            cloudCover: config.cloud,
            windSpeed: config.windSpeed || 10,
            windDirectionDeg: config.windDir || 45,
            weatherCode: config.code || 0
          });
        };
      </script>
    </body>
    </html>
  `;

  fs.writeFileSync(path.join(__dirname, '..', 'harness.html'), harnessHtml);

  const win = new BrowserWindow({
    width: 610,
    height: 360,
    x: -2000,
    y: -2000,
    show: true,
    focusable: false,
    frame: false,
    transparent: true,
    webPreferences: {
      webSecurity: false,
    },
  });

  win.webContents.on('console-message', (e, level, msg) => {
    console.log('[Renderer Console]', msg);
  });

  await win.loadURL('http://127.0.0.1:9876/harness.html');
  await new Promise(r => setTimeout(r, 1200));

  console.log('[Phase B Capture] Connected to harness. Measuring baseline WebGL performance...');

  const perfMetrics = await win.webContents.executeJavaScript('window.measurePerformance()');
  console.log(`[Phase B Capture] Measured Frame Rate: ${perfMetrics.fps} FPS (min: ${perfMetrics.minFps}, max: ${perfMetrics.maxFps})`);

  const SCENARIOS = [
    {
      id: 'clear-noon',
      label: 'Clear Sky (Noon)',
      cond: 'Clear Sky · Solar Elevation 52°',
      elev: 52,
      cloud: 4,
      temp: 32,
      code: 0,
    },
    {
      id: 'mostly-clear',
      label: 'Mostly Clear (Midday)',
      cond: 'Mainly Clear · High Sun',
      elev: 38,
      cloud: 22,
      temp: 30,
      code: 1,
    },
    {
      id: 'partly-cloudy',
      label: 'Partly Cloudy',
      cond: 'Partly Cloudy · Billowing Cumulus',
      elev: 28,
      cloud: 48,
      temp: 28,
      code: 2,
    },
    {
      id: 'mostly-cloudy',
      label: 'Mostly Cloudy',
      cond: 'Mostly Cloudy · Stratocumulus',
      elev: 22,
      cloud: 76,
      temp: 26,
      code: 3,
    },
    {
      id: 'overcast',
      label: 'Overcast Deck',
      cond: 'Overcast · Diffuse Sky',
      elev: 16,
      cloud: 96,
      temp: 24,
      code: 3,
    },
    {
      id: 'golden-hour',
      label: 'Golden Hour (Sunset Horizon)',
      cond: 'Golden Hour · Amber Scattering (6.5°)',
      elev: 6.5,
      cloud: 28,
      temp: 27,
      code: 1,
    },
    {
      id: 'sunset',
      label: 'Sunset Glow (Horizon Angle 1°)',
      cond: 'Sunset · Vermilion Horizon Glow (1.0°)',
      elev: 1.0,
      cloud: 36,
      temp: 25,
      code: 1,
    },
    {
      id: 'twilight',
      label: 'Civil Twilight (Blue Hour)',
      cond: 'Civil Twilight · Cobalt-Magenta Sky (-3.5°)',
      elev: -3.5,
      cloud: 14,
      temp: 23,
      code: 0,
    },
  ];

  for (const sc of SCENARIOS) {
    console.log(`[Phase B Capture] Transitioning to "${sc.label}"...`);
    await win.webContents.executeJavaScript(`window.setScene(${JSON.stringify(sc)})`);

    // Allow 800ms for smooth parametric lerping and texture drift
    await new Promise(r => setTimeout(r, 850));

    // Capture exact PNG
    const image = await win.capturePage();
    const pngBuf = image.toPNG();

    const fileName = `daylight-${sc.id}.png`;
    const outPath = path.join(CAPTURE_DIR, fileName);
    fs.writeFileSync(outPath, pngBuf);

    try {
      const artPath = path.join(ARTIFACT_DIR, fileName);
      fs.writeFileSync(artPath, pngBuf);
    } catch {}

    console.log(`✓ Captured: ${fileName} (${(pngBuf.length / 1024).toFixed(1)} KB)`);
  }

  // Memory & CPU telemetry
  const mem = process.memoryUsage();
  const cpu = process.cpuUsage();

  console.log('\n=============================================');
  console.log('REAL ELECTRON MEASURED PERFORMANCE METRICS:');
  console.log(`- Frame Rate: ${perfMetrics.fps} FPS (Native 60Hz Display Target)`);
  console.log(`- Min Frame Rate: ${perfMetrics.minFps} FPS / Max: ${perfMetrics.maxFps} FPS`);
  console.log(`- Process Heap Used: ${(mem.heapUsed / 1024 / 1024).toFixed(2)} MB`);
  console.log(`- Process Heap Total: ${(mem.heapTotal / 1024 / 1024).toFixed(2)} MB`);
  console.log(`- RSS Memory: ${(mem.rss / 1024 / 1024).toFixed(2)} MB`);
  console.log(`- User CPU Time: ${(cpu.user / 1000).toFixed(1)} ms`);
  console.log(`- System CPU Time: ${(cpu.system / 1000).toFixed(1)} ms`);
  console.log('=============================================\n');

  try { fs.unlinkSync(path.join(__dirname, '..', 'harness.html')); } catch {}
  server.close();
  win.destroy();
  app.quit();
});
