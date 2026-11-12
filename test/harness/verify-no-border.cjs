const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 680,
    height: 520,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: true,
    show: true,
  });

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body {
          margin: 0;
          padding: 16px;
          background: transparent;
          font-family: sans-serif;
          box-sizing: border-box;
          height: 100vh;
        }
        .window-card {
          width: 100%;
          height: 100%;
          background: rgba(14, 16, 22, 0.88);
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
          box-sizing: border-box;
          padding: 20px;
          color: white;
          display: flex;
          flex-direction: column;
        }
      </style>
    </head>
    <body>
      <div class="window-card">
        <h2>Quiet Glass Window (No Windows Border)</h2>
        <p>Smooth rounded corners, zero DWM borders.</p>
      </div>
    </body>
    </html>
  `;

  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  await new Promise((r) => setTimeout(r, 600));

  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(__dirname, 'verified_no_border.png'), img.toPNG());
  console.log('Capture saved to verified_no_border.png');

  win.destroy();
  app.quit();
});

