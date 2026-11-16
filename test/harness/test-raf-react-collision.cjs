const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    show: false,
    backgroundColor: '#0a0d14',
  });

  const cssContent = fs.readFileSync(path.resolve(__dirname, '../../src/styles.css'), 'utf8');

  // Adele - Lovesong Line 0
  const lovesongLine = {
    id: 'ttml-0-26252',
    timeMs: 26252,
    endMs: 31160,
    text: "Whenever I'm alone with you",
    words: [
      { text: "Whenever", startMs: 26252, endMs: 27276, durationMs: 1024 },
      { text: "I'm", startMs: 27276, endMs: 28133, durationMs: 857 },
      { text: "alone", startMs: 28133, endMs: 29507, durationMs: 1374 },
      { text: "with", startMs: 29507, endMs: 29941, durationMs: 434 },
      { text: "you", startMs: 29941, endMs: 31160, durationMs: 1219 }
    ]
  };

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        ${cssContent}
        body { background: #0d1117; color: white; padding: 30px; font-size: 16px; }
      </style>
    </head>
    <body>
      <div id="mount"></div>
    </body>
    </html>
  `;

  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  win.show();
  await new Promise(r => setTimeout(r, 200));

  // Test the interplay of:
  // 1. rAF advancing microsecond clock
  // 2. Parent React re-rendering every 20ms with Date.now() / SMTC position
  const simulation = await win.webContents.executeJavaScript(`
    new Promise((resolve) => {
      const line = ${JSON.stringify(lovesongLine)};
      const mount = document.getElementById('mount');

      // Create line container mimicking MiniLyrics
      const container = document.createElement('div');
      container.className = 'precision-lyric-container mini-lyrics__line is-active';
      const wordsSpan = document.createElement('span');
      wordsSpan.className = 'karaoke-words';

      const wordEls = [];
      line.words.forEach((w, i) => {
        const wrap = document.createElement('span');
        const kWord = document.createElement('span');
        kWord.className = 'k-word';
        const kBase = document.createElement('span');
        kBase.className = 'k-word__base';
        kBase.textContent = w.text;
        kWord.appendChild(kBase);
        wrap.appendChild(kWord);
        wrap.appendChild(document.createTextNode(' '));
        wordsSpan.appendChild(wrap);
        wordEls.push(kWord);
      });
      container.appendChild(wordsSpan);
      mount.appendChild(container);

      // Mutex/Race condition simulation:
      // rAF runs at 60fps (~16.6ms intervals)
      // Parent React updates at 20ms intervals with slightly drifting timestamp
      const events = [];
      let currentRafMs = 27200;
      let currentReactMs = 27195; // 5ms clock offset between performance.now() anchor and Date.now()
      
      const el0 = wordEls[0];
      const w0 = line.words[0]; // endMs: 27276

      // Simulate 6 frames around boundary
      for (let step = 0; step < 8; step++) {
        currentRafMs += 16.6;
        currentReactMs += 16.6;

        // 1. rAF tick executes
        let rafAction = '';
        if (currentRafMs >= w0.endMs) {
          if (!el0.classList.contains('is-sung')) {
            el0.classList.add('is-sung');
            el0.classList.remove('is-active-word');
            el0.style.removeProperty('--word-fill');
            rafAction = 'rAF set IS-SUNG';
          }
        } else if (currentRafMs >= w0.startMs) {
          if (!el0.classList.contains('is-active-word')) {
            el0.classList.add('is-active-word');
            el0.classList.remove('is-sung');
          }
          const prog = (currentRafMs - w0.startMs) / w0.durationMs;
          el0.style.setProperty('--word-fill', Math.round(prog * 100) + '%');
          rafAction = 'rAF set ACTIVE (' + Math.round(prog * 100) + '%)';
        }

        const stateAfterRaf = {
          step,
          currentRafMs: Math.round(currentRafMs),
          currentReactMs: Math.round(currentReactMs),
          rafAction,
          classAfterRaf: el0.className,
          styleAfterRaf: el0.style.getPropertyValue('--word-fill') || 'none',
        };

        // 2. React re-render executes with currentReactMs
        let reactAction = '';
        const isWordPastReact = currentReactMs >= w0.endMs;
        const isWordCurrentReact = currentReactMs >= w0.startMs && currentReactMs < w0.endMs;
        
        // Virtual DOM reconciles className and style:
        let expectedClass = 'k-word';
        if (isWordPastReact) expectedClass += ' is-sung';
        else if (isWordCurrentReact) expectedClass += ' is-active-word';

        let expectedFill = isWordCurrentReact ? Math.round(((currentReactMs - w0.startMs) / w0.durationMs) * 100) + '%' : null;

        if (el0.className !== expectedClass) {
          reactAction = 'REACT OVERWROTE class to [' + expectedClass + ']';
          el0.className = expectedClass;
        }
        if (expectedFill) {
          if (el0.style.getPropertyValue('--word-fill') !== expectedFill) {
            reactAction += (reactAction ? ' and ' : '') + 'REACT OVERWROTE --word-fill to ' + expectedFill;
            el0.style.setProperty('--word-fill', expectedFill);
          }
        } else if (el0.style.getPropertyValue('--word-fill')) {
          el0.style.removeProperty('--word-fill');
        }

        stateAfterRaf.reactAction = reactAction;
        stateAfterRaf.finalClass = el0.className;
        events.push(stateAfterRaf);
      }

      resolve(events);
    })
  `);

  console.log('=== RAF VS REACT VIRTUAL DOM COLLISION TIMELINE ===');
  simulation.forEach(e => {
    console.log(`Step ${e.step} | rAF=${e.currentRafMs}ms, React=${e.currentReactMs}ms`);
    if (e.rafAction) console.log(`  -> ${e.rafAction}`);
    if (e.reactAction) console.log(`  -> [COLLISION] ${e.reactAction}`);
    console.log(`  Final Class: ${e.finalClass}`);
  });

  app.quit();
});
