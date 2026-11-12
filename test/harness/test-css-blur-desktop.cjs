const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

app.whenReady().then(async () => {
  // Test if CSS backdrop-filter blurs through to desktop in Electron without backgroundMaterial
  // 1. Wallpaper window
  const bgWin = new BrowserWindow({
    width: 600,
    height: 400,
    x: 100,
    y: 100,
    frame: false,
    show: true,
  });
  await bgWin.loadURL('data:text/html,<body style="margin:0; background: red; height:100vh;"><div style="font-size:40px; color:white;">HIGH CONTRAST SHARP TEXT 123456789</div></body>');
  await new Promise(r => setTimeout(r, 400));

  // 2. Pure transparent window with CSS backdrop-filter (no backgroundMaterial)
  const fgWin = new BrowserWindow({
    width: 400,
    height: 250,
    x: 150,
    y: 150,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    show: true,
  });

  const fgHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { margin: 0; background: transparent; overflow: hidden; height: 100vh; }
        .glass {
          width: 100%; height: 100%;
          border-radius: 16px;
          background: rgba(0, 0, 0, 0.4);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid white;
          color: white; padding: 20px; font-family: sans-serif;
        }
      </style>
    </head>
    <body>
      <div class="glass">CSS Glass (No DWM Acrylic)</div>
    </body>
    </html>
  `;
  await fgWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(fgHtml)}`);
  await new Promise(r => setTimeout(r, 600));

  console.log('[TEST] Checking whether Chromium blurs desktop...');
  // Capture page of fgWin
  const cap = await fgWin.webContents.capturePage();
  fs.writeFileSync(path.join(__dirname, 'test_fg_capture.png'), cap.toPNG());
  console.log('Saved test_fg_capture.png');

  bgWin.destroy();
  fgWin.destroy();
  app.quit();
});

