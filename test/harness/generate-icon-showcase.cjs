const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 980,
    height: 780,
    show: false,
    backgroundColor: '#0f1117',
    webPreferences: {
      webSecurity: false,
    },
  });

  const assetsDir = path.join(__dirname, '..', '..', 'assets').replace(/\\/g, '/');
  const iconOriginal = `file:///${assetsDir}/island-original.png`;
  const icon512 = `file:///${assetsDir}/island-app-512.png`;
  const icon128 = `file:///${assetsDir}/island-128.png`;
  const icon64 = `file:///${assetsDir}/island-64.png`;
  const icon48 = `file:///${assetsDir}/island-48.png`;
  const icon32 = `file:///${assetsDir}/island-32.png`;
  const icon24 = `file:///${assetsDir}/island-24.png`;
  const icon16 = `file:///${assetsDir}/island-16.png`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {
          margin: 0;
          padding: 24px;
          background: #0f1117;
          color: #f4f5f8;
          font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
        }
        h1 {
          font-size: 18px;
          margin: 0 0 4px 0;
          font-weight: 600;
          letter-spacing: -0.01em;
        }
        p.sub {
          margin: 0 0 20px 0;
          color: rgba(255,255,255,0.6);
          font-size: 12.5px;
        }
        .grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }
        .card {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 12px;
          padding: 16px;
        }
        .card h2 {
          font-size: 13px;
          margin: 0 0 12px 0;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: rgba(255,255,255,0.7);
        }
        .surface {
          border-radius: 8px;
          padding: 12px 16px;
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 12px;
        }
        .surface-dark {
          background: #1c1c1c;
          border: 1px solid rgba(255,255,255,0.06);
        }
        .surface-light {
          background: #f3f3f3;
          border: 1px solid rgba(0,0,0,0.08);
          color: #111;
        }
        .surface-alttab {
          background: rgba(28, 30, 36, 0.94);
          border: 1px solid rgba(255,255,255,0.12);
          box-shadow: 0 12px 32px rgba(0,0,0,0.6);
        }
        .label {
          font-size: 11px;
          font-weight: 500;
          min-width: 90px;
        }
        .icon-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
        }
        .icon-item span {
          font-size: 10px;
          opacity: 0.6;
        }
        .preview-hero {
          display: flex;
          align-items: center;
          gap: 20px;
          margin-bottom: 20px;
          background: rgba(255,255,255,0.02);
          padding: 16px;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.05);
        }
        .hero-img {
          width: 140px;
          height: 140px;
          border-radius: 16px;
          box-shadow: 0 12px 28px rgba(0,0,0,0.4);
        }
        .hero-info {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .hero-title {
          font-size: 15px;
          font-weight: 600;
          color: #fff;
        }
        .hero-desc {
          font-size: 12px;
          color: rgba(255,255,255,0.65);
          line-height: 1.45;
        }
        .tag {
          display: inline-block;
          font-size: 10.5px;
          padding: 2px 8px;
          border-radius: 4px;
          background: rgba(255,255,255,0.08);
          color: #a5b4fc;
          font-weight: 500;
          width: fit-content;
        }
      </style>
    </head>
    <body>
      <div class="preview-hero">
        <img class="hero-img" src="${icon512}" alt="Island App Icon">
        <div class="hero-info">
          <span class="tag">Approved Brand Asset</span>
          <div class="hero-title">Island Tropical Miniature 3D Artwork</div>
          <div class="hero-desc">
            3D miniature diorama of a lush tropical island with a curved palm tree, hammock, book on beach towel, and clear turquoise water. Preserves authentic artwork integrity.
          </div>
        </div>
      </div>

      <div class="grid">
        <!-- Surface 1: Windows 11 Dark Taskbar -->
        <div class="card">
          <h2>1. Windows 11 Dark Taskbar Surface (#1C1C1C)</h2>
          <div class="surface surface-dark">
            <span class="label">Taskbar (32px):</span>
            <div class="icon-item">
              <img src="${icon32}" width="32" height="32" style="border-radius: 4px;">
              <span>32×32</span>
            </div>
            <div class="icon-item">
              <img src="${icon48}" width="48" height="48" style="border-radius: 6px;">
              <span>48×48 (DPI)</span>
            </div>
          </div>

          <div class="surface surface-dark">
            <span class="label">Tray (16/24px):</span>
            <div class="icon-item">
              <img src="${icon16}" width="16" height="16" style="border-radius: 2px;">
              <span>16×16</span>
            </div>
            <div class="icon-item">
              <img src="${icon24}" width="24" height="24" style="border-radius: 3px;">
              <span>24×24</span>
            </div>
          </div>
        </div>

        <!-- Surface 2: Windows 11 Light Taskbar -->
        <div class="card">
          <h2>2. Windows 11 Light Taskbar Surface (#F3F3F3)</h2>
          <div class="surface surface-light">
            <span class="label">Taskbar (32px):</span>
            <div class="icon-item">
              <img src="${icon32}" width="32" height="32" style="border-radius: 4px;">
              <span>32×32</span>
            </div>
            <div class="icon-item">
              <img src="${icon48}" width="48" height="48" style="border-radius: 6px;">
              <span>48×48 (DPI)</span>
            </div>
          </div>

          <div class="surface surface-light">
            <span class="label">Tray (16/24px):</span>
            <div class="icon-item">
              <img src="${icon16}" width="16" height="16" style="border-radius: 2px;">
              <span>16×16</span>
            </div>
            <div class="icon-item">
              <img src="${icon24}" width="24" height="24" style="border-radius: 3px;">
              <span>24×24</span>
            </div>
          </div>
        </div>

        <!-- Surface 3: Alt + Tab Task Switcher -->
        <div class="card" style="grid-column: span 2;">
          <h2>3. Windows Alt + Tab Task Switcher & Window Identity</h2>
          <div class="surface surface-alttab" style="justify-content: space-around;">
            <div class="icon-item">
              <img src="${icon64}" width="64" height="64" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);">
              <span>Alt+Tab Standard (64×64)</span>
            </div>
            <div class="icon-item">
              <img src="${icon128}" width="128" height="128" style="border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.4);">
              <span>Alt+Tab High-DPI (128×128)</span>
            </div>
            <div class="icon-item">
              <img src="${icon512}" width="128" height="128" style="border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.4);">
              <span>Executable / Start Menu (256×256+)</span>
            </div>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  await new Promise((r) => setTimeout(r, 600));

  const cap = await win.webContents.capturePage();
  const outPath = path.join(__dirname, 'phase1a5a_icon_surfaces_matrix.png');
  fs.writeFileSync(outPath, cap.toPNG());
  console.log('Saved preview matrix to phase1a5a_icon_surfaces_matrix.png');

  win.destroy();
  app.quit();
});

