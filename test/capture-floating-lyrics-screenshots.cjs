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
      backgroundThrottling: false
    }
  });

  const harnessPath = path.resolve(__dirname, 'floating-lyrics-verification.html');
  await win.loadFile(harnessPath);

  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

  // Initial delay for Electron to render CSS layout and fonts
  await new Promise(r => setTimeout(r, 1000));

  async function captureScenario(scenarioName, filename, waitMs = 1100) {
    await win.webContents.executeJavaScript(`window.setViewScenario('${scenarioName}')`);
    await new Promise(r => setTimeout(r, waitMs));
    const image = await win.webContents.capturePage();
    const buffer = image.toPNG();
    const dest = path.join(ARTIFACT_DIR, filename);
    fs.writeFileSync(dest, buffer);
    console.log(`Saved screenshot: ${filename} (${buffer.length} bytes) to ${dest}`);
  }

  // 1. Initial floating composition (Exact Reference Anchors, centered 132px cover)
  await captureScenario('floating_composition', 'screenshot_floating_composition.png', 1100);

  // 2. Active lyric transition with staggered entrance
  await captureScenario('active_transition', 'screenshot_active_transition.png', 1100);

  // 3. Normal mode (synchronized scrolling reel)
  await captureScenario('normal_mode', 'screenshot_normal_mode.png', 600);

  // 4. Long lyric line (cleanly excerpted without paragraph cards)
  await captureScenario('long_lyric_line', 'screenshot_long_lyric_line.png', 1100);

  // 5. Music-note button: Lyrics hidden mode (clean centered artwork, showLyrics=false)
  await captureScenario('music_note_hidden', 'screenshot_music_note_hidden.png', 800);

  // 6. Layout settings popover (Lyrics Layout & Typography)
  await captureScenario('layout_settings', 'screenshot_layout_settings.png', 700);

  console.log('All Pass 2.2.10.2 screenshots captured successfully.');
  app.quit();
});
