'use strict';

const fs = require('fs');
const path = require('path');
const config = require('./config');
const { getAllManifests } = require('./store');

/**
 * Builds a standalone exhibition HTML gallery to visually inspect generated artworks
 * and validated ComfyUI workflows.
 */
function buildExhibitionGallery() {
  const manifests = getAllManifests();

  const cardsHtml = manifests
    .map((m) => {
      const dir = path.join(config.outputDir, m.slug);
      let concept = {};
      let prompts = {};
      let evaluation = null;

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

      try {
        evaluation = JSON.parse(fs.readFileSync(path.join(dir, 'evaluation.json'), 'utf8'));
      } catch {
        evaluation = null;
      }

      const cp = concept.color_palette || {};
      const hasArtwork = Boolean(m.files?.artwork && fs.existsSync(path.join(dir, m.files.artwork)));
      const artworkRel = hasArtwork ? `${m.slug}/${m.files.artwork}` : null;
      const isRealAI = m.status === 'generated_ai_raster';

      const swatchesHtml = [cp.background, cp.line_color, cp.accent_color, cp.secondary_accent]
        .filter(Boolean)
        .map((c) => `<span class="swatch" style="background:${c};" title="${c}"></span>`)
        .join('');

      const symbolsHtml = (concept.supporting_symbols || [])
        .map((s) => `<span class="badge">${s}</span>`)
        .join(' ');

      // Evaluation criteria chips
      const evalChipsHtml = evaluation?.criteria
        ? evaluation.criteria
            .map(
              (c) =>
                `<span class="eval-chip ${c.passed ? 'is-pass' : 'is-warn'}" title="${c.description}">
                  ${c.passed ? '✓' : '⚠'} ${c.title} (${c.score}/${c.weight})
                </span>`
            )
            .join(' ')
        : '';

      const previewHtml = hasArtwork
        ? `<div class="art-preview">
             <img src="${artworkRel}" alt="${m.song.title}" loading="lazy" />
           </div>`
        : `<div class="art-preview is-validation-card" style="background: ${cp.background || '#0f172a'}; color: ${cp.line_color || '#f8fafc'};">
             <div class="validation-badge">PORTABLE COMFYUI WORKFLOW VALIDATED</div>
             <div class="validation-symbol" style="border-color: ${cp.accent_color || '#38bdf8'};">
               <span style="color: ${cp.accent_color || '#38bdf8'}; font-size: 32px;">✦</span>
             </div>
             <h3 class="validation-subject">"${concept.main_visual_subject || 'Continuous-Line Poster'}"</h3>
             <p class="validation-meta">Ready for local GPU execution via <code>workflow.json</code></p>
             <div class="validation-specs">
               <span>Ratio: 832 × 1216 (SDXL)</span>
               <span>Checkpoint: ${m.generator?.checkpoint || 'sd_xl_base_1.0'}</span>
             </div>
           </div>`;

      return `
      <article class="art-card">
        ${previewHtml}
        <div class="art-meta">
          <div class="art-header">
            <div>
              <span class="song-artist">${m.song.artist}</span>
              <h2 class="song-title">${m.song.title}</h2>
            </div>
            <div class="header-tags">
              ${
                evaluation
                  ? `<span class="score-badge ${evaluation.passed ? 'is-high' : 'is-mid'}">Quality Score: ${evaluation.totalScore}/100</span>`
                  : ''
              }
              <span class="mode-tag ${isRealAI ? 'is-live' : 'is-validated'}">
                ${isRealAI ? 'Real AI Generation' : 'Workflow Validated'}
              </span>
            </div>
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
            <span class="info-label">Composition &amp; Line Logic</span>
            <p class="info-val">${concept.composition || '—'}</p>
          </div>

          <div class="info-block">
            <span class="info-label">Supporting Motifs</span>
            <div class="symbols-wrap">${symbolsHtml}</div>
          </div>

          <div class="info-block">
            <span class="info-label">Color Harmony</span>
            <div class="palette-row">
              <div class="swatches">${swatchesHtml}</div>
              <span class="palette-desc">${cp.mood_description || ''}</span>
            </div>
          </div>

          ${
            evaluation
              ? `<div class="info-block">
                   <span class="info-label">Pass 2 Quality Evaluation Rubric</span>
                   <div class="eval-row">${evalChipsHtml}</div>
                 </div>`
              : ''
          }

          <details class="prompts-accordion">
            <summary>Inspect ComfyUI Prompts &amp; Workflow Node Graph</summary>
            <div class="prompt-box">
              <strong>Positive Diffusion Prompt:</strong>
              <code>${prompts.prompts?.positivePrompt || '—'}</code>
              <strong>Negative Diffusion Prompt:</strong>
              <code>${prompts.prompts?.negativePrompt || '—'}</code>
              <p style="font-size: 11px; color: var(--text-muted); margin-top: 6px;">
                Workflow file: <code>${m.slug}/workflow.json</code> (Drag and drop directly into ComfyUI canvas).
              </p>
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
  <title>Island — Living Canvas: Pass 2 Quality Validation</title>
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
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 32px 24px;
      border-right: 1px solid var(--border);
      position: relative;
    }
    .art-preview.is-validation-card {
      text-align: center;
      gap: 16px;
    }
    .validation-badge {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.18em;
      padding: 4px 10px;
      border-radius: 6px;
      background: rgba(56, 189, 248, 0.15);
      color: #38bdf8;
      border: 1px solid rgba(56, 189, 248, 0.3);
    }
    .validation-symbol {
      width: 72px;
      height: 72px;
      border-radius: 50%;
      border: 1px dashed;
      display: grid;
      place-items: center;
      margin: 12px auto;
    }
    .validation-subject {
      font-family: 'Cinzel', serif;
      font-size: 18px;
      font-weight: 600;
      line-height: 1.4;
      padding: 0 12px;
    }
    .validation-meta {
      font-size: 12px;
      color: var(--text-muted);
    }
    .validation-specs {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 11px;
      opacity: 0.6;
      margin-top: 12px;
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
      gap: 18px;
    }
    .art-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 1px solid var(--border);
      padding-bottom: 16px;
    }
    .header-tags {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .score-badge {
      font-size: 11px;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: 12px;
    }
    .score-badge.is-high {
      background: rgba(34, 197, 94, 0.18);
      color: #4ade80;
      border: 1px solid rgba(34, 197, 94, 0.4);
    }
    .score-badge.is-mid {
      background: rgba(234, 179, 8, 0.18);
      color: #facc15;
      border: 1px solid rgba(234, 179, 8, 0.4);
    }
    .mode-tag {
      font-size: 11px;
      padding: 4px 10px;
      border-radius: 12px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-weight: 600;
    }
    .mode-tag.is-validated {
      background: rgba(56, 189, 248, 0.18);
      color: #38bdf8;
      border: 1px solid rgba(56, 189, 248, 0.4);
    }
    .mode-tag.is-live {
      background: rgba(34, 197, 94, 0.18);
      color: #4ade80;
      border: 1px solid rgba(34, 197, 94, 0.4);
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
      font-size: 13.5px;
      color: #e2e8f0;
      line-height: 1.5;
    }
    .info-val.metaphor {
      font-style: italic;
      color: #38bdf8;
    }
    .eval-row {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 4px;
    }
    .eval-chip {
      font-size: 11px;
      padding: 3px 8px;
      border-radius: 4px;
      font-weight: 500;
    }
    .eval-chip.is-pass {
      background: rgba(34, 197, 94, 0.12);
      color: #4ade80;
      border: 1px solid rgba(34, 197, 94, 0.25);
    }
    .eval-chip.is-warn {
      background: rgba(234, 179, 8, 0.12);
      color: #facc15;
      border: 1px solid rgba(234, 179, 8, 0.25);
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
      <h1>Island Living Canvas — Pass 2</h1>
      <p>Real Artwork Quality Validation &amp; Portable ComfyUI Workflows</p>
    </div>
    <div style="font-size: 12px; color: var(--text-muted); text-align: right;">
      <span>Catalog: <strong>${manifests.length} tracks</strong></span><br>
      <span>Zero Cloud AI • Pure Local Workflows</span>
    </div>
  </header>

  <main class="gallery-grid">
    ${cardsHtml || '<p style="text-align:center; padding: 40px; color: var(--text-muted);">No workflows validated yet. Run: <code>node living-canvas/cli.js validate</code></p>'}
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
