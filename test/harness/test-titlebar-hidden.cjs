const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

app.whenReady().then(async () => {
  // Test: Does titleBarStyle: 'hidden' give native rounded corners on Windows 11 with acrylic?
  const w = new BrowserWindow({
    width: 500,
    height: 350,
    x: 200,
    y: 200,
    titleBarStyle: 'hidden',
    titleBarOverlay: false,
    backgroundMaterial: 'acrylic',
    show: false,
  });

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body {
          margin: 0; padding: 20px;
          color: white; font-family: sans-serif;
        }
      </style>
    </head>
    <body>
      <h2>TitleBarStyle: hidden + Acrylic</h2>
      <p>Testing DWM corner rounding...</p>
    </body>
    </html>
  `;

  await w.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  w.show();
  await new Promise(r => setTimeout(r, 600));

  const cap = await w.webContents.capturePage();
  fs.writeFileSync(path.join(__dirname, 'cap_titlebar_hidden.png'), cap.toPNG());
  console.log('Saved cap_titlebar_hidden.png');

  w.destroy();
  app.quit();
});

