'use strict';

/**
 * Living Canvas — Pass 2 Prompt Engine
 * 
 * Translates structured emotional concepts into highly effective, concrete diffusion prompts
 * for editorial continuous-line posters.
 * 
 * Addresses Pass 1 failure: Eliminates label prefixes ("subject:", "central metaphor:")
 * that confuse diffusion models. Uses direct visual emphasis, compositional staging,
 * artistic mediums (sumi-e, Matisse line drawing, gallery linocut), and strict negative prompts.
 */

/**
 * Builds prioritized positive and negative prompts from an interpreted concept.
 * 
 * @param {object} concept - Structured visual concept
 * @param {object} options - Generation options (style, weight)
 * @returns {object} { positivePrompt, negativePrompt, visualAnchors }
 */
function buildEditorialPrompts(concept, options = {}) {
  const {
    emotional_theme,
    central_metaphor,
    main_visual_subject,
    supporting_symbols = [],
    composition,
    color_palette = {},
    continuous_line_instructions,
    negative_prompt = '',
  } = concept;

  const bg = color_palette.background || '#f5f2eb';
  const line = color_palette.line_color || '#1c1917';
  const accent = color_palette.accent_color || '#ea580c';
  const mood = color_palette.mood_description || 'minimal restrained dual-tone';

  // 1. Primary Subject Anchor: Weighted front token with physical descriptive clarity
  const cleanSubject = main_visual_subject.replace(/^a\s+/i, '').trim();
  const primaryAnchor = `(expressive single continuous-line ink drawing of ${cleanSubject}:1.25)`;

  // 2. Metaphorical Integration: Translate abstract metaphor into concrete physical interaction
  const cleanMetaphor = central_metaphor.replace(/^a\s+/i, '').trim();
  const metaphorAnchor = `symbolic metamorphosis of ${cleanMetaphor}`;

  // 3. Supporting Visual Accents
  const symbolsList = supporting_symbols.length > 0
    ? `integrating subtle motifs of (${supporting_symbols.slice(0, 3).join(', ')}:1.1)`
    : '';

  // 4. Composition & Negative Space Staging
  const spatialStaging = `composition: ${composition}, expansive empty negative space, meditative uncluttered layout`;

  // 5. Stylistic & Material Medium: Anchors the fine-art poster look
  const artisticMedium = [
    'editorial art poster',
    'Henri Matisse single-line contour drawing',
    'Japanese sumi ink wash',
    'museum exhibition screenprint',
    'organic fluid line weight variation',
    'archival fine art cotton paper texture',
  ].join(', ');

  // 6. Strict Color Restraint: Enforces the concept's palette
  const colorDirection = `strict limited color palette, ${line} ink on solid ${bg} background, subtle wash of ${accent}, high contrast minimalism, no extraneous colors`;

  // Assemble Positive Prompt in order of diffusion attention priority
  const positivePrompt = [
    primaryAnchor,
    metaphorAnchor,
    symbolsList,
    spatialStaging,
    artisticMedium,
    colorDirection,
    `evoking ${emotional_theme}`,
  ]
    .filter(Boolean)
    .join(', ');

  // Assemble Aggressive Negative Prompt targeting diffusion failure modes
  const negativePromptTokens = [
    negative_prompt,
    'photorealism, 3d render, CGI, octane render, airbrushed, plastic gloss, shading, gradients',
    'generic silhouette, stock clipart, meaningless fractals, mandalas, repetitive floral wallpaper',
    'broken scratchy lines, multiple overlapping chaotic sketches, messy crosshatching, doodles',
    'garish oversaturated neon colors, rainbow gradient, muddy colors, chromatic aberration',
    'letters, words, typography, logo, watermark, signature, border frame, cropped edges',
    'deformed anatomy, extra limbs, mutated hands, multiple subjects, busy background clutter',
  ]
    .filter(Boolean)
    .join(', ');

  return {
    positivePrompt,
    negativePrompt: negativePromptTokens,
    visualAnchors: {
      primary: primaryAnchor,
      metaphor: metaphorAnchor,
      medium: artisticMedium,
      palette: colorDirection,
    },
  };
}

module.exports = {
  buildEditorialPrompts,
};
