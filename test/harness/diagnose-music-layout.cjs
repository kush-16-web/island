const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { computeNotchPosition, NOTCH_WIN_W, NOTCH_WIN_H } = require('../../electron/notch-geometry');

const PRELOAD_PATH = path.resolve(__dirname, '../../electron/preload.js');

app.whenReady().then(async () => {
  const primary = screen.getPrimaryDisplay();
  const placement = computeNotchPosition({
    display: primary,
    allDisplays: screen.getAllDisplays(),
    windowWidth: Math.max(NOTCH_WIN_W, 660),
    windowHeight: Math.max(NOTCH_WIN_H, 400),
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

  ipcMain.handle('window:is-maximized', () => false);
  ipcMain.handle('window:get-dynamic-frosted-color', () => '#e74c3c');
  ipcMain.handle('island:get-appearance', () => 'dynamic-frosted');
  ipcMain.handle('app-volume:get-capabilities', () => ({ supported: true }));
  ipcMain.handle('app-volume:get-volume', () => ({ volume: 65, muted: false }));
  ipcMain.handle('app-volume:set-volume', () => true);

  await win.loadFile(path.resolve(__dirname, '../../dist/index.html'));
  win.show();
  await new Promise((r) => setTimeout(r, 600));

  // Feed active music
  const mockMedia = {
    active: true,
    status: 'playing',
    title: 'Borderline',
    artist: 'Tame Impala',
    album: 'The Slow Rush',
    durationMs: 237000,
    positionMs: 65000,
    reportedAt: Date.now(),
    lyrics: {
      found: true,
      provider: 'LRCLIB',
      syncType: 'LINE_SYNCED',
      lines: [
        { startMs: 58000, endMs: 63000, text: 'Gone a little far, gone a little far this time for something' },
        { startMs: 63001, endMs: 70000, text: 'How could I have known? How was I to know it would come to this?' },
        { startMs: 70001, endMs: 76000, text: 'Will I be known and loved? Is there one that I trust?' },
      ],
    },
  };

  win.webContents.send('media', mockMedia);
  win.webContents.send('hub:open', 'playing');
  await new Promise((r) => setTimeout(r, 800));

  const diagnostics = await win.webContents.executeJavaScript(`(() => {
    function getBox(sel) {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return {
        selector: sel,
        x: Math.round(r.x),
        y: Math.round(r.y),
        width: Math.round(r.width),
        height: Math.round(r.height),
        padding: style.padding,
        margin: style.margin,
        gap: style.gap,
        display: style.display,
        flexDirection: style.flexDirection,
        justifyContent: style.justifyContent,
        alignItems: style.alignItems,
        overflow: style.overflow,
        minHeight: style.minHeight,
        maxHeight: style.maxHeight,
      };
    }

    const notch = getBox('.island--notch');
    const shell = getBox('.island-shell');
    const hub = getBox('.hub');
    const hubContent = getBox('.hub__content');
    const np = getBox('.np--two-col');
    const main = getBox('.np--two-col .np__main');
    const left = getBox('.np--two-col .np__left');
    const coverWrap = getBox('.np--two-col .np__cover-wrap');
    const coverImg = getBox('.np__cover-img');
    const meta = getBox('.np--two-col .np__meta');
    const title = getBox('.np__title--expanded');
    const artist = getBox('.np__artist--expanded');
    const progress = getBox('.np__progress--left');
    const controls = getBox('.np__controls--left-aligned');
    const right = getBox('.np--two-col .np__right');
    const eyesBtn = getBox('.expanded-music__eyes-btn');
    const miniLyrics = getBox('.np--two-col .np__right .mini-lyrics');
    const lyricsViewport = getBox('.mini-lyrics__viewport');
    const lyricsLines = Array.from(document.querySelectorAll('.mini-lyrics__line')).map((el, i) => {
      const r = el.getBoundingClientRect();
      return { index: i, text: el.textContent?.slice(0, 30), width: Math.round(r.width), height: Math.round(r.height), y: Math.round(r.y) };
    });
    const footer = getBox('.np__right-footer');
    const mvc = getBox('.mvc');
    const muteBtn = getBox('.mvc__mute-btn');
    const iconBox = getBox('.mvc__icon-box');
    const speakerSvg = getBox('.mvc__mute-btn svg');
    const track = getBox('.mvc__track');
    const pct = getBox('.mvc__pct');
    const songProgress = getBox('.song-progress');
    const songProgressTrack = getBox('.song-progress__track');
    const songProgressThumb = getBox('.song-progress__thumb');
    const songProgressFill = getBox('.song-progress__fill');

    // Measure vertical gaps in left column
    let leftGaps = null;
    if (coverWrap && meta && progress && controls) {
      leftGaps = {
        coverToMeta: meta.y - (coverWrap.y + coverWrap.height),
        metaToProgress: progress.y - (meta.y + meta.height),
        progressToControls: controls.y - (progress.y + progress.height),
      };
    }

    return {
      windowSize: { width: window.innerWidth, height: window.innerHeight },
      notch,
      shell,
      hub,
      hubContent,
      np,
      main,
      left,
      coverWrap,
      coverImg,
      meta,
      title,
      artist,
      progress,
      controls,
      leftGaps,
      right,
      eyesBtn,
      miniLyrics,
      lyricsViewport,
      lyricsLines,
      footer,
      mvc,
      muteBtn,
      iconBox,
      speakerSvg,
      track,
      pct,
      songProgress,
      songProgressTrack,
      songProgressThumb,
      songProgressFill,
    };
  })()`);

  console.log('DIAGNOSTICS_RESULT:');
  console.log(JSON.stringify(diagnostics, null, 2));
  fs.writeFileSync(path.resolve(__dirname, 'diagnostics-output.json'), JSON.stringify(diagnostics, null, 2), 'utf8');

  win.destroy();
  app.quit();
});
