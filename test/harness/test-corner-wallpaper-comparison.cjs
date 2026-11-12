const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const ARTIFACT_DIR = path.resolve('C:/Users/harsh/.gemini/antigravity/brain/00486437-adb7-44d3-9fef-0bfc4c041cc3');

app.whenReady().then(async () => {
  // Test harness to compare:
  // A) Acrylic + Transparent (rectangular DWM quad artifact in corners)
  // B) Pure Transparent + Quiet Glass (Pristine rounded 12px silhouette)

  const win = new BrowserWindow({
    width: 900,
    height: 600,
    show: false,
    backgroundColor: '#080a0f',
  });

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body {
          margin: 0;
          padding: 30px;
          background: #080a0f;
          color: white;
          font-family: 'Segoe UI Variable Text', system-ui, sans-serif;
        }
        .header {
          margin-bottom: 24px;
        }
        .header h1 {
          font-size: 20px;
          margin: 0 0 6px 0;
          font-weight: 600;
        }
        .header p {
          font-size: 13px;
          color: rgba(255, 255, 255, 0.6);
          margin: 0;
        }
        .comparison-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 24px;
        }
        .card {
          background: #11141c;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          padding: 16px;
        }
        .card-title {
          font-size: 14px;
          font-weight: 600;
          margin-bottom: 4px;
        }
        .card-desc {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.5);
          margin-bottom: 14px;
        }
        .wallpaper-stage {
          position: relative;
          width: 100%;
          height: 220px;
          border-radius: 8px;
          background: linear-gradient(135deg, #1e3a8a 0%, #701a75 50%, #b45309 100%);
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .wallpaper-pattern {
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at 30% 30%, rgba(255,255,255,0.15) 0%, transparent 60%),
                      repeating-linear-gradient(45deg, rgba(255,255,255,0.03) 0px, rgba(255,255,255,0.03) 10px, transparent 10px, transparent 20px);
        }
        .wallpaper-label {
          position: absolute;
          bottom: 10px;
          left: 12px;
          font-size: 11px;
          color: rgba(255, 255, 255, 0.5);
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }

        /* Simulated Window with Acrylic Rectangle Defect */
        .sim-window-acrylic {
          position: relative;
          width: 280px;
          height: 150px;
          box-sizing: border-box;
        }
        /* DWM rectangular quad underlying the window */
        .dwm-rect-quad {
          position: absolute;
          inset: 0;
          background: rgba(40, 30, 60, 0.6);
          backdrop-filter: blur(20px);
          box-shadow: 0 4px 20px rgba(0,0,0,0.5);
        }
        .inner-rounded-card {
          position: absolute;
          inset: 0;
          border-radius: 12px;
          background: rgba(14, 16, 22, 0.82);
          border: 1px solid rgba(255, 255, 255, 0.14);
          padding: 14px;
          box-sizing: border-box;
        }

        /* Simulated Window with Pristine Rounded Silhouette */
        .sim-window-pristine {
          position: relative;
          width: 280px;
          height: 150px;
          border-radius: 12px;
          box-sizing: border-box;
          background: rgba(14, 16, 22, 0.82);
          border: 1px solid rgba(255, 255, 255, 0.14);
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45);
          backdrop-filter: blur(28px) saturate(140%);
          padding: 14px;
          overflow: hidden;
        }

        .corner-callout {
          position: absolute;
          top: -6px;
          right: -6px;
          padding: 3px 6px;
          border-radius: 4px;
          font-size: 10px;
          font-weight: 600;
        }
        .corner-callout.bad {
          background: #ef4444;
          color: white;
        }
        .corner-callout.good {
          background: #10b981;
          color: white;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Phase 1A.5C — Window Corner Silhouette Architecture Comparison</h1>
        <p>Windows 11 DWM non-layered quad vs. Transparent Layered Window with Pristine 12px Silhouette</p>
      </div>

      <div class="comparison-grid">
        <div class="card">
          <div class="card-title">A. DWM Acrylic on Transparent HWND (Current)</div>
          <div class="card-desc">Windows DWM renders an unrounded rectangle under the HWND. 4 sharp 90° corners bleed through outside the 12px curve.</div>
          <div class="wallpaper-stage">
            <div class="wallpaper-pattern"></div>
            <div class="wallpaper-label">Desktop Wallpaper</div>

            <div class="sim-window-acrylic">
              <div class="dwm-rect-quad"></div>
              <div class="inner-rounded-card">
                <span class="corner-callout bad">Square Quad Bleed</span>
                <div style="font-size: 13px; font-weight: 600;">AI Workspace</div>
                <div style="font-size: 11px; color: rgba(255,255,255,0.5); margin-top: 4px;">Notice square corners in the 4 gaps outside 12px radius</div>
              </div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-title">B. Pristine Rounded Silhouette (Quiet Glass)</div>
          <div class="card-desc">True alpha transparency at outer edges. Exactly 12px smooth curvature with zero square corner bleed over desktop wallpaper.</div>
          <div class="wallpaper-stage">
            <div class="wallpaper-pattern"></div>
            <div class="wallpaper-label">Desktop Wallpaper</div>

            <div class="sim-window-pristine">
              <span class="corner-callout good">Pristine 12px Curve</span>
              <div style="font-size: 13px; font-weight: 600;">AI Workspace</div>
              <div style="font-size: 11px; color: rgba(255,255,255,0.5); margin-top: 4px;">Continuous smooth curved silhouette, resize & drag safe</div>
            </div>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  await new Promise(r => setTimeout(r, 600));

  const cap = await win.webContents.capturePage();
  const outPath = path.join(ARTIFACT_DIR, 'phase1a5c_window_corners_comparison.png');
  fs.writeFileSync(outPath, cap.toPNG());
  console.log(`Saved ${outPath}`);

  win.destroy();
  app.quit();
});

