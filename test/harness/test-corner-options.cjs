const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

app.whenReady().then(async () => {
  console.log('[CORNER OPTIONS TEST] Initializing test windows...');

  // Window A: Current configuration: frame: false, transparent: true, backgroundMaterial: 'acrylic'
  const winA = new BrowserWindow({
    width: 400,
    height: 300,
    x: 100,
    y: 100,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    backgroundMaterial: 'acrylic',
    hasShadow: false,
    show: false,
  });

  // Window B: frame: false, transparent: true, NO backgroundMaterial (pure transparent layered window)
  const winB = new BrowserWindow({
    width: 400,
    height: 300,
    x: 550,
    y: 100,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    show: false,
  });

  // Window C: frame: false, transparent: true, backgroundMaterial: 'none', roundedCorners: true
  const winC = new BrowserWindow({
    width: 400,
    height: 300,
    x: 100,
    y: 450,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    roundedCorners: true,
    hasShadow: false,
    show: false,
  });

  const testHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        html, body {
          margin: 0; padding: 0; width: 100%; height: 100%;
          background: transparent; overflow: hidden;
        }
        .shell {
          width: 100%; height: 100%; box-sizing: border-box;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.15);
          background: rgba(14, 16, 22, 0.75);
          backdrop-filter: blur(28px) saturate(135%);
          color: white; padding: 20px; font-family: sans-serif;
        }
      </style>
    </head>
    <body>
      <div class="shell">
        <h3>Corner Test</h3>
      </div>
    </body>
    </html>
  `;

  await Promise.all([
    winA.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(testHtml)}`),
    winB.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(testHtml)}`),
    winC.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(testHtml)}`),
  ]);

  winA.show();
  winB.show();
  winC.show();

  await new Promise(r => setTimeout(r, 600));

  const capA = await winA.webContents.capturePage();
  const capB = await winB.webContents.capturePage();
  const capC = await winC.webContents.capturePage();

  fs.writeFileSync(path.join(__dirname, 'capA_acrylic.png'), capA.toPNG());
  fs.writeFileSync(path.join(__dirname, 'capB_not_acrylic.png'), capB.toPNG());
  fs.writeFileSync(path.join(__dirname, 'capC_rounded.png'), capC.toPNG());

  console.log('Saved capA_acrylic.png, capB_not_acrylic.png, capC_rounded.png');

  // Let's inspect pixel (0,0) of each
  const bA = capA.toBitmap();
  const bB = capB.toBitmap();
  const bC = capC.toBitmap();

  console.log('A (0,0):', `R=${bA[0]} G=${bA[1]} B=${bA[2]} A=${bA[3]}`);
  console.log('B (0,0):', `R=${bB[0]} G=${bB[1]} B=${bB[2]} A=${bB[3]}`);
  console.log('C (0,0):', `R=${bC[0]} G=${bC[1]} B=${bC[2]} A=${bC[3]}`);

  winA.destroy();
  winB.destroy();
  winC.destroy();
  app.quit();
});

