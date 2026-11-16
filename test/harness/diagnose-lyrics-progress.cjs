const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    show: false,
    webPreferences: {
      offscreen: false,
    },
    backgroundColor: '#0a0d14',
  });

  const testLines = [
    {
      id: 'short-word',
      name: 'A. Short single-word lyric',
      text: 'Wait',
      words: [{ text: 'Wait', startMs: 0, endMs: 600, durationMs: 600 }],
    },
    {
      id: 'short-sentence',
      name: 'B. Short sentence',
      text: "She said, 'Yes'",
      words: [
        { text: 'She', startMs: 0, endMs: 300, durationMs: 300 },
        { text: 'said,', startMs: 300, endMs: 600, durationMs: 300 },
        { text: "'Yes'", startMs: 600, endMs: 1000, durationMs: 400 },
      ],
    },
    {
      id: 'long-punctuation',
      name: "C. Long sentence with punctuation (Cry For Me / The Weeknd)",
      text: "I can't hide the truth, girl, I'll cry for you!",
      words: [
        { text: 'I', startMs: 0, endMs: 200, durationMs: 200 },
        { text: "can't", startMs: 200, endMs: 600, durationMs: 400 },
        { text: 'hide', startMs: 600, endMs: 900, durationMs: 300 },
        { text: 'the', startMs: 900, endMs: 1100, durationMs: 200 },
        { text: 'truth,', startMs: 1100, endMs: 1500, durationMs: 400 },
        { text: 'girl,', startMs: 1500, endMs: 1800, durationMs: 300 },
        { text: "I'll", startMs: 1800, endMs: 2000, durationMs: 200 },
        { text: 'cry', startMs: 2000, endMs: 2400, durationMs: 400 },
        { text: 'for', startMs: 2400, endMs: 2600, durationMs: 200 },
        { text: 'you!', startMs: 2600, endMs: 3000, durationMs: 400 },
      ],
    },
    {
      id: 'repeated-words',
      name: 'D. Repeated words (Attention / Charlie Puth)',
      text: 'knew that I, knew that I, knew that I would be',
      words: [
        { text: 'knew', startMs: 0, endMs: 250, durationMs: 250 },
        { text: 'that', startMs: 250, endMs: 450, durationMs: 200 },
        { text: 'I,', startMs: 450, endMs: 700, durationMs: 250 },
        { text: 'knew', startMs: 700, endMs: 950, durationMs: 250 },
        { text: 'that', startMs: 950, endMs: 1150, durationMs: 200 },
        { text: 'I,', startMs: 1150, endMs: 1400, durationMs: 250 },
        { text: 'knew', startMs: 1400, endMs: 1650, durationMs: 250 },
        { text: 'that', startMs: 1650, endMs: 1850, durationMs: 200 },
        { text: 'I', startMs: 1850, endMs: 2000, durationMs: 150 },
        { text: 'would', startMs: 2000, endMs: 2200, durationMs: 200 },
        { text: 'be', startMs: 2200, endMs: 2600, durationMs: 400 },
      ],
    },
    {
      id: 'narrow-wide',
      name: 'E. Narrow and wide characters',
      text: 'Illumination with MMM and iii',
      words: [
        { text: 'Illumination', startMs: 0, endMs: 600, durationMs: 600 },
        { text: 'with', startMs: 600, endMs: 850, durationMs: 250 },
        { text: 'MMM', startMs: 850, endMs: 1250, durationMs: 400 },
        { text: 'and', startMs: 1250, endMs: 1450, durationMs: 200 },
        { text: 'iii', startMs: 1450, endMs: 1800, durationMs: 350 },
      ],
    },
    {
      id: 'fast-transition',
      name: 'F. Fast word transitions (Shape of You / Ed Sheeran)',
      text: 'come on be my baby come on',
      words: [
        { text: 'come', startMs: 0, endMs: 120, durationMs: 120 },
        { text: 'on', startMs: 120, endMs: 240, durationMs: 120 },
        { text: 'be', startMs: 240, endMs: 360, durationMs: 120 },
        { text: 'my', startMs: 360, endMs: 480, durationMs: 120 },
        { text: 'baby', startMs: 480, endMs: 700, durationMs: 220 },
        { text: 'come', startMs: 700, endMs: 820, durationMs: 120 },
        { text: 'on', startMs: 820, endMs: 950, durationMs: 130 },
      ],
    },
    {
      id: 'slow-sustained',
      name: 'G. Slow sustained word (How Long / Charlie Puth)',
      text: 'How long has this been going on?',
      words: [
        { text: 'How', startMs: 0, endMs: 400, durationMs: 400 },
        { text: 'long', startMs: 400, endMs: 2200, durationMs: 1800 },
        { text: 'has', startMs: 2200, endMs: 2450, durationMs: 250 },
        { text: 'this', startMs: 2450, endMs: 2700, durationMs: 250 },
        { text: 'been', startMs: 2700, endMs: 2950, durationMs: 250 },
        { text: 'going', startMs: 2950, endMs: 3400, durationMs: 450 },
        { text: 'on?', startMs: 3400, endMs: 4000, durationMs: 600 },
      ],
    },
    {
      id: 'line-only-fallback',
      name: 'H. Line-level only timestamp fallback (no words)',
      text: 'I was thinking bout you thinking bout me',
      words: null,
    },
  ];

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          background: #0f1117;
          color: white;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          padding: 24px;
          -webkit-font-smoothing: antialiased;
        }
        h1 { font-size: 16px; margin-bottom: 12px; color: #e2e8f0; font-weight: 600; }
        .grid {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .card {
          background: #181b24;
          border-radius: 8px;
          padding: 12px 16px;
          border: 1px solid rgba(255,255,255,0.06);
        }
        .card-title {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: rgba(255,255,255,0.5);
          margin-bottom: 8px;
        }
        .samples {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .sample-row {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 13.5px;
          line-height: 1.35;
        }
        .pct-badge {
          font-size: 10px;
          font-family: monospace;
          color: #38bdf8;
          min-width: 42px;
        }

        /* --- TEST ALGORITHMS --- */

        /* Alg 1: Current 14% Feather */
        .alg-current .k-word {
          display: inline-block;
          color: rgba(255, 255, 255, 0.44);
          white-space: pre;
          font-weight: 600;
        }
        .alg-current .k-word.is-sung {
          color: #ffffff;
        }
        .alg-current .k-word.is-active-word {
          background: linear-gradient(
            90deg,
            #ffffff 0%,
            #ffffff var(--word-fill, 0%),
            rgba(255, 255, 255, 0.44) calc(var(--word-fill, 0%) + 14%),
            rgba(255, 255, 255, 0.44) 100%
          );
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        /* Alg 2: Centered 8px Soft Wavefront + Uniform Grayscale AA */
        .alg-calibrated .k-word {
          display: inline-block;
          color: rgba(255, 255, 255, 0.44);
          white-space: pre;
          font-weight: 600;
          -webkit-font-smoothing: antialiased;
        }
        .alg-calibrated .k-word.is-sung {
          color: #ffffff;
          -webkit-font-smoothing: antialiased;
        }
        .alg-calibrated .k-word.is-active-word {
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
          -webkit-font-smoothing: antialiased;
        }

        /* Fallback line-level style */
        .line-fallback {
          color: #ffffff;
          font-weight: 600;
        }
      </style>
    </head>
    <body>
      <h1>Deterministic Lyric Fill Diagnosis (0%, 10%, 25%, 50%, 75%, 90%, 100%)</h1>
      <div class="grid" id="container"></div>
    </body>
    </html>
  `;

  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  win.show();
  await new Promise((resolve) => setTimeout(resolve, 400));

  const results = await win.webContents.executeJavaScript(`
    const testLines = ${JSON.stringify(testLines)};
    const percentages = [0, 10, 25, 50, 75, 90, 100];
    const container = document.getElementById('container');
    const logs = [];

    for (const test of testLines) {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = '<div class="card-title">' + test.name + '</div><div class="samples" id="samples-' + test.id + '"></div>';
      container.appendChild(card);
      const samplesDiv = card.querySelector('.samples');

      if (!test.words) {
        // Line-only fallback test
        const row = document.createElement('div');
        row.className = 'sample-row';
        row.innerHTML = '<span class="pct-badge">LINE</span><span class="line-fallback">' + test.text + '</span>';
        samplesDiv.appendChild(row);
        continue;
      }

      // Test active word fill across percentages
      // Pick middle word as active for multi-word lines, or single word
      const targetWordIdx = test.words.length > 2 ? 1 : 0;
      const targetWord = test.words[targetWordIdx];

      for (const pct of percentages) {
        const row = document.createElement('div');
        row.className = 'sample-row';
        
        let wordsHtml = '';
        for (let i = 0; i < test.words.length; i++) {
          const w = test.words[i];
          let cls = 'k-word';
          let style = '';
          if (i < targetWordIdx) {
            cls += ' is-sung';
          } else if (i === targetWordIdx) {
            if (pct === 100) {
              cls += ' is-sung';
            } else if (pct > 0) {
              cls += ' is-active-word';
              style = '--word-fill: ' + pct + '%;';
            }
          }
          wordsHtml += '<span class="' + cls + '" style="' + style + '">' + w.text + '</span> ';
        }

        row.innerHTML = '<span class="pct-badge">' + pct + '%</span><div class="alg-calibrated">' + wordsHtml + '</div>';
        samplesDiv.appendChild(row);
      }
    }

    // Inspect computed style metrics
    const activeEl = document.querySelector('.k-word.is-active-word');
    const sungEl = document.querySelector('.k-word.is-sung');
    const unsungEl = document.querySelector('.k-word:not(.is-active-word):not(.is-sung)');

    const getMetrics = (el) => {
      if (!el) return null;
      const cs = window.getComputedStyle(el);
      return {
        fontFamily: cs.fontFamily,
        fontSize: cs.fontSize,
        fontWeight: cs.fontWeight,
        letterSpacing: cs.letterSpacing,
        lineHeight: cs.lineHeight,
        webkitFontSmoothing: cs.webkitFontSmoothing,
        color: cs.color,
        webkitTextFillColor: cs.webkitTextFillColor,
        backgroundClip: cs.webkitBackgroundClip,
      };
    };

    ({
      unsung: getMetrics(unsungEl),
      active: getMetrics(activeEl),
      sung: getMetrics(sungEl),
    });
  `);

  console.log('--- COMPUTED TYPOGRAPHY METRICS ---');
  console.log(JSON.stringify(results, null, 2));

  // Capture frame
  const image = await win.webContents.capturePage();
  const outPath = path.join(__dirname, 'diagnose_lyrics_deterministic.png');
  fs.writeFileSync(outPath, image.toPNG());
  console.log('Saved diagnosis capture to:', outPath);

  app.quit();
});
