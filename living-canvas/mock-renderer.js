'use strict';

/**
 * Living Canvas — Isolated Mock Vector Renderer (Debug & Testing Only)
 * 
 * NOTICE: This module is strictly a placeholder harness for offline unit testing.
 * It is NOT evidence of real AI generative artwork.
 */

function renderPlaceholderVector(songMeta, concept) {
  const { title = 'Untitled', artist = 'Unknown' } = songMeta;
  const cp = concept.color_palette || {};
  const bg = cp.background || '#0f172a';
  const line = cp.line_color || '#f8fafc';
  const accent = cp.accent_color || '#38bdf8';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1100" width="800" height="1100">
  <rect width="800" height="1100" fill="${bg}" />
  <rect x="40" y="40" width="720" height="1020" fill="none" stroke="${line}" stroke-width="1" opacity="0.2" />
  
  <text x="70" y="90" font-family="sans-serif" font-size="12" font-weight="600" letter-spacing="0.2em" fill="${accent}" text-transform="uppercase">
    [DEBUG PLACEHOLDER — WORKFLOW VALIDATION ONLY]
  </text>
  
  <text x="70" y="140" font-family="serif" font-size="28" font-weight="600" fill="${line}">${title.replace(/[<>&"]/g, '')}</text>
  <text x="70" y="170" font-family="sans-serif" font-size="14" fill="${accent}">${artist.replace(/[<>&"]/g, '')}</text>

  <!-- Symbolic Curve -->
  <path d="M 120 700 C 200 450, 600 550, 680 320" fill="none" stroke="${line}" stroke-width="3" stroke-linecap="round" />
  <circle cx="680" cy="320" r="10" fill="${accent}" />

  <text x="70" y="960" font-family="sans-serif" font-size="11" fill="${line}" opacity="0.6">
    Metaphor: "${(concept.central_metaphor || '').replace(/[<>&"]/g, '')}"
  </text>
  <text x="70" y="990" font-family="sans-serif" font-size="10" fill="${line}" opacity="0.4">
    Ready for local ComfyUI GPU execution via workflow.json
  </text>
</svg>`;
}

module.exports = {
  renderPlaceholderVector,
};
