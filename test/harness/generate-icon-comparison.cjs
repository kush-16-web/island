const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1040,
    height: 840,
    show: false,
    backgroundColor: '#0d0f15',
    webPreferences: {
      webSecurity: false,
    },
  });

  const assetsDir = path.join(__dirname, '..', '..', 'assets').replace(/\\/g, '/');

  const orig64 = `file:///${assetsDir}/island-64.png`;
  const orig32 = `file:///${assetsDir}/island-32.png`;
  const orig24 = `file:///${assetsDir}/island-24.png`;
  const orig16 = `file:///${assetsDir}/island-16.png`;
  const orig512 = `file:///${assetsDir}/island-app-512.png`;

  const cut64 = `file:///${assetsDir}/island-transparent-64.png`;
  const cut32 = `file:///${assetsDir}/island-transparent-32.png`;
  const cut24 = `file:///${assetsDir}/island-transparent-24.png`;
  const cut16 = `file:///${assetsDir}/island-transparent-16.png`;
  const cut512 = `file:///${assetsDir}/island-transparent-512.png`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {
          margin: 0;
          padding: 24px;
          background: #0d0f15;
          color: #f4f5f8;
          font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
        }
        h1 {
          font-size: 19px;
          margin: 0 0 6px 0;
          font-weight: 600;
        }
        p.sub {
          margin: 0 0 20px 0;
          color: rgba(255,255,255,0.6);
          font-size: 13px;
        }
        .comparison-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
        }
        .col {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 12px;
          padding: 16px;
        }
        .col-header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 14px;
          padding-bottom: 10px;
          border-bottom: 1px solid rgba(255,255,255,0.08);
        }
        .col-title {
          font-size: 14px;
          font-weight: 600;
        }
        .badge {
          font-size: 10px;
          padding: 2px 7px;
          border-radius: 4px;
          font-weight: 600;
        }
        .badge-current {
          background: rgba(99, 102, 241, 0.2);
          color: #a5b4fc;
          border: 1px solid rgba(99, 102, 241, 0.4);
        }
        .badge-proposed {
          background: rgba(34, 197, 94, 0.2);
          color: #86efac;
          border: 1px solid rgba(34, 197, 94, 0.4);
        }
        .hero-view {
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 16px;
          background: rgba(0,0,0,0.25);
          border-radius: 8px;
          margin-bottom: 16px;
        }
        .hero-view img {
          width: 140px;
          height: 140px;
          object-fit: contain;
        }
        .section-title {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: rgba(255,255,255,0.5);
          margin: 12px 0 8px 0;
        }
        .strip {
          border-radius: 8px;
          padding: 10px 14px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 10px;
        }
        .strip-dark {
          background: #1c1c1c;
          border: 1px solid rgba(255,255,255,0.06);
        }
        .strip-light {
          background: #f1f1f1;
          border: 1px solid rgba(0,0,0,0.08);
          color: #111;
        }
        .strip-alttab {
          background: rgba(24, 26, 32, 0.95);
          border: 1px solid rgba(255,255,255,0.12);
        }
        .strip-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
        }
        .strip-item span {
          font-size: 9.5px;
          opacity: 0.65;
        }
      </style>
    </head>
    <body>
      <h1>Island AI — Desktop Icon Surface Verification & Background Analysis</h1>
      <p class="sub">Side-by-side inspection on actual Windows taskbar colors, Alt+Tab overlay, and system tray.</p>

      <div class="comparison-grid">
        <!-- Column A: Original Artwork (Light Background) -->
        <div class="col">
          <div class="col-header">
            <span class="col-title">Option A: Original Approved Asset</span>
            <span class="badge badge-current">Active Provided Asset</span>
          </div>

          <div class="hero-view">
            <img src="${orig512}" alt="Original Asset">
          </div>

          <div class="section-title">Dark Taskbar (#1C1C1C)</div>
          <div class="strip strip-dark">
            <div class="strip-item">
              <img src="${orig32}" width="32" height="32" style="border-radius: 4px;">
              <span>Taskbar (32px)</span>
            </div>
            <div class="strip-item">
              <img src="${orig24}" width="24" height="24" style="border-radius: 3px;">
              <span>Tray (24px)</span>
            </div>
            <div class="strip-item">
              <img src="${orig16}" width="16" height="16" style="border-radius: 2px;">
              <span>Tray (16px)</span>
            </div>
          </div>

          <div class="section-title">Light Taskbar (#F1F1F1)</div>
          <div class="strip strip-light">
            <div class="strip-item">
              <img src="${orig32}" width="32" height="32" style="border-radius: 4px;">
              <span>Taskbar (32px)</span>
            </div>
            <div class="strip-item">
              <img src="${orig24}" width="24" height="24" style="border-radius: 3px;">
              <span>Tray (24px)</span>
            </div>
            <div class="strip-item">
              <img src="${orig16}" width="16" height="16" style="border-radius: 2px;">
              <span>Tray (16px)</span>
            </div>
          </div>

          <div class="section-title">Alt + Tab Window Switcher</div>
          <div class="strip strip-alttab">
            <div class="strip-item">
              <img src="${orig64}" width="64" height="64" style="border-radius: 8px;">
              <span>Alt+Tab (64px)</span>
            </div>
            <div class="strip-item" style="font-size: 11px; opacity: 0.7; max-width: 140px; text-align: right;">
              Shows original studio lighting with subtle white backdrop tile
            </div>
          </div>
        </div>

        <!-- Column B: Clean Transparent Cutout -->
        <div class="col">
          <div class="col-header">
            <span class="col-title">Option B: Clean Transparent Cutout</span>
            <span class="badge badge-proposed">Proposed Alternative</span>
          </div>

          <div class="hero-view">
            <img src="${cut512}" alt="Transparent Cutout">
          </div>

          <div class="section-title">Dark Taskbar (#1C1C1C)</div>
          <div class="strip strip-dark">
            <div class="strip-item">
              <img src="${cut32}" width="32" height="32">
              <span>Taskbar (32px)</span>
            </div>
            <div class="strip-item">
              <img src="${cut24}" width="24" height="24">
              <span>Tray (24px)</span>
            </div>
            <div class="strip-item">
              <img src="${cut16}" width="16" height="16">
              <span>Tray (16px)</span>
            </div>
          </div>

          <div class="section-title">Light Taskbar (#F1F1F1)</div>
          <div class="strip strip-light">
            <div class="strip-item">
              <img src="${cut32}" width="32" height="32">
              <span>Taskbar (32px)</span>
            </div>
            <div class="strip-item">
              <img src="${cut24}" width="24" height="24">
              <span>Tray (24px)</span>
            </div>
            <div class="strip-item">
              <img src="${cut16}" width="16" height="16">
              <span>Tray (16px)</span>
            </div>
          </div>

          <div class="section-title">Alt + Tab Window Switcher</div>
          <div class="strip strip-alttab">
            <div class="strip-item">
              <img src="${cut64}" width="64" height="64">
              <span>Alt+Tab (64px)</span>
            </div>
            <div class="strip-item" style="font-size: 11px; opacity: 0.7; max-width: 140px; text-align: right;">
              Silhouette floats directly on OS surfaces with zero enclosing rectangle
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
  const outPath = path.join(__dirname, 'phase1a5a_icon_comparison_matrix.png');
  fs.writeFileSync(outPath, cap.toPNG());
  console.log('Saved comparison matrix to phase1a5a_icon_comparison_matrix.png');

  win.destroy();
  app.quit();
});

