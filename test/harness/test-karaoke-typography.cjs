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

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body {
          margin: 40px;
          background: #0a0d14;
          color: white;
          font-family: 'Geist Variable', 'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif;
          font-size: 18px;
          font-weight: 700;
          line-height: 1.4;
          -webkit-font-smoothing: antialiased;
        }
        .row {
          margin-bottom: 24px;
        }
        .label {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: rgba(255, 255, 255, 0.4);
          margin-bottom: 6px;
        }

        /* Method A: Current background-clip: text */
        .karaoke-old .k-word-old {
          color: rgba(255, 255, 255, 0.48);
        }
        .karaoke-old .is-sung {
          color: #ffffff;
        }
        .karaoke-old .is-active-word {
          color: #ffffff;
          background: linear-gradient(90deg, #ffffff 0%, #ffffff 50%, rgba(255,255,255,0.48) 50%, rgba(255,255,255,0.48) 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        /* Method B: Pristine Dual-Layer Text Overlay */
        .k-word-new {
          position: relative;
          display: inline-block;
          vertical-align: baseline;
          color: rgba(255, 255, 255, 0.48);
        }
        .k-word-new.is-sung {
          color: #ffffff;
        }
        .k-word-new .k-fill {
          position: absolute;
          left: 0;
          top: 0;
          height: 100%;
          overflow: hidden;
          white-space: nowrap;
          color: #ffffff;
          pointer-events: none;
          transition: width 0.04s linear;
        }
      </style>
    </head>
    <body>
      <div class="row">
        <div class="label">Reference: Normal Line-Timed Text</div>
        <div style="color: #ffffff;">She's working at the pyramid tonight</div>
      </div>

      <div class="row">
        <div class="label">Method A: Background-Clip (Current - notice thinner active word & antialiasing shift)</div>
        <div class="karaoke-old">
          <span class="k-word-old is-sung">She's </span>
          <span class="k-word-old is-sung">working </span>
          <span class="k-word-old is-active-word">at </span>
          <span class="k-word-old">the </span>
          <span class="k-word-old">pyramid </span>
          <span class="k-word-old">tonight</span>
        </div>
      </div>

      <div class="row">
        <div class="label">Method B: Dual-Layer Overlay (100% Identical Weight & Antialiasing to Reference)</div>
        <div>
          <span class="k-word-new is-sung">She's</span> 
          <span class="k-word-new is-sung">working</span> 
          <span class="k-word-new">
            <span>at</span>
            <span class="k-fill" style="width: 50%;">at</span>
          </span> 
          <span class="k-word-new">the</span> 
          <span class="k-word-new">pyramid</span> 
          <span class="k-word-new">tonight</span>
        </div>
      </div>
    </body>
    </html>
  `;

  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  await new Promise(r => setTimeout(r, 600));

  const cap = await win.webContents.capturePage();
  fs.writeFileSync(path.join(__dirname, 'test_karaoke_typography_compare.png'), cap.toPNG());
  console.log('Saved test_karaoke_typography_compare.png');

  win.destroy();
  app.quit();
});

