const { app, session, desktopCapturer, BrowserWindow } = require('electron');
const path = require('node:path');

app.whenReady().then(async () => {
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => true);
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => callback(true));
  session.defaultSession.setDisplayMediaRequestHandler(async (req, callback) => {
    const sources = await desktopCapturer.getSources({ types: ['screen'] });
    callback({ video: sources[0] || null, audio: 'loopback' });
  });

  const win = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: false, contextIsolation: false },
  });

  const DIST_INDEX = path.resolve(__dirname, '../../dist/index.html');
  await win.loadFile(DIST_INDEX);

  const result = await win.webContents.executeJavaScript(`
    (async () => {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      const initialState = ctx.state;
      await ctx.resume();
      const resumedState = ctx.state;
      return { initialState, resumedState };
    })()
  `);

  console.log('AUDIO CONTEXT STATE TEST:', JSON.stringify(result));
  app.quit();
});
