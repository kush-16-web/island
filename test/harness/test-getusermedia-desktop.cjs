const { app, session, desktopCapturer, BrowserWindow } = require('electron');
const path = require('node:path');

app.whenReady().then(async () => {
  session.defaultSession.setPermissionCheckHandler(() => true);
  session.defaultSession.setPermissionRequestHandler((_w, _p, cb) => cb(true));

  const win = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: false, contextIsolation: false },
  });

  const DIST_INDEX = path.resolve(__dirname, '../../dist/index.html');
  await win.loadFile(DIST_INDEX);

  const sources = await desktopCapturer.getSources({ types: ['screen'] });
  const sourceId = sources[0]?.id;

  const result = await win.webContents.executeJavaScript(`
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: '${sourceId}',
            },
          },
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: '${sourceId}',
              minWidth: 10,
              maxWidth: 10,
              minHeight: 10,
              maxHeight: 10,
            },
          },
        });
        return {
          ok: true,
          audioTracks: stream.getAudioTracks().length,
          videoTracks: stream.getVideoTracks().length,
        };
      } catch (err) {
        return { ok: false, name: err.name, message: err.message };
      }
    })()
  `);

  console.log('GETUSERMEDIA DESKTOP TEST:', JSON.stringify(result));
  app.quit();
});
