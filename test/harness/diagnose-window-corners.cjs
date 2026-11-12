const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

app.whenReady().then(async () => {
  console.log('[CORNER DIAGNOSTIC] Running Windows 11 Corner Matrix...');

  // Setup wallpaper background window
  const bg = new BrowserWindow({
    width: 800, height: 600, x: 50, y: 50,
    frame: false, show: true,
  });
  await bg.loadURL('data:text/html,<body style="margin:0; background: linear-gradient(135deg, #f59e0b, #ef4444, #8b5cf6, #3b82f6); height: 100vh;"></body>');
  await new Promise(r => setTimeout(r, 400));

  const testConfigs = [
    {
      name: '1_current_acrylic_transparent',
      options: { frame: false, transparent: true, backgroundMaterial: 'acrylic', backgroundColor: '#00000000', hasShadow: false }
    },
    {
      name: '2_pure_transparent_no_acrylic',
      options: { frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false }
    },
    {
      name: '3_thickframe_transparent',
      options: { frame: false, transparent: true, thickFrame: true, backgroundMaterial: 'acrylic', backgroundColor: '#00000000', hasShadow: false }
    },
    {
      name: '4_titlebar_hidden_rounded',
      options: { titleBarStyle: 'hidden', titleBarOverlay: false, transparent: false, backgroundMaterial: 'acrylic', roundedCorners: true }
    }
  ];

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: transparent; overflow: hidden; }
        .win {
          width: 100%; height: 100%; box-sizing: border-box;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.15);
          background: rgba(14, 16, 22, 0.72);
          backdrop-filter: blur(28px) saturate(135%);
          color: white; padding: 20px; font-family: sans-serif;
        }
      </style>
    </head>
    <body>
      <div class="win">Test Window</div>
    </body>
    </html>
  `;

  for (const cfg of testConfigs) {
    const w = new BrowserWindow({
      width: 450, height: 320, x: 200, y: 150,
      show: false,
      ...cfg.options
    });
    await w.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    w.show();
    await new Promise(r => setTimeout(r, 400));

    const cap = await w.webContents.capturePage();
    const outPath = path.join(__dirname, `corner_test_${cfg.name}.png`);
    fs.writeFileSync(outPath, cap.toPNG());
    console.log(`Saved ${outPath}`);
    w.destroy();
  }

  bg.destroy();
  app.quit();
});

