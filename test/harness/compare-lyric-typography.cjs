const { app, BrowserWindow } = require('electron');
const path = require('node:path');

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false });
  const DIST_HTML = path.resolve(__dirname, '../../dist/index.html');
  await win.loadURL(`file://${DIST_HTML}`);

  const styles = await win.webContents.executeJavaScript(`
    (() => {
      // Create DOM elements matching FullLyrics line types
      const container = document.createElement('div');
      container.className = 'full-lyrics';
      document.body.appendChild(container);

      // 1. Line-timed active line
      const lineNormal = document.createElement('div');
      lineNormal.className = 'full-lyrics__line is-active';
      lineNormal.textContent = 'Normal Line Timed Text';
      container.appendChild(lineNormal);

      // 2. Word-timed line with words
      const lineWord = document.createElement('div');
      lineWord.className = 'full-lyrics__line is-active';
      const kWrap = document.createElement('span');
      kWrap.className = 'karaoke-words';

      const wInactive = document.createElement('span');
      wInactive.className = 'k-word';
      wInactive.textContent = 'Inactive ';

      const wActive = document.createElement('span');
      wActive.className = 'k-word is-active-word';
      wActive.style.setProperty('--word-fill', '50%');
      wActive.textContent = 'Active ';

      const wSung = document.createElement('span');
      wSung.className = 'k-word is-sung';
      wSung.textContent = 'Sung ';

      kWrap.appendChild(wSung);
      kWrap.appendChild(wActive);
      kWrap.appendChild(wInactive);
      lineWord.appendChild(kWrap);
      container.appendChild(lineWord);

      const props = [
        'fontFamily', 'fontSize', 'fontWeight', 'fontStyle',
        'letterSpacing', 'wordSpacing', 'lineHeight', 'whiteSpace',
        'textTransform', 'textShadow', 'webkitFontSmoothing',
        'webkitTextFillColor', 'color', 'display', 'verticalAlign'
      ];

      const getP = (el) => {
        const cs = window.getComputedStyle(el);
        const res = {};
        for (const p of props) res[p] = cs[p];
        return res;
      };

      return {
        normalLine: getP(lineNormal),
        wordInactive: getP(wInactive),
        wordActive: getP(wActive),
        wordSung: getP(wSung),
      };
    })()
  `);

  console.log('[COMPUTED STYLES COMPARISON]:');
  console.log(JSON.stringify(styles, null, 2));

  win.destroy();
  app.quit();
});

