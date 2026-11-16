const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 600,
    height: 400,
    show: false,
    webPreferences: {
      offscreen: true,
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { background: #111; color: #fff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 16px; margin: 40px; }
        
        /* Base without color transition */
        .k-word {
          position: relative;
          display: inline-block;
          white-space: pre;
          color: rgba(255, 255, 255, 0.44);
          -webkit-font-smoothing: antialiased;
        }

        /* Option 1: background: none on sung */
        .opt1 .k-word.is-active-word {
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
        }
        .opt1 .k-word.is-sung {
          color: #ffffff !important;
          -webkit-text-fill-color: initial !important;
          background: none !important;
        }

        /* Option 2: Same rendering representation - keeps background-clip on sung */
        .opt2 .k-word.is-active-word {
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
        }
        .opt2 .k-word.is-sung {
          background: #ffffff !important;
          -webkit-background-clip: text !important;
          background-clip: text !important;
          -webkit-text-fill-color: transparent !important;
          color: #ffffff !important;
        }
      </style>
    </head>
    <body>
      <div class="opt1"><span id="word1" class="k-word is-active-word" style="--word-fill: 100%;">Option1Word</span></div>
      <div class="opt2"><span id="word2" class="k-word is-active-word" style="--word-fill: 100%;">Option2Word</span></div>
    </body>
    </html>
  `;

  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));

  // Let's capture Option 1 at 100% active, then switch to is-sung and capture at +0ms, +16ms, +33ms, +120ms
  const results = await win.webContents.executeJavaScript(`
    (() => {
      const w1 = document.getElementById('word1');
      const w2 = document.getElementById('word2');

      const log = [];

      // Initial active state
      log.push({
        label: 'opt1_active_100',
        color: getComputedStyle(w1).color,
        fillColor: getComputedStyle(w1).webkitTextFillColor,
        bg: getComputedStyle(w1).background,
        clip: getComputedStyle(w1).webkitBackgroundClip,
      });

      // Switch to is-sung for opt1
      w1.classList.remove('is-active-word');
      w1.classList.add('is-sung');

      log.push({
        label: 'opt1_sung_immediately',
        color: getComputedStyle(w1).color,
        fillColor: getComputedStyle(w1).webkitTextFillColor,
        bg: getComputedStyle(w1).background,
        clip: getComputedStyle(w1).webkitBackgroundClip,
      });

      // Opt2
      log.push({
        label: 'opt2_active_100',
        color: getComputedStyle(w2).color,
        fillColor: getComputedStyle(w2).webkitTextFillColor,
        bg: getComputedStyle(w2).background,
        clip: getComputedStyle(w2).webkitBackgroundClip,
      });

      w2.classList.remove('is-active-word');
      w2.classList.add('is-sung');

      log.push({
        label: 'opt2_sung_immediately',
        color: getComputedStyle(w2).color,
        fillColor: getComputedStyle(w2).webkitTextFillColor,
        bg: getComputedStyle(w2).background,
        clip: getComputedStyle(w2).webkitBackgroundClip,
      });

      return log;
    })()
  `);

  console.log('RESULTS:', JSON.stringify(results, null, 2));

  // Also take screenshots of w1 and w2 before and after to compare pixels
  // ...
  app.quit();
});
