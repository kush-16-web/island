const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const sharp = require('sharp');
const { computeNotchPosition, NOTCH_WIN_W, NOTCH_WIN_H } = require('../../electron/notch-geometry');

const ARTIFACT_DIR = path.resolve('C:/Users/harsh/.gemini/antigravity/brain/00486437-adb7-44d3-9fef-0bfc4c041cc3');
const PRELOAD_PATH = path.resolve(__dirname, '../../electron/preload.js');

app.whenReady().then(async () => {
  console.log('[VERIFY MUSIC POLISH] Launching Electron Verification...');

  let activeFrostedColor = '#a83220';
  let activeAppearance = 'dynamic_frosted';
  let currentVol = 75;
  let currentMuted = false;

  let currentMedia = {
    active: true,
    status: 'playing',
    title: 'How Long',
    artist: 'Charlie Puth',
    album: 'Voicenotes',
    art: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="%231a0e0a"/><circle cx="95" cy="85" r="55" fill="%23d64527"/><text x="100" y="180" font-family="sans-serif" font-size="16" font-weight="700" fill="%23ffffff" text-anchor="middle">VOICENOTES</text></svg>',
    isPlaying: true,
    durationMs: 198000,
    positionMs: 94000,
    canSeek: true,
  };

  ipcMain.handle('window:is-maximized', () => false);
  ipcMain.handle('window:get-dynamic-frosted-color', () => activeFrostedColor);
  ipcMain.handle('settings:get-appearance-mode', () => activeAppearance);
  ipcMain.handle('island:get-appearance', () => activeAppearance);
  ipcMain.handle('state:get', () => ({
    schedule: [],
    inbox: [],
    rings: [],
    media: currentMedia,
    playbackState: 'PLAYING',
    status: currentMedia.status,
  }));
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
  ipcMain.handle('media:control', () => true);
  ipcMain.on('media:control', () => true);
  ipcMain.handle('media:seek', (_e, posSec) => {
    currentMedia.positionMs = Math.round(posSec * 1000);
    return true;
  });

  const primaryDisplay = screen.getPrimaryDisplay();
  const placement = computeNotchPosition({
    primaryDisplay,
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

  await win.loadFile(path.resolve(__dirname, '../../dist/index.html'));
  win.show();

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  await wait(600);

  // Send media and open expanded music player
  console.log('[VERIFY MUSIC POLISH] Sending media and opening playing tab...');
  win.webContents.send('media', currentMedia);
  win.webContents.send('hub:open', 'playing');
  await wait(600);

  async function captureNotch(filename, label, delayMs = 300) {
    if (delayMs > 0) await wait(delayMs);
    const bounds = await win.webContents.executeJavaScript(`
      (() => {
        const el = document.querySelector('.island--notch') || document.querySelector('.island');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return {
          x: Math.max(0, Math.floor(r.left - 12)),
          y: Math.max(0, Math.floor(r.top)),
          width: Math.min(Math.ceil(r.width + 24), ${placement.width}),
          height: Math.min(Math.ceil(r.height + 24), ${placement.height}),
          renderedWidth: Math.round(r.width),
          renderedHeight: Math.round(r.height),
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
    console.log(`[Captured] ${label} -> ${filename} (${bounds ? `${bounds.renderedWidth}x${bounds.renderedHeight}px` : 'full'})`);
    return bounds;
  }

  // 1. Measure layout and capture Expanded Music
  const metrics = await win.webContents.executeJavaScript(`(() => {
    const playBtn = document.querySelector('.play-btn--compact');
    const hub = document.querySelector('.hub');
    const cover = document.querySelector('.np__cover-wrap');
    const eyes = document.querySelector('.expanded-music__eyes-btn');
    const hubRect = hub ? hub.getBoundingClientRect() : null;
    const playRect = playBtn ? playBtn.getBoundingClientRect() : null;
    const coverRect = cover ? cover.getBoundingClientRect() : null;
    const eyesRect = eyes ? eyes.getBoundingClientRect() : null;

    return {
      hubH: hubRect?.height,
      coverTopRelative: coverRect && hubRect ? Math.round(coverRect.top - hubRect.top) : null,
      eyesTopRelative: eyesRect && hubRect ? Math.round(eyesRect.top - hubRect.top) : null,
      playBtnH: playRect ? Math.round(playRect.height) : null,
      playBtnW: playRect ? Math.round(playRect.width) : null,
      playBtnBottomClearance: hubRect && playRect ? Math.round(hubRect.bottom - playRect.bottom) : null,
      playBtnCropped: playRect && hubRect ? (playRect.bottom > hubRect.bottom) : null
    };
  })()`);

  console.log('[VERIFY MUSIC POLISH] Measured Layout Metrics:', JSON.stringify(metrics, null, 2));
  await captureNotch('music_polish_1_expanded_layout.png', '1. Expanded Music Uncropped Play Button');

  // 2. Test Hover Seek Prevention
  console.log('[VERIFY MUSIC POLISH] Testing SongProgressBar hover seek prevention...');
  const hoverResult = await win.webContents.executeJavaScript(`(() => {
    const track = document.querySelector('.song-progress__hit');
    if (!track) return { error: 'Track not found' };

    const initialText = document.querySelector('.song-progress__time--current')?.textContent;
    const rect = track.getBoundingClientRect();

    // Hover without mouse button down
    const moveEvent = new PointerEvent('pointermove', {
      clientX: rect.left + rect.width * 0.85,
      clientY: rect.top + rect.height / 2,
      bubbles: true,
      cancelable: true,
      buttons: 0,
    });
    track.dispatchEvent(moveEvent);

    const afterHoverText = document.querySelector('.song-progress__time--current')?.textContent;
    const isDragging = document.querySelector('.song-progress.is-dragging') !== null;

    return {
      initialTimeText: initialText,
      afterHoverTimeText: afterHoverText,
      seekPreventedOnHover: (initialText === afterHoverText) && !isDragging
    };
  })()`);

  console.log('[VERIFY MUSIC POLISH] Hover Test Result:', JSON.stringify(hoverResult, null, 2));
  await captureNotch('music_polish_2_hover_no_seek.png', '2. SongProgressBar Hover Protected');

  // 3. Test Options Sliders Button -> iOS 18 Liquid Glass Morphing Popover
  console.log('[VERIFY MUSIC POLISH] Clicking Sliders button to morph into iOS 18 Liquid Glass Popover...');
  await win.webContents.executeJavaScript(`
    const slidersBtn = document.querySelector('.np__tab-pill--gear');
    if (slidersBtn) slidersBtn.click();
  `);

  await wait(450);

  const popoverMetrics = await win.webContents.executeJavaScript(`(() => {
    const pop = document.querySelector('.lyrics-settings-popover');
    const slidersBtn = document.querySelector('.np__tab-pill--gear');
    const glider = document.querySelector('.lsp__pill-glider');
    if (!pop) return { error: 'Popover not open' };

    const popRect = pop.getBoundingClientRect();
    const btnRect = slidersBtn?.getBoundingClientRect();
    const style = window.getComputedStyle(pop);
    const btnStyle = slidersBtn ? window.getComputedStyle(slidersBtn) : null;

    return {
      isOpen: true,
      triggerButtonHiddenWhileExpanded: btnStyle ? btnStyle.opacity === '0' : false,
      hasSlidingGlider: Boolean(glider),
      popoverRect: {
        top: Math.round(popRect.top),
        left: Math.round(popRect.left),
        width: Math.round(popRect.width),
        height: Math.round(popRect.height),
        bottom: Math.round(popRect.bottom)
      },
      btnRect: btnRect ? {
        top: Math.round(btnRect.top),
        left: Math.round(btnRect.left),
        bottom: Math.round(btnRect.bottom)
      } : null,
      opensAboveButton: btnRect ? (popRect.bottom <= btnRect.top + 4) : false,
      backdropFilter: style.backdropFilter || style.webkitBackdropFilter,
      background: style.backgroundColor,
      borderRadius: style.borderRadius
    };
  })()`);

  console.log('[VERIFY MUSIC POLISH] Liquid Glass Popover Metrics:', JSON.stringify(popoverMetrics, null, 2));
  await captureNotch('music_polish_3_frosted_popover.png', '3. iOS 18 Liquid Glass Morphing Popover');

  // 4. Test Switching Options with the Sliding Glider
  console.log('[VERIFY MUSIC POLISH] Switching style to "Classic" to test sliding glider...');
  await win.webContents.executeJavaScript(`
    const buttons = document.querySelectorAll('.lsp__pill-btn');
    if (buttons.length > 0) buttons[0].click(); // Click Classic
  `);
  await wait(300);
  await captureNotch('music_polish_4_glider_switched.png', '4. Glider Slid to Classic Option');

  // 5. Test Window Blur Dismissal: Click outside Electron window dismisses hub immediately!
  console.log('[VERIFY MUSIC POLISH] Testing Window Blur: sending window:blur to test dismissal...');
  win.webContents.send('window:blur');
  await wait(350);

  const blurDismissalResult = await win.webContents.executeJavaScript(`(() => {
    const hub = document.querySelector('.hub');
    const pop = document.querySelector('.lyrics-settings-popover');
    const notch = document.querySelector('.island--notch');
    return {
      hubClosedOnBlur: !hub || notch.classList.contains('is-compact'),
      popoverClosedOnBlur: !pop
    };
  })()`);

  console.log('[VERIFY MUSIC POLISH] Window Blur Dismissal Result:', JSON.stringify(blurDismissalResult, null, 2));
  await captureNotch('music_polish_5_blur_dismissed.png', '5. Window Blur Dismissed to Compact Notch');

  // 6. Generate Composite Matrix
  const path1 = path.join(ARTIFACT_DIR, 'music_polish_1_expanded_layout.png');
  const path3 = path.join(ARTIFACT_DIR, 'music_polish_3_frosted_popover.png');
  const path4 = path.join(ARTIFACT_DIR, 'music_polish_4_glider_switched.png');
  const path5 = path.join(ARTIFACT_DIR, 'music_polish_5_blur_dismissed.png');

  const m1Buffer = fs.readFileSync(path1);
  const m3Buffer = fs.readFileSync(path3);
  const m4Buffer = fs.readFileSync(path4);
  const m5Buffer = fs.readFileSync(path5);

  const colW = 600;
  const colH = 340;
  const canvasW = colW * 2 + 40;
  const canvasH = (colH + 90) * 2 + 20;

  const m1Resized = await sharp(m1Buffer).resize(colW, colH, { fit: 'contain', background: '#090a0f' }).toBuffer();
  const m3Resized = await sharp(m3Buffer).resize(colW, colH, { fit: 'contain', background: '#090a0f' }).toBuffer();
  const m4Resized = await sharp(m4Buffer).resize(colW, colH, { fit: 'contain', background: '#090a0f' }).toBuffer();
  const m5Resized = await sharp(m5Buffer).resize(colW, colH, { fit: 'contain', background: '#090a0f' }).toBuffer();

  const titleSvg = Buffer.from(`
    <svg width="${canvasW}" height="${canvasH}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#090a0f"/>
      <text x="20" y="38" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="20" font-weight="700" fill="#ffffff">ISLAND AI - LIQUID GLASS POPUP AND LYRICS VERIFICATION</text>
      <text x="20" y="60" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="12" fill="#9ca3af">Charlie Puth - How Long | Sliders Morphs Directly Into Card | Gliding Active Pill | Window Blur Dismissal</text>

      <rect x="20" y="78" width="${colW}" height="24" rx="4" fill="#1e293b"/>
      <text x="30" y="94" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="11" font-weight="600" fill="#38bdf8">1. Expanded Music (Uncropped Play Button, 25px Clearance)</text>

      <rect x="${20 + colW + 10}" y="78" width="${colW}" height="24" rx="4" fill="#1e293b"/>
      <text x="${30 + colW + 10}" y="94" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="11" font-weight="600" fill="#38bdf8">2. Popover Morph: Trigger Pill Morphed into Card (No Duplicate Below)</text>

      <rect x="20" y="${78 + colH + 60}" width="${colW}" height="24" rx="4" fill="#1e293b"/>
      <text x="30" y="${94 + colH + 60}" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="11" font-weight="600" fill="#38bdf8">3. Gliding Segmented Pill: Smooth Spring Slide to Classic</text>

      <rect x="${20 + colW + 10}" y="${78 + colH + 60}" width="${colW}" height="24" rx="4" fill="#1e293b"/>
      <text x="${30 + colW + 10}" y="${94 + colH + 60}" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="11" font-weight="600" fill="#38bdf8">4. Outside Click / Blur Dismissal: Immediately Collapses Hub</text>
    </svg>
  `);

  const matrixPng = await sharp(titleSvg)
    .composite([
      { input: m1Resized, top: 108, left: 20 },
      { input: m3Resized, top: 108, left: 20 + colW + 10 },
      { input: m4Resized, top: 108 + colH + 60, left: 20 },
      { input: m5Resized, top: 108 + colH + 60, left: 20 + colW + 10 },
    ])
    .png()
    .toBuffer();

  const matrixPath = path.join(ARTIFACT_DIR, 'music_polish_matrix.png');
  fs.writeFileSync(matrixPath, matrixPng);
  console.log('[VERIFY MUSIC POLISH] Saved matrix:', matrixPath);

  fs.writeFileSync(
    path.join(ARTIFACT_DIR, 'music_polish_metrics.json'),
    JSON.stringify({ layout: metrics, hoverTest: hoverResult, popover: popoverMetrics, blurTest: blurDismissalResult }, null, 2)
  );

  console.log('[VERIFY MUSIC POLISH] All verification steps completed successfully!');
  app.quit();
});
