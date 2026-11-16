const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 600,
    height: 400,
    show: false,
    backgroundColor: '#0a0d14',
  });

  const cssContent = fs.readFileSync(path.resolve(__dirname, '../../src/styles.css'), 'utf8');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        ${cssContent}
        body { background: #0d1117; color: white; padding: 40px; font-size: 20px; }
      </style>
    </head>
    <body>
      <div class="mini-lyrics__line is-active">
        <span class="karaoke-words">
          <span id="target" class="k-word is-active-word" style="--word-fill: 100%;">
            <span class="k-word__base">Whenever</span>
          </span>
        </span>
      </div>
    </body>
    </html>
  `;

  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  win.show();
  await new Promise(r => setTimeout(r, 200));

  const transitionTest = await win.webContents.executeJavaScript(`
    new Promise(async (resolve) => {
      const el = document.getElementById('target');
      const baseEl = el.querySelector('.k-word__base');
      
      const beforeState = {
        className: el.className,
        color: window.getComputedStyle(el).color,
        fillColor: window.getComputedStyle(el).webkitTextFillColor,
        bgImage: window.getComputedStyle(el).backgroundImage,
        bgClip: window.getComputedStyle(el).webkitBackgroundClip,
      };

      // Switch to is-sung (as PrecisionLyricLine rAF does on completion)
      el.classList.add('is-sung');
      el.classList.remove('is-active-word');
      el.style.removeProperty('--word-fill');

      const frames = [];
      const start = performance.now();

      // Sample computed styles over the next 150ms
      for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 16));
        const now = performance.now();
        const cs = window.getComputedStyle(el);
        frames.push({
          deltaMs: Math.round(now - start),
          color: cs.color,
          fillColor: cs.webkitTextFillColor,
          bgClip: cs.webkitBackgroundClip,
        });
      }

      resolve({ beforeState, frames });
    })
  `);

  console.log('=== BEFORE WORD COMPLETION (active 100%) ===');
  console.log(JSON.stringify(transitionTest.beforeState, null, 2));

  console.log('=== CONSECUTIVE FRAMES AFTER WORD COMPLETION (is-sung) ===');
  transitionTest.frames.forEach(f => {
    console.log(`+${f.deltaMs}ms | color=${f.color} | fillColor=${f.fillColor} | clip=${f.bgClip}`);
  });

  app.quit();
});
