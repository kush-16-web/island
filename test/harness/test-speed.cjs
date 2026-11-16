const { app, desktopCapturer } = require('electron');

app.whenReady().then(async () => {
  const t0 = Date.now();
  const s = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } });
  console.log('TIME TAKEN MS:', Date.now() - t0, 'SOURCES:', s.length);
  app.quit();
});
