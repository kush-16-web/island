'use strict';

const fs = require('fs');
const path = require('path');
const config = require('./config');
const { getAllManifests } = require('./store');

/**
 * Builds a standalone exhibition HTML gallery to visually inspect generated artworks
 */
function buildExhibitionGallery() {
  const manifests = getAllManifests();

  const cardsHtml = manifests
    .map((m) => {
      const dir = path.join(config.outputDir, m.slug);
      let concept = {};
      let prompts = {};

      try {
        concept = JSON.parse(fs.readFileSync(path.join(dir, 'concept.json'), 'utf8'));
      } catch {
        concept = {};
      }

      try {
        prompts = JSON.parse(fs.readFileSync(path.join(dir, 'prompt.json'), 'utf8'));
      } catch {
        prompts = {};
      }

      const cp = concept.color_palette || {};
      const artworkRel = `${m.slug}/${m.files.artwork}`;

      const swatchesHtml = [cp.background, cp.line_color, cp.accent_color, cp.secondary_accent]
        .filter(Boolean)
        .map(
          (c) =>
            `<span class="swatch" style="background:${c};" title="${c}"></span>`
        )
        .join('');

      const symbolsHtml = (concept.supporting_symbols || [])
        .map((s) => `<span class="badge">${s}</span>`)
        .join(' ');

      return `
      <article class="art-card">
        <div class="art-preview">
          <img src="${artworkRel}" alt="${m.song.title}" loading="lazy" />
        </div>
        <div class="art-meta">
          <div class="art-header">
            <div>
              <span class="song-artist">${m.song.artist}</span>
              <h2 class="song-title">${m.song.title}</h2>
            </div>
            <span class="mode-tag ${m.generator.mode.includes('mock') ? 'is-mock' : 'is-live'}">
              ${m.generator.mode}
            </span>
          </div>

          <div class="info-block">
            <span class="info-label">Emotional Theme</span>
            <p class="info-val">${concept.emotional_theme || '—'}</p>
          </div>

          <div class="info-block">
            <span class="info-label">Central Visual Metaphor</span>
            <p class="info-val metaphor">"${concept.central_metaphor || '—'}"</p>
          </div>

          <div class="info-block">
            <span class="info-label">Primary Subject &amp; Line Logic</span>
            <p class="info-val">${concept.main_visual_subject || '—'}</p>
          </div>

          <div class="info-block">
            <span class="info-label">Supporting Symbols</span>
            <div class="symbols-wrap">${symbolsHtml}</div>
          </div>

          <div class="info-block">
            <span class="info-label">Color Harmony</span>
            <div class="palette-row">
              <div class="swatches">${swatchesHtml}</div>
              <span class="palette-desc">${cp.mood_description || ''}</span>
            </div>
          </div>

          <details class="prompts-accordion">
            <summary>Inspect ComfyUI Prompts &amp; Line Instructions</summary>
            <div class="prompt-box">
              <strong>Line Instructions:</strong>
              <p>${concept.continuous_line_instructions || '—'}</p>
              <strong>Positive Prompt:</strong>
              <code>${prompts.prompts?.positivePrompt || '—'}</code>
              <strong>Negative Prompt:</strong>
              <code>${prompts.prompts?.negativePrompt || '—'}</code>
            </div>
          </details>
        </div>
      </article>
      `;
    })
    .join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Island — Living Canvas Exhibition Gallery</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #090a0f;
      --card-bg: rgba(18, 20, 28, 0.75);
      --border: rgba(255, 255, 255, 0.08);
      --border-accent: rgba(56, 189, 248, 0.3);
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --accent: #38bdf8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: 'Inter', -apple-system, sans-serif;
      padding: 40px 24px 80px;
      line-height: 1.6;
    }
    .header {
      max-width: 1400px;
      margin: 0 auto 48px;
      padding-bottom: 24px;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      flex-wrap: wrap;
      gap: 16px;
    }
    .header h1 {
      font-family: 'Cinzel', serif;
      font-size: 32px;
      letter-spacing: 0.06em;
      color: #fff;
    }
    .header p {
      color: var(--text-muted);
      font-size: 14px;
      margin-top: 6px;
    }
    .gallery-grid {
      max-width: 1400px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 48px;
    }
    .art-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 20px;
      overflow: hidden;
      display: grid;
      grid-template-columns: 460px 1fr;
      box-shadow: 0 12px 36px -8px rgba(0,0,0,0.6);
      transition: border-color 0.3s;
    }
    .art-card:hover {
      border-color: var(--border-accent);
    }
    .art-preview {
      background: #000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      border-right: 1px solid var(--border);
    }
    .art-preview img {
      width: 100%;
      height: auto;
      max-height: 620px;
      object-fit: contain;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.5);
    }
    .art-meta {
      padding: 32px;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .art-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 1px solid var(--border);
      padding-bottom: 16px;
    }
    .song-artist {
      font-size: 13px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--accent);
      font-weight: 500;
    }
    .song-title {
      font-family: 'Cinzel', serif;
      font-size: 26px;
      font-weight: 600;
      color: #fff;
      margin-top: 2px;
    }
    .mode-tag {
      font-size: 11px;
      padding: 4px 10px;
      border-radius: 12px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-weight: 600;
    }
    .mode-tag.is-mock {
      background: rgba(217, 119, 6, 0.18);
      color: #fbbf24;
      border: 1px solid rgba(217, 119, 6, 0.4);
    }
    .mode-tag.is-live {
      background: rgba(34, 197, 94, 0.18);
      color: #4ade80;
      border: 1px solid rgba(34, 197, 94, 0.4);
    }
    .info-block {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .info-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: var(--text-muted);
      font-weight: 600;
    }
    .info-val {
      font-size: 14px;
      color: #e2e8f0;
      line-height: 1.5;
    }
    .info-val.metaphor {
      font-style: italic;
      color: #38bdf8;
    }
    .symbols-wrap {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 4px;
    }
    .badge {
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid var(--border);
      padding: 3px 10px;
      border-radius: 6px;
      font-size: 12px;
      color: #cbd5e1;
    }
    .palette-row {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-top: 4px;
    }
    .swatches {
      display: flex;
      gap: 6px;
    }
    .swatch {
      width: 26px;
      height: 26px;
      border-radius: 4px;
      border: 1px solid rgba(255,255,255,0.2);
      display: inline-block;
    }
    .palette-desc {
      font-size: 12.5px;
      color: var(--text-muted);
    }
    .prompts-accordion {
      margin-top: 10px;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 10px 14px;
      background: rgba(0,0,0,0.25);
    }
    .prompts-accordion summary {
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
      color: var(--accent);
      user-select: none;
    }
    .prompt-box {
      margin-top: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      font-size: 12px;
    }
    .prompt-box code {
      display: block;
      background: #000;
      padding: 8px 10px;
      border-radius: 6px;
      font-family: monospace;
      color: #94a3b8;
      overflow-x: auto;
      white-space: pre-wrap;
    }
    @media (max-width: 900px) {
      .art-card { grid-template-columns: 1fr; }
      .art-preview { border-right: none; border-bottom: 1px solid var(--border); }
    }
  </style>
</head>
<body>
  <header class="header">
    <div>
      <h1>Island Living Canvas</h1>
      <p>Pass 1 — Local Artwork Prototype: Song Interpretation &amp; Continuous-Line Editorial Posters</p>
    </div>
    <div style="font-size: 12px; color: var(--text-muted); text-align: right;">
      <span>Total Artworks: <strong>${manifests.length}</strong></span><br>
      <span>Zero Cloud AI • 100% Local / Deterministic</span>
    </div>
  </header>

  <main class="gallery-grid">
    ${cardsHtml || '<p style="text-align:center; padding: 40px; color: var(--text-muted);">No artworks generated yet. Run: <code>node living-canvas/cli.js test</code></p>'}
  </main>
</body>
</html>`;

  const htmlPath = path.join(config.outputDir, 'index.html');
  fs.writeFileSync(htmlPath, html, 'utf8');
  return htmlPath;
}

module.exports = {
  buildExhibitionGallery,
};
