const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 600,
    height: 400,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  // Test our proposed CSS rules
  const css = `
    .k-word {
      position: relative;
      display: inline-block;
      vertical-align: baseline;
      font: inherit;
      font-family: inherit;
      font-size: inherit;
      font-weight: inherit;
      font-style: inherit;
      letter-spacing: inherit;
      line-height: inherit;
      text-transform: inherit;
      white-space: pre;
      color: rgba(255, 255, 255, 0.44);
      -webkit-font-smoothing: antialiased;
      /* NO transition: color 0.12s ease */
      transition: none;
    }
    .k-word__base {
      display: inline;
      font: inherit;
      font-family: inherit;
      font-size: inherit;
      font-weight: inherit;
      font-style: inherit;
      letter-spacing: inherit;
      line-height: inherit;
      text-transform: inherit;
      white-space: inherit;
      color: inherit;
      -webkit-font-smoothing: antialiased;
    }
    .k-word.is-active-word {
      font: inherit;
      font-family: inherit;
      font-size: inherit;
      font-weight: inherit;
      letter-spacing: inherit;
      -webkit-font-smoothing: antialiased;
      background: linear-gradient(
        90deg,
        #ffffff 0%,
        #ffffff calc(var(--word-fill, 0%) - 4px),
        rgba(255, 255, 255, 0.44) calc(var(--word-fill, 0%) + 4px),
        rgba(255, 255, 255, 0.44) 100%
      );
      -webkit-background-clip: text;
      background-clip: text;
      -webkit-text-fill-color: transparent;
      color: #ffffff;
      will-change: background;
    }
    .k-word.is-sung {
      font: inherit;
      font-family: inherit;
      font-size: inherit;
      font-weight: inherit;
      letter-spacing: inherit;
      -webkit-font-smoothing: antialiased;
      /* Same rendering representation with solid white clip */
      background: #ffffff !important;
      -webkit-background-clip: text !important;
      background-clip: text !important;
      -webkit-text-fill-color: transparent !important;
      color: #ffffff !important;
      opacity: 1;
      transition: none !important;
    }
  `;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { background: #121212; color: #fff; font-family: sans-serif; font-size: 16px; margin: 30px; }
        ${css}
      </style>
    </head>
    <body>
      <div id="container">
        <span id="test-word" class="k-word">Whenever</span>
      </div>
    </body>
    </html>
  `;

  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));

  // Run frame-by-frame simulation
  const timeline = await win.webContents.executeJavaScript(`
    (async () => {
      const el = document.getElementById('test-word');
      const results = [];

      const record = (stage, desc) => {
        const cs = getComputedStyle(el);
        results.push({
          stage,
          desc,
          classes: el.className,
          color: cs.color,
          fillColor: cs.webkitTextFillColor,
          bg: cs.background,
          clip: cs.webkitBackgroundClip,
          wordFill: el.style.getPropertyValue('--word-fill') || null,
        });
      };

      // 1. Upcoming (0%)
      record('0%', 'Word upcoming (dim)');

      // 2. Active 25%
      el.classList.add('is-active-word');
      el.style.setProperty('--word-fill', '25%');
      record('25%', 'Word active at 25%');

      // 3. Active 50%
      el.style.setProperty('--word-fill', '50%');
      record('50%', 'Word active at 50%');

      // 4. Active 75%
      el.style.setProperty('--word-fill', '75%');
      record('75%', 'Word active at 75%');

      // 5. Active 99%
      el.style.setProperty('--word-fill', '99%');
      record('99%', 'Word active at 99%');

      // 6. Active 100%
      el.style.setProperty('--word-fill', '100%');
      record('100%', 'Word active at 100%');

      // 7. Completed boundary (is-sung added, is-active-word removed)
      el.classList.remove('is-active-word');
      el.classList.add('is-sung');
      el.style.removeProperty('--word-fill');
      record('+0ms', 'Word completed, is-sung added immediately');

      // Wait +16ms
      await new Promise(r => setTimeout(r, 16));
      record('+16ms', 'Word completed at +16ms');

      // Wait to +33ms
      await new Promise(r => setTimeout(r, 17));
      record('+33ms', 'Word completed at +33ms');

      // Wait to +66ms
      await new Promise(r => setTimeout(r, 33));
      record('+66ms', 'Word completed at +66ms');

      // Wait to +120ms
      await new Promise(r => setTimeout(r, 54));
      record('+120ms', 'Word completed at +120ms');

      return results;
    })()
  `);

  console.log('TIMELINE RESULTS:');
  timeline.forEach((t) => {
    console.log(`[${t.stage.padEnd(7)}] ${t.desc}`);
    console.log(`         color: ${t.color} | text-fill: ${t.fillColor} | clip: ${t.clip}`);
  });

  app.quit();
});
