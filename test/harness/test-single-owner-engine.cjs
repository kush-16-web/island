const { app, BrowserWindow } = require('electron');

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

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        .k-word { color: rgba(255, 255, 255, 0.44); }
        .k-word.is-active-word {
          background: linear-gradient(90deg, #fff 0%, #fff calc(var(--word-fill, 0%) - 4px), rgba(255,255,255,0.44) calc(var(--word-fill, 0%) + 4px), rgba(255,255,255,0.44) 100%);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          color: #ffffff;
        }
        .k-word.is-sung {
          background: #ffffff !important;
          -webkit-background-clip: text !important;
          background-clip: text !important;
          -webkit-text-fill-color: transparent !important;
          color: #ffffff !important;
        }
      </style>
    </head>
    <body>
      <div id="content">
        <span class="k-word" id="w0">Whenever</span>
        <span class="k-word" id="w1">I'm</span>
        <span class="k-word" id="w2">alone</span>
      </div>
    </body>
    </html>
  `;

  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));

  const simulation = await win.webContents.executeJavaScript(`
    (async () => {
      const words = [
        { text: 'Whenever', startMs: 1000, endMs: 2000, durationMs: 1000 },
        { text: "I'm", startMs: 2000, endMs: 2400, durationMs: 400 },
        { text: 'alone', startMs: 2400, endMs: 3200, durationMs: 800 },
      ];

      const wordEls = [
        document.getElementById('w0'),
        document.getElementById('w1'),
        document.getElementById('w2'),
      ];

      let activeWordProg = { wordIdx: -1, prog: 0 };

      const applyWordStates = (currentMs, { isSeek = false } = {}) => {
        for (let wIdx = 0; wIdx < words.length; wIdx++) {
          const w = words[wIdx];
          const el = wordEls[wIdx];
          if (!el) continue;

          if (currentMs >= w.endMs) {
            if (!el.classList.contains('is-sung')) {
              el.classList.add('is-sung');
              el.classList.remove('is-active-word');
              el.style.removeProperty('--word-fill');
            }
          } else if (currentMs >= w.startMs) {
            if (!el.classList.contains('is-active-word')) {
              el.classList.add('is-active-word');
              el.classList.remove('is-sung');
            }
            const rawProg = w.durationMs > 0 ? Math.min(1, Math.max(0, (currentMs - w.startMs) / w.durationMs)) : 1;
            let prog = rawProg;
            if (!isSeek && activeWordProg.wordIdx === wIdx) {
              prog = Math.max(activeWordProg.prog, rawProg);
            }
            activeWordProg = { wordIdx: wIdx, prog };
            el.style.setProperty('--word-fill', Math.round(prog * 100) + '%');
          } else {
            if (el.classList.contains('is-sung') || el.classList.contains('is-active-word')) {
              el.classList.remove('is-sung', 'is-active-word');
              el.style.removeProperty('--word-fill');
            }
          }
        }
      };

      const log = [];

      // Test 1: Monotonic forward progression through word 0
      for (let t = 1000; t <= 2000; t += 200) {
        applyWordStates(t);
        log.push({
          timeMs: t,
          w0_fill: wordEls[0].style.getPropertyValue('--word-fill'),
          w0_class: wordEls[0].className,
        });
      }

      // Test 2: Word completion handoff
      applyWordStates(2000);
      log.push({
        timeMs: 2000,
        event: 'w0 complete, w1 start',
        w0_fill: wordEls[0].style.getPropertyValue('--word-fill'),
        w0_class: wordEls[0].className,
        w1_fill: wordEls[1].style.getPropertyValue('--word-fill'),
        w1_class: wordEls[1].className,
      });

      // Test 3: Microsecond jitter resilience (time wobbles backward by 10ms during word 1)
      applyWordStates(2150);
      const fillA = wordEls[1].style.getPropertyValue('--word-fill');
      applyWordStates(2140); // 10ms jitter backward
      const fillB = wordEls[1].style.getPropertyValue('--word-fill');
      log.push({
        timeMs: 2140,
        event: 'jitter test',
        fillA,
        fillB,
        monotonic: parseInt(fillB) >= parseInt(fillA),
      });

      // Test 4: Explicit backward seek to 1200ms
      applyWordStates(1200, { isSeek: true });
      log.push({
        timeMs: 1200,
        event: 'backward seek to 1200ms',
        w0_fill: wordEls[0].style.getPropertyValue('--word-fill'),
        w0_class: wordEls[0].className,
        w1_class: wordEls[1].className,
      });

      return log;
    })()
  `);

  console.log('SIMULATION LOG:', JSON.stringify(simulation, null, 2));

  app.quit();
});
