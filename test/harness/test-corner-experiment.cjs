const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

app.whenReady().then(async () => {
  console.log('[CORNER EXPERIMENT] Testing window corner attributes on Windows 11...');

  // Test 1: Window with frame: false, transparent: true, NO backgroundMaterial (pure CSS backdrop-filter)
  const wCss = new BrowserWindow({
    width: 480,
    height: 360,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    show: true,
  });

  const htmlCss = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { margin: 0; padding: 0; background: transparent; overflow: hidden; height: 100vh; }
        .win {
          width: 100vw; height: 100vh;
          box-sizing: border-box;
          background: rgba(14, 16, 22, 0.75);
          backdrop-filter: blur(28px) saturate(135%);
          -webkit-backdrop-filter: blur(28px) saturate(135%);
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: white;
          padding: 20px;
          font-family: sans-serif;
        }
      </style>
    </head>
    <body>
      <div class="win">Pure CSS Glass Window with border-radius: 12px</div>
    </body>
    </html>
  `;
  await wCss.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlCss)}`);
  await new Promise(r => setTimeout(r, 600));

  const capCss = await wCss.webContents.capturePage();
  fs.writeFileSync(path.join(__dirname, 'corner_pure_css.png'), capCss.toPNG());

  // Test 2: Window with backgroundMaterial: 'acrylic'
  const wAcrylic = new BrowserWindow({
    width: 480,
    height: 360,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    backgroundMaterial: 'acrylic',
    hasShadow: false,
    show: true,
  });
  await wAcrylic.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlCss)}`);
  await new Promise(r => setTimeout(r, 600));

  const capAcrylic = await wAcrylic.webContents.capturePage();
  fs.writeFileSync(path.join(__dirname, 'corner_acrylic.png'), capAcrylic.toPNG());

  console.log('[CORNER EXPERIMENT] Saved corner_pure_css.png and corner_acrylic.png');
  wCss.destroy();
  wAcrylic.destroy();
  app.quit();
});

