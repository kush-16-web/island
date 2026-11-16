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

        // Stop video immediately
        stream.getVideoTracks().forEach(t => t.stop());

        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 64;
        source.connect(analyser);

        const data = new Uint8Array(analyser.frequencyBinCount);
        
        // Sample 5 times over 500ms
        const samples = [];
        for (let i = 0; i < 5; i++) {
          await new Promise(r => setTimeout(r, 100));
          analyser.getByteFrequencyData(data);
          samples.push(Array.from(data.slice(0, 8)));
        }

        return { ok: true, samples };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    })()
  `);

  console.log('AUDIO SAMPLES TEST:', JSON.stringify(result, null, 2));
  app.quit();
});
