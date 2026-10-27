'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { app, BrowserWindow } = require('electron');

async function main() {
  const esmUrl = pathToFileURL(path.resolve(__dirname, '../../src/lib/song-art.js')).href;
  const { getCompositionForSong } = await import(esmUrl);

  const outputDir = path.resolve(__dirname, '../../living-canvas/output/progression');
  fs.mkdirSync(outputDir, { recursive: true });

  await app.whenReady();

  const win = new BrowserWindow({
    width: 900,
    height: 480,
    show: false,
    webPreferences: {
      offscreen: true,
      contextIsolation: false,
    },
    backgroundColor: '#0a0d16',
  });

  const testTrack = {
    title: 'Solar Flare',
    artist: 'Horizon Zero',
    accentColor: '#f97316',
  };

  const comp = getCompositionForSong(testTrack.title, testTrack.artist);
  const cp = comp.color_palette;
  const effectiveAccent = testTrack.accentColor || cp.accent_color;

  const states = [
    { pct: 0, label: '0% — Preparing Canvas & Atmospheric Aura' },
    { pct: 25, label: '25% — Foundation: Mountain Ridges & Horizon Ground' },
    { pct: 50, label: '50% — Structure: Rising Solar Disc & Radial Beams' },
    { pct: 75, label: '75% — Metaphor: Origami Celestial Crane in Flight' },
    { pct: 100, label: '100% — Revealed: Finished Artwork with Corona Accents' },
  ];

  for (const s of states) {
    const p = s.pct / 100;

    // Build SVG layer elements for this progress fraction
    const layersHtml = comp.layers.map((layer, lIdx) => {
      let layerProg = 0;
      if (lIdx === 0) layerProg = Math.min(1, Math.max(0, p / 0.25));
      else if (lIdx === 1) layerProg = Math.min(1, Math.max(0, (p - 0.25) / 0.30));
      else if (lIdx === 2) layerProg = Math.min(1, Math.max(0, (p - 0.55) / 0.30));
      else layerProg = Math.min(1, Math.max(0, (p - 0.85) / 0.15));

      if (layerProg <= 0) return '';

      const strokeColor = layer.stroke === 'accent' ? effectiveAccent : (layer.stroke === 'secondary' ? (cp.secondary_accent || effectiveAccent) : cp.line_color);
      const isFullyDrawn = layerProg >= 1;
      const strokeDashoffset = isFullyDrawn ? 0 : Math.round(1000 * (1 - layerProg));

      const paths = layer.paths.map(d => `
        <path d="${d}" fill="none" stroke="${strokeColor}" stroke-width="${layer.strokeWidth || 2.2}" stroke-linecap="round" stroke-linejoin="round" pathLength="1000" stroke-dasharray="1000" stroke-dashoffset="${strokeDashoffset}" />
      `).join('');

      const nodes = (layer.nodes && layerProg >= 0.85) ? `
        <g>
          ${layer.nodes.map(n => `<circle cx="${n.x}" cy="${n.y}" r="${n.r || 4}" fill="${strokeColor}" />`).join('')}
        </g>
      ` : '';

      return `<g opacity="${layer.opacity || 1}">${paths}${nodes}</g>`;
    }).join('');

    // Active stylus indicator at 25%, 50%, 75%
    let stylusHtml = '';
    if (s.pct === 25) {
      stylusHtml = `<circle cx="860" cy="380" r="7" fill="${effectiveAccent}" opacity="0.4" /><circle cx="860" cy="380" r="3.5" fill="#ffffff" />`;
    } else if (s.pct === 50) {
      stylusHtml = `<circle cx="610" cy="185" r="7" fill="${effectiveAccent}" opacity="0.4" /><circle cx="610" cy="185" r="3.5" fill="#ffffff" />`;
    } else if (s.pct === 75) {
      stylusHtml = `<circle cx="720" cy="165" r="7" fill="${effectiveAccent}" opacity="0.4" /><circle cx="720" cy="165" r="3.5" fill="#ffffff" />`;
    }

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            width: 900px;
            height: 480px;
            background: ${cp.background};
            color: #ffffff;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            padding: 16px 20px 14px;
            position: relative;
          }
          .aura {
            position: absolute;
            inset: -20px;
            background: radial-gradient(circle at 50% 45%, ${effectiveAccent}33, transparent 70%);
            filter: blur(48px);
            pointer-events: none;
          }
          .header {
            position: relative;
            z-index: 2;
            display: flex;
            align-items: center;
            justify-content: space-between;
          }
          .badge {
            font-size: 10px;
            font-weight: 700;
            letter-spacing: 0.12em;
            text-transform: uppercase;
            color: ${cp.line_color};
            display: inline-flex;
            align-items: center;
            gap: 6px;
          }
          .state-pill {
            font-size: 9px;
            font-weight: 700;
            padding: 2px 8px;
            border-radius: 999px;
            background: rgba(255, 255, 255, 0.12);
            color: ${effectiveAccent};
            border: 1px solid rgba(255, 255, 255, 0.15);
          }
          .canvas-wrap {
            position: relative;
            z-index: 2;
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 100%;
          }
          svg {
            width: 100%;
            height: 100%;
            max-height: 340px;
          }
          .footer {
            position: relative;
            z-index: 2;
            display: flex;
            flex-direction: column;
            gap: 4px;
          }
          .metaphor {
            font-size: 11.5px;
            font-style: italic;
            color: ${cp.line_color};
            opacity: 0.9;
          }
          .meta-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-size: 9.5px;
            color: rgba(255, 255, 255, 0.55);
          }
          .source-tag {
            font-size: 8.5px;
            font-weight: 600;
            padding: 1.5px 6px;
            border-radius: 999px;
            background: rgba(255, 255, 255, 0.08);
            color: rgba(255, 255, 255, 0.65);
            border: 1px solid rgba(255, 255, 255, 0.1);
          }
        </style>
      </head>
      <body>
        <div class="aura"></div>
        <div class="header">
          <div class="badge">
            <span style="color: ${effectiveAccent}">✦</span>
            <span>${comp.strategyName}</span>
          </div>
          <span class="state-pill">${s.label}</span>
        </div>
        <div class="canvas-wrap">
          <svg viewBox="0 0 900 440" preserveAspectRatio="xMidYMid meet">
            ${layersHtml}
            ${stylusHtml ? `<g>${stylusHtml}</g>` : ''}
          </svg>
        </div>
        <div class="footer">
          <div class="metaphor">&ldquo;${comp.central_metaphor}&rdquo;</div>
          <div class="meta-row">
            <span>${comp.emotional_theme}</span>
            <span class="source-tag">✦ Procedural Preview (ComfyUI Offline)</span>
          </div>
        </div>
      </body>
      </html>
    `;

    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    await new Promise(r => setTimeout(r, 120)); // wait for layout paint
    const image = await win.capturePage();
    const filePath = path.join(outputDir, `progression_${String(s.pct).padStart(3, '0')}.png`);
    fs.writeFileSync(filePath, image.toPNG());
    console.log(`Saved screenshot: ${filePath} (${image.getSize().width}x${image.getSize().height})`);
  }

  // Also capture a contrasting song concept at 100%: "Kalank" (Romantic Flame)
  const kalankComp = getCompositionForSong('Kalank (Title Track)', 'Arijit Singh');
  const kalankAccent = '#f43f5e';
  const kalankCp = kalankComp.color_palette;
  const kalankLayers = kalankComp.layers.map(layer => {
    const strokeColor = layer.stroke === 'accent' ? kalankAccent : (layer.stroke === 'secondary' ? (kalankCp.secondary_accent || kalankAccent) : kalankCp.line_color);
    const paths = layer.paths.map(d => `<path d="${d}" fill="none" stroke="${strokeColor}" stroke-width="${layer.strokeWidth || 2.2}" stroke-linecap="round" stroke-linejoin="round" />`).join('');
    const nodes = layer.nodes ? `<g>${layer.nodes.map(n => `<circle cx="${n.x}" cy="${n.y}" r="${n.r || 4}" fill="${strokeColor}" />`).join('')}</g>` : '';
    return `<g opacity="${layer.opacity || 1}">${paths}${nodes}</g>`;
  }).join('');

  const kalankHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          width: 900px;
          height: 480px;
          background: ${kalankCp.background};
          color: #ffffff;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 16px 20px 14px;
          position: relative;
        }
        .aura {
          position: absolute;
          inset: -20px;
          background: radial-gradient(circle at 50% 45%, ${kalankAccent}33, transparent 70%);
          filter: blur(48px);
          pointer-events: none;
        }
        .header {
          position: relative;
          z-index: 2;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .badge {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: ${kalankCp.line_color};
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .state-pill {
          font-size: 9px;
          font-weight: 700;
          padding: 2px 8px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.12);
          color: ${kalankAccent};
          border: 1px solid rgba(255, 255, 255, 0.15);
        }
        .canvas-wrap {
          position: relative;
          z-index: 2;
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
        }
        svg { width: 100%; height: 100%; max-height: 340px; }
        .footer { position: relative; z-index: 2; display: flex; flex-direction: column; gap: 4px; }
        .metaphor { font-size: 11.5px; font-style: italic; color: ${kalankCp.line_color}; opacity: 0.9; }
        .meta-row { display: flex; align-items: center; justify-content: space-between; font-size: 9.5px; color: rgba(255, 255, 255, 0.55); }
        .source-tag { font-size: 8.5px; font-weight: 600; padding: 1.5px 6px; border-radius: 999px; background: rgba(255, 255, 255, 0.08); color: rgba(255, 255, 255, 0.65); border: 1px solid rgba(255, 255, 255, 0.1); }
      </style>
    </head>
    <body>
      <div class="aura"></div>
      <div class="header">
        <div class="badge"><span style="color: ${kalankAccent}">✦</span><span>${kalankComp.strategyName}</span></div>
        <span class="state-pill">100% — Contrasting Strategy ("Kalank")</span>
      </div>
      <div class="canvas-wrap"><svg viewBox="0 0 900 440" preserveAspectRatio="xMidYMid meet">${kalankLayers}</svg></div>
      <div class="footer">
        <div class="metaphor">&ldquo;${kalankComp.central_metaphor}&rdquo;</div>
        <div class="meta-row"><span>${kalankComp.emotional_theme}</span><span class="source-tag">✦ Procedural Preview (ComfyUI Offline)</span></div>
      </div>
    </body>
    </html>
  `;

  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(kalankHtml)}`);
  await new Promise(r => setTimeout(r, 120));
  const kalankImg = await win.capturePage();
  const kalankPath = path.join(outputDir, `progression_kalank_100.png`);
  fs.writeFileSync(kalankPath, kalankImg.toPNG());
  console.log(`Saved screenshot: ${kalankPath}`);

  app.quit();
}

main().catch(err => {
  console.error('Snapshot capture error:', err);
  app.quit();
});
