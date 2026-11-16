const { app, BrowserWindow } = require('electron');
const path = require('node:path');

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: false, contextIsolation: false } });
  const DIST_INDEX = path.resolve(__dirname, '../../dist/index.html');
  await win.loadFile(DIST_INDEX);

  const res = await win.webContents.executeJavaScript(`
    new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const size = 32;
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, size, size);
          const data = ctx.getImageData(0, 0, size, size).data;
          
          let maxSat = 0;
          let bestColor = null;
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i+1], b = data[i+2];
            const max = Math.max(r, g, b), min = Math.min(r, g, b);
            const sat = max === 0 ? 0 : (max - min) / max;
            if (sat > maxSat) {
              maxSat = sat;
              bestColor = { r, g, b, sat };
            }
          }
          resolve({ ok: true, maxSat, bestColor });
        } catch (e) {
          resolve({ ok: false, error: e.message });
        }
      };
      img.onerror = (e) => resolve({ ok: false, error: 'img load failed' });
      img.src = 'https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/bf/2d/a9/bf2da9a8-e4b2-299d-16f3-1634b17bfb4a/886443027814.jpg/1000x1000bb.jpg';
    })
  `);

  console.log('ADELE IMAGE PIXEL ANALYSIS:', JSON.stringify(res, null, 2));
  app.quit();
});
