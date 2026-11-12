const { app, BrowserWindow, desktopCapturer } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

app.whenReady().then(async () => {
  // Create a background window simulating desktop wallpaper with bright colors
  const bgWin = new BrowserWindow({
    width: 600,
    height: 500,
    x: 100,
    y: 100,
    frame: false,
    show: true,
  });

  const bgHtml = `
    <!DOCTYPE html>
    <html>
    <body style="margin:0; background: linear-gradient(135deg, #f59e0b 0%, #ec4899 50%, #3b82f6 100%); height: 100vh;">
      <div style="padding: 20px; font-size: 24px; color: white; font-family: sans-serif;">
        DETAILED DESKTOP WALLPAPER PATTERN
        <div style="margin-top: 10px; width: 100%; height: 300px; background: repeating-linear-gradient(45deg, #606dbc, #606dbc 10px, #465298 10px, #465298 20px);"></div>
      </div>
    </body>
    </html>
  `;
  await bgWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(bgHtml)}`);
  await new Promise(r => setTimeout(r, 400));

  // Test Window 1: Current settings (frame: false, transparent: true, backgroundMaterial: 'acrylic')
  const testWin = new BrowserWindow({
    width: 400,
    height: 300,
    x: 200,
    y: 200,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    backgroundMaterial: 'acrylic',
    hasShadow: false,
    show: true,
  });

  const testHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        html, body {
          margin: 0;
          padding: 0;
          width: 100%;
          height: 100%;
          background: transparent;
          overflow: hidden;
        }
        .window {
          width: 100%;
          height: 100%;
          box-sizing: border-box;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(14, 16, 22, 0.7);
          color: white;
          padding: 20px;
          font-family: sans-serif;
        }
      </style>
    </head>
    <body>
      <div class="window">
        <h3>Test Window</h3>
        <p>Testing corner transparency over wallpaper...</p>
      </div>
    </body>
    </html>
  `;

  await testWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(testHtml)}`);
  await new Promise(r => setTimeout(r, 800));

  // Capture screen
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1920, height: 1080 } });
  if (sources.length > 0) {
    const screenImg = sources[0].thumbnail;
    // Crop around testWin corner (x=200, y=200)
    const cropCorner = screenImg.crop({ x: 190, y: 190, width: 100, height: 100 });
    fs.writeFileSync(path.join(__dirname, 'actual_screen_corner.png'), cropCorner.toPNG());
    console.log('Saved actual_screen_corner.png');
  }

  testWin.destroy();
  bgWin.destroy();
  app.quit();
});

