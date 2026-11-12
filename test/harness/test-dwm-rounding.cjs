const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

app.whenReady().then(async () => {
  // Test: Can Windows 11 round a window natively with acrylic?
  const win = new BrowserWindow({
    width: 500,
    height: 350,
    x: 200,
    y: 200,
    frame: false,
    transparent: false,
    backgroundColor: '#00000000',
    backgroundMaterial: 'acrylic',
    show: false,
  });

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        html, body {
          margin: 0; padding: 0; width: 100%; height: 100%;
          background: transparent; overflow: hidden;
        }
        .app {
          width: 100%; height: 100%; box-sizing: border-box;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(14, 16, 22, 0.65);
          color: white; padding: 24px; font-family: 'Segoe UI', sans-serif;
        }
      </style>
    </head>
    <body>
      <div class="app">
        <h2>Native Rounded DWM Test</h2>
        <p>Testing transparent: false with backgroundMaterial: 'acrylic'</p>
      </div>
    </body>
    </html>
  `;

  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  win.show();
  await new Promise(r => setTimeout(r, 600));

  const cap = await win.webContents.capturePage();
  fs.writeFileSync(path.join(__dirname, 'test_dwm_native_rounded.png'), cap.toPNG());
  console.log('Saved test_dwm_native_rounded.png');

  win.destroy();
  app.quit();
});

