'use strict';

const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const ARTIFACT_DIR = 'C:/Users/harsh/.gemini/antigravity-ide/brain/6b7fbad8-f30d-40fe-b5d1-48e89f0091f3';

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 480,
    height: 560,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#090a0f',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
    },
  });

  const harnessPath = path.resolve(__dirname, '../../test/harness/floating-lyrics-verification.html');
  await win.loadFile(harnessPath);

  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

  // Initial delay for Electron to render CSS layout and fonts
  await new Promise((r) => setTimeout(r, 1200));

  async function captureScenario(scenarioName, filename, waitMs = 1200) {
    await win.webContents.executeJavaScript(`window.setViewScenario('${scenarioName}')`);
    await new Promise((r) => setTimeout(r, waitMs));
    const image = await win.webContents.capturePage();
    const buffer = image.toPNG();
    const dest = path.join(ARTIFACT_DIR, filename);
    fs.writeFileSync(dest, buffer);
    console.log(`Saved screenshot: ${filename} (${buffer.length} bytes) to ${dest}`);
  }

  // 1. A short lyric composition (Heartless / Chest Pain)
  await captureScenario('short_composition', 'screenshot_short_composition.png', 1300);

  // 2. A long lyric fitted into available space (Content-Aware Placement)
  await captureScenario('long_lyric_fitted', 'screenshot_long_lyric_fitted.png', 1300);

  // 3. Two consecutive long lyrics using different suitable positions (Zone Alternation)
  await captureScenario('consecutive_variation', 'screenshot_consecutive_variation.png', 1300);

  // 4. A fragment emerging from the background
  await captureScenario('fragment_emerging', 'screenshot_fragment_emerging.png', 1300);

  // 5. A fragment dissolving into the background
  await captureScenario('fragment_dissolving', 'screenshot_fragment_dissolving.png', 1300);

  // 6. Normal mode after switching back
  await captureScenario('normal_mode', 'screenshot_normal_mode.png', 700);

  // 7. Music-note button: lyrics hidden state
  await captureScenario('music_note_hidden', 'screenshot_music_note_hidden.png', 800);

  // 8. Dev-only debug visualization overlay
  await captureScenario('debug_overlay', 'screenshot_debug_overlay.png', 900);

  console.log('All Pass 2.2.10.3 screenshots captured successfully.');
  app.quit();
});
