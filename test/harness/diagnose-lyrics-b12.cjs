const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

// We will test both the Lovesong lyric sample and synthetic samples in real Chromium/Electron
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    show: false,
    backgroundColor: '#0a0d14',
  });

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

  const cssContent = fs.readFileSync(path.resolve(__dirname, '../../src/styles.css'), 'utf8');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        ${cssContent}
        body {
          background: #0d1117;
          color: white;
          padding: 30px;
        }
      </style>
    </head>
    <body>
      <div id="root"></div>
    </body>
    </html>
  `;

  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  win.show();
  await new Promise(r => setTimeout(r, 400));

  // Run detailed frame-by-frame diagnostic inside Electron renderer
  const report = await win.webContents.executeJavaScript(`
    (() => {
      // Diagnostic harness
      const line = ${JSON.stringify(lovesongLine)};
      const root = document.getElementById('root');
      
      // Build container mimicking MiniLyrics + PrecisionLyricLine
      const container = document.createElement('div');
      container.className = 'precision-lyric-container mini-lyrics__line is-active';
      
      const wordsSpan = document.createElement('span');
      wordsSpan.className = 'karaoke-words';
      
      const wordEls = [];
      line.words.forEach((w, i) => {
        const wrap = document.createElement('span');
        const kWord = document.createElement('span');
        kWord.className = 'k-word';
        kWord.id = 'word-' + i;
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
      root.appendChild(container);

      // Inspect competing styles between .mini-lyrics__line.is-active and .k-word
      const csLine = window.getComputedStyle(container);
      const csWord0 = window.getComputedStyle(wordEls[0]);
      const csBase0 = window.getComputedStyle(wordEls[0].querySelector('.k-word__base'));

      const lineStyles = {
        color: csLine.color,
        opacity: csLine.opacity,
        filter: csLine.filter,
        fontSize: csLine.fontSize,
        fontWeight: csLine.fontWeight,
        textShadow: csLine.textShadow,
        transition: csLine.transition,
      };

      const wordStylesInitial = {
        color: csWord0.color,
        opacity: csWord0.opacity,
        webkitTextFillColor: csWord0.webkitTextFillColor,
        backgroundClip: csWord0.webkitBackgroundClip,
        backgroundImage: csWord0.backgroundImage,
        transition: csWord0.transition,
        textShadow: csWord0.textShadow,
      };

      // Now simulate frame-by-frame time progression across the word completion of Word 0 ("Whenever": 26252ms -> 27276ms)
      // and transition into Word 1 ("I'm": 27276ms -> 28133ms).
      // We will sample every 20ms from 27200ms to 27360ms.
      const timelineSamples = [];
      const times = [
        27200, 27220, 27240, 27260, 27270, 27275, 27276, 27278, 27280, 27300, 27320, 27340, 27360
      ];

      times.forEach((t) => {
        // Update words according to PrecisionLyricLine logic
        for (let i = 0; i < line.words.length; i++) {
          const w = line.words[i];
          const el = wordEls[i];
          if (t >= w.endMs) {
            el.className = 'k-word is-sung';
            el.style.removeProperty('--word-fill');
          } else if (t >= w.startMs) {
            el.className = 'k-word is-active-word';
            const prog = Math.min(1, Math.max(0, (t - w.startMs) / w.durationMs));
            el.style.setProperty('--word-fill', Math.round(prog * 100) + '%');
          } else {
            el.className = 'k-word';
            el.style.removeProperty('--word-fill');
          }
        }

        // Read computed styles of Word 0 and Word 1
        const csW0 = window.getComputedStyle(wordEls[0]);
        const csW1 = window.getComputedStyle(wordEls[1]);

        timelineSamples.push({
          timeMs: t,
          word0: {
            classes: wordEls[0].className,
            color: csW0.color,
            fillColor: csW0.webkitTextFillColor,
            bgClip: csW0.webkitBackgroundClip,
            bgImage: csW0.backgroundImage,
            textShadow: csW0.textShadow,
            opacity: csW0.opacity,
          },
          word1: {
            classes: wordEls[1].className,
            color: csW1.color,
            fillColor: csW1.webkitTextFillColor,
            bgClip: csW1.webkitBackgroundClip,
            bgImage: csW1.backgroundImage,
            textShadow: csW1.textShadow,
            opacity: csW1.opacity,
          }
        });
      });

      return {
        lineStyles,
        wordStylesInitial,
        timelineSamples,
      };
    })()
  `);

  console.log('=== LINE STYLES ===');
  console.log(JSON.stringify(report.lineStyles, null, 2));

  console.log('=== WORD INITIAL STYLES ===');
  console.log(JSON.stringify(report.wordStylesInitial, null, 2));

  console.log('=== TIMELINE TRANSITION SAMPLES ===');
  report.timelineSamples.forEach((s) => {
    console.log(
      `t=${s.timeMs}ms | Word0: [${s.word0.classes}] color=${s.word0.color} fill=${s.word0.fillColor} clip=${s.word0.bgClip} | Word1: [${s.word1.classes}] color=${s.word1.color} fill=${s.word1.fillColor}`
    );
  });

  app.quit();
});
