const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

app.whenReady().then(async () => {
  console.log('[CORNER MATRIX TEST] Testing 4 window configurations...');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        html, body {
          margin: 0; padding: 0; width: 100%; height: 100%;
          background: transparent; overflow: hidden;
        }
        .container {
          width: 100%; height: 100%; box-sizing: border-box;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.15);
          background: rgba(14, 16, 22, 0.65);
          color: white; padding: 20px; font-family: sans-serif;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h3>Window Configuration Test</h3>
      </div>
    </body>
    </html>
  `;

  // 1. Frameless, transparent: false, backgroundMaterial: 'acrylic'
  const w1 = new BrowserWindow({
    width: 350, height: 250, x: 50, y: 50,
    frame: false, transparent: false, backgroundMaterial: 'acrylic',
    backgroundColor: '#00000000',
    show: false,
  });

  // 2. Frameless, transparent: true, backgroundMaterial: 'acrylic' (CURRENT)
  const w2 = new BrowserWindow({
    width: 350, height: 250, x: 450, y: 50,
    frame: false, transparent: true, backgroundMaterial: 'acrylic',
    backgroundColor: '#00000000',
    show: false,
  });

  // 3. Frameless, transparent: true, NO backgroundMaterial
  const w3 = new BrowserWindow({
    width: 350, height: 250, x: 50, y: 350,
    frame: false, transparent: true, backgroundColor: '#00000000',
    show: false,
  });

  // 4. Frameless, transparent: false, backgroundMaterial: 'mica'
  const w4 = new BrowserWindow({
    width: 350, height: 250, x: 450, y: 350,
    frame: false, transparent: false, backgroundMaterial: 'mica',
    backgroundColor: '#00000000',
    show: false,
  });

  await Promise.all([
    w1.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`),
    w2.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`),
    w3.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`),
    w4.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`),
  ]);

  w1.show();
  w2.show();
  w3.show();
  w4.show();

  await new Promise(r => setTimeout(r, 600));

  const cap1 = await w1.webContents.capturePage();
  const cap2 = await w2.webContents.capturePage();
  const cap3 = await w3.webContents.capturePage();
  const cap4 = await w4.webContents.capturePage();

  fs.writeFileSync(path.join(__dirname, 'matrix_w1_opaque_acrylic.png'), cap1.toPNG());
  fs.writeFileSync(path.join(__dirname, 'matrix_w2_transparent_acrylic.png'), cap2.toPNG());
  fs.writeFileSync(path.join(__dirname, 'matrix_w3_transparent_noacrylic.png'), cap3.toPNG());
  fs.writeFileSync(path.join(__dirname, 'matrix_w4_opaque_mica.png'), cap4.toPNG());

  console.log('Saved matrix screenshots.');

  w1.destroy();
  w2.destroy();
  w3.destroy();
  w4.destroy();
  app.quit();
});

