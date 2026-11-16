const { app, session, desktopCapturer, BrowserWindow } = require('electron');

app.whenReady().then(async () => {
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    return permission === 'media' || permission === 'display-capture';
  });

  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'media' || permission === 'display-capture');
  });

  session.defaultSession.setDisplayMediaRequestHandler(async (req, callback) => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
      callback({ video: sources[0] || null, audio: 'loopback' });
    } catch (e) {
      callback({ video: null, audio: null });
    }
  });

  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: false,
      contextIsolation: false,
    },
  });

  const path = require('node:path');
  const DIST_INDEX = path.resolve(__dirname, '../../dist/index.html');
  await win.loadFile(DIST_INDEX);

  const result = await win.webContents.executeJavaScript(`
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        });
        const audioTracks = stream.getAudioTracks();
        const videoTracks = stream.getVideoTracks();
        return {
          ok: true,
          audioTracksCount: audioTracks.length,
          audioLabel: audioTracks[0]?.label || null,
          audioEnabled: audioTracks[0]?.enabled,
          videoTracksCount: videoTracks.length,
        };
      } catch (err) {
        return {
          ok: false,
          name: err.name,
          message: err.message,
        };
      }
    })()
  `);

  console.log('LOOPBACK TEST RESULT:', JSON.stringify(result, null, 2));
  app.quit();
});
