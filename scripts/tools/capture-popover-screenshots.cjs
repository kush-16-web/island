'use strict';

const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const ARTIFACT_DIR = 'C:/Users/harsh/.gemini/antigravity/brain/00486437-adb7-44d3-9fef-0bfc4c041cc3';

app.whenReady().then(async () => {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

  const win = new BrowserWindow({
    width: 620,
    height: 480,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#0a0b0f',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
    },
  });

  const harnessPath = path.resolve(__dirname, '../../test/harness/popover-visual-verification.html');
  await win.loadFile(harnessPath);

  // Wait for font and CSS engine to settle
  await new Promise((r) => setTimeout(r, 1200));

  win.webContents.on('console-message', (e, level, message) => {
    console.log(`[WebContents] ${message}`);
  });

  async function captureScenario(scenarioName, filename, width = 620, height = 480) {
    win.setSize(width, height);
    await new Promise((r) => setTimeout(r, 400));
    const res = await win.webContents.executeJavaScript(`
      try {
        window.setScenario('${scenarioName}');
        'ok';
      } catch (err) {
        err.message;
      }
    `);
    console.log(`Scenario ${scenarioName}: ${res}`);
    await new Promise((r) => setTimeout(r, 600));
    const image = await win.webContents.capturePage();
    const buffer = image.toPNG();
    const dest = path.join(ARTIFACT_DIR, filename);
    fs.writeFileSync(dest, buffer);
    console.log(`Saved screenshot: ${filename} (${buffer.length} bytes)`);
  }

  // 1. Blue album artwork (as shown in user regression report)
  await captureScenario('blue_artwork', 'screenshot_popover_blue_artwork.png', 620, 480);

  // 2. Dark album artwork
  await captureScenario('dark_artwork', 'screenshot_popover_dark_artwork.png', 620, 480);

  // 3. Bright album artwork
  await captureScenario('bright_artwork', 'screenshot_popover_bright_artwork.png', 620, 480);

  // 4. Compact player view
  await captureScenario('blue_artwork', 'screenshot_popover_compact_player.png', 560, 420);

  // 5. Expanded full lyrics view
  await captureScenario('expanded_full_lyrics', 'screenshot_popover_expanded_lyrics.png', 640, 480);

  // 6. Constrained small window size
  await captureScenario('small_window', 'screenshot_popover_small_window.png', 440, 320);

  console.log('All visual verification screenshots captured successfully.');
  app.quit();
});
