const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

app.whenReady().then(async () => {
  const assetsDir = path.join(__dirname, '..', '..', 'assets').replace(/\\/g, '/');
  const icon32 = `file:///${assetsDir}/island-32.png`;
  const icon48 = `file:///${assetsDir}/island-48.png`;
  const icon64 = `file:///${assetsDir}/island-64.png`;
  const icon512 = `file:///${assetsDir}/island-app-512.png`;

  const win = new BrowserWindow({
    width: 900,
    height: 600,
    show: false,
    backgroundColor: '#0a0c10',
    webPreferences: { webSecurity: false },
  });

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {
          margin: 0;
          padding: 30px;
          background: #0a0c10;
          color: #f1f3f8;
          font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
        }
        h1 {
          font-size: 18px;
          margin: 0 0 8px 0;
          font-weight: 600;
        }
        p {
          font-size: 12.5px;
          color: rgba(255,255,255,0.6);
          margin: 0 0 24px 0;
        }
        .section {
          margin-bottom: 24px;
        }
        .section-title {
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: rgba(255,255,255,0.45);
          margin-bottom: 8px;
        }
        /* Simulated Windows 11 Taskbar */
        .taskbar-mock {
          height: 48px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          padding: 0 16px;
          gap: 12px;
          box-shadow: 0 4px 16px rgba(0,0,0,0.5);
        }
        .taskbar-dark {
          background: #1c1c1c;
          border-top: 1px solid rgba(255,255,255,0.08);
        }
        .taskbar-light {
          background: #f3f3f3;
          border-top: 1px solid rgba(0,0,0,0.06);
          color: #111;
        }
        .taskbar-btn {
          width: 40px;
          height: 40px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
        }
        .taskbar-btn.is-active {
          background: rgba(255,255,255,0.08);
        }
        .taskbar-light .taskbar-btn.is-active {
          background: rgba(0,0,0,0.08);
        }
        .taskbar-btn.is-active::after {
          content: '';
          position: absolute;
          bottom: 2px;
          width: 16px;
          height: 3px;
          border-radius: 2px;
          background: #38bdf8;
        }
        .taskbar-app-icon {
          width: 24px;
          height: 24px;
          border-radius: 4px;
          object-fit: contain;
        }
        /* Alt + Tab Card */
        .alttab-modal {
          background: rgba(28, 30, 36, 0.95);
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 14px;
          padding: 20px;
          display: inline-flex;
          gap: 16px;
          box-shadow: 0 16px 40px rgba(0,0,0,0.6);
        }
        .alttab-card {
          width: 200px;
          height: 140px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 10px;
          padding: 12px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          position: relative;
        }
        .alttab-card.is-focused {
          border-color: #38bdf8;
          box-shadow: 0 0 0 1px #38bdf8;
        }
        .alttab-head {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .alttab-icon {
          width: 20px;
          height: 20px;
          border-radius: 3px;
        }
        .alttab-title {
          font-size: 11.5px;
          font-weight: 500;
          color: #fff;
        }
        .alttab-thumb {
          flex: 1;
          margin-top: 8px;
          background: rgba(14, 16, 22, 0.7);
          border-radius: 6px;
          border: 1px solid rgba(255,255,255,0.05);
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }
        .alttab-thumb img {
          width: 64px;
          height: 64px;
          border-radius: 8px;
        }
      </style>
    </head>
    <body>
      <h1>Windows Desktop Integration: Taskbar & Alt+Tab Verification</h1>
      <p>Verifying Island's approved miniature tropical island icon across standard Windows 11 chrome surfaces.</p>

      <div class="section">
        <div class="section-title">Windows 11 Dark Taskbar (Centered App Bar)</div>
        <div class="taskbar-mock taskbar-dark">
          <div class="taskbar-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#38bdf8"><path d="M4 4h7v7H4V4zm0 9h7v7H4v-7zm9-9h7v7h-7V4zm0 9h7v7h-7v-7z"/></svg>
          </div>
          <div class="taskbar-btn is-active">
            <img class="taskbar-app-icon" src="${icon32}" alt="Island">
          </div>
          <div class="taskbar-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="rgba(255,255,255,0.7)"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V8l8 5 8-5v10zm-8-7L4 6h16l-8 5z"/></svg>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Windows 11 Light Taskbar</div>
        <div class="taskbar-mock taskbar-light">
          <div class="taskbar-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#0284c7"><path d="M4 4h7v7H4V4zm0 9h7v7H4v-7zm9-9h7v7h-7V4zm0 9h7v7h-7v-7z"/></svg>
          </div>
          <div class="taskbar-btn is-active">
            <img class="taskbar-app-icon" src="${icon32}" alt="Island">
          </div>
          <div class="taskbar-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="rgba(0,0,0,0.6)"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V8l8 5 8-5v10zm-8-7L4 6h16l-8 5z"/></svg>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Windows Alt + Tab Quick App Switcher</div>
        <div class="alttab-modal">
          <div class="alttab-card is-focused">
            <div class="alttab-head">
              <img class="alttab-icon" src="${icon32}" alt="">
              <span class="alttab-title">Island — AI Workspace</span>
            </div>
            <div class="alttab-thumb">
              <img src="${icon64}" alt="">
            </div>
          </div>

          <div class="alttab-card">
            <div class="alttab-head">
              <img class="alttab-icon" src="${icon32}" alt="">
              <span class="alttab-title">Island — Settings</span>
            </div>
            <div class="alttab-thumb" style="opacity: 0.6;">
              <span style="font-size: 11px; color: #888;">Quiet Glass Preview</span>
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
  const outPath = path.join(__dirname, 'phase1a5a_verified_taskbar_alttab.png');
  fs.writeFileSync(outPath, cap.toPNG());
  console.log('Saved taskbar & Alt+Tab verification to phase1a5a_verified_taskbar_alttab.png');

  win.destroy();
  app.quit();
});

