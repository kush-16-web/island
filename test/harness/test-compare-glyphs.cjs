const { app, BrowserWindow } = require('electron');
const fs = require('fs');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 600,
    height: 400,
    show: true,
    transparent: true,
    frame: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { background: #000; color: #fff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 24px; font-weight: 700; margin: 50px; }
        
        .k-word {
          position: relative;
          display: inline-block;
          white-space: pre;
          color: #ffffff;
          -webkit-font-smoothing: antialiased;
        }

        /* Option 1: background: none */
        .opt1-active {
          background: linear-gradient(
            90deg,
            #ffffff 0%,
            #ffffff 100%
          );
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .opt1-sung {
          color: #ffffff !important;
          -webkit-text-fill-color: #ffffff !important;
          background: none !important;
        }

        /* Option 2: keep background-clip */
        .opt2-sung {
          background: #ffffff !important;
          -webkit-background-clip: text !important;
          background-clip: text !important;
          -webkit-text-fill-color: transparent !important;
        }
      </style>
    </head>
    <body>
      <div id="c1" class="k-word opt1-active">TestingGlyphs</div>
      <div id="c2" class="k-word opt1-sung">TestingGlyphs</div>
      <div id="c3" class="k-word opt2-sung">TestingGlyphs</div>
    </body>
    </html>
  `;

  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));

  const rects = await win.webContents.executeJavaScript(`
    (() => {
      const getR = (id) => {
        const r = document.getElementById(id).getBoundingClientRect();
        return { x: Math.floor(r.left), y: Math.floor(r.top), width: Math.ceil(r.width), height: Math.ceil(r.height) };
      };
      return { c1: getR('c1'), c2: getR('c2'), c3: getR('c3') };
    })()
  `);

  const image = await win.webContents.capturePage();
  const bmp = image.toBitmap();

  // Compare c1 (gradient at 100% clip) vs c2 (opt1 background: none) vs c3 (opt2 clip solid)
  // Let's capture crops of each:
  const img1 = image.crop(rects.c1);
  const img2 = image.crop(rects.c2);
  const img3 = image.crop(rects.c3);

  fs.writeFileSync('test/harness/c1-active.png', img1.toPNG());
  fs.writeFileSync('test/harness/c2-opt1.png', img2.toPNG());
  fs.writeFileSync('test/harness/c3-opt2.png', img3.toPNG());

  const buf1 = img1.toBitmap();
  const buf2 = img2.toBitmap();
  const buf3 = img3.toBitmap();

  // Pixel diff between c1 and c2
  let diff1_2 = 0;
  for (let i = 0; i < buf1.length; i++) {
    if (buf1[i] !== buf2[i]) diff1_2++;
  }

  // Pixel diff between c1 and c3
  let diff1_3 = 0;
  for (let i = 0; i < buf1.length; i++) {
    if (buf1[i] !== buf3[i]) diff1_3++;
  }

  console.log('DIFF c1(active-clip) vs c2(opt1-none):', diff1_2, 'differing bytes out of', buf1.length);
  console.log('DIFF c1(active-clip) vs c3(opt2-clip):', diff1_3, 'differing bytes out of', buf1.length);

  app.quit();
});
