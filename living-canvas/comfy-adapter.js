'use strict';

const config = require('./config');

/**
 * Builds the editorial fine-art prompt from the structured concept.
 */
function buildPromptsFromConcept(concept) {
  const {
    emotional_theme,
    central_metaphor,
    main_visual_subject,
    supporting_symbols = [],
    composition,
    color_palette,
    continuous_line_instructions,
    negative_prompt,
  } = concept;

  const symbolsStr = supporting_symbols.join(', ');
  const paletteStr = `${color_palette.background} background, ${color_palette.line_color} fluid ink, accented by ${color_palette.accent_color}`;

  const positivePrompt = [
    'masterpiece fine-art editorial poster',
    'expressive single continuous-line ink drawing',
    'unbroken fluid contour drawing',
    'organic variable line weight with subtle ink bleed',
    `subject: ${main_visual_subject}`,
    `central metaphor: ${central_metaphor}`,
    `supporting subtle elements: ${symbolsStr}`,
    `composition: ${composition}`,
    'vast intentional negative space, uncrowded, meditative, breathing space',
    `restricted color palette: ${paletteStr}`,
    `emotional atmosphere: ${emotional_theme}`,
    'museum gallery lithograph, heavy archival cotton paper texture, elegant visual storytelling',
  ].join(', ');

  const fullNegativePrompt = [
    negative_prompt || '',
    'photorealism, 3d render, CGI, octane render, airbrushed, plastic gloss',
    'generic silhouette, stock clipart, meaningless fractal, mandala, repetitive floral pattern',
    'broken lines, multiple overlapping chaotic sketches, messy crosshatching',
    'garish saturated neon colors, rainbow gradient, muddy colors',
    'letters, typography, watermark, text, signature, low resolution, blurry, artifacts',
  ].filter(Boolean).join(', ');

  return { positivePrompt, negativePrompt: fullNegativePrompt };
}

/**
 * Creates a standard ComfyUI API workflow payload (SDXL / SD1.5 compatible).
 */
function createComfyWorkflow(positivePrompt, negativePrompt, options = {}) {
  const seed = options.seed || Math.floor(Math.random() * 1000000000);
  const width = options.width || 832;
  const height = options.height || 1152;
  const steps = options.steps || 28;
  const cfg = options.cfg || 7.0;
  const checkpoint = options.checkpoint || config.comfy.defaultCheckpoint;

  return {
    prompt: {
      '3': {
        class_type: 'KSampler',
        inputs: {
          cfg,
          denoise: 1,
          latent_image: ['5', 0],
          model: ['4', 0],
          negative: ['7', 0],
          positive: ['6', 0],
          sampler_name: 'euler_ancestral',
          scheduler: 'karras',
          seed,
          steps,
        },
      },
      '4': {
        class_type: 'CheckpointLoaderSimple',
        inputs: {
          ckpt_name: checkpoint,
        },
      },
      '5': {
        class_type: 'EmptyLatentImage',
        inputs: {
          batch_size: 1,
          height,
          width,
        },
      },
      '6': {
        class_type: 'CLIPTextEncode',
        inputs: {
          clip: ['4', 1],
          text: positivePrompt,
        },
      },
      '7': {
        class_type: 'CLIPTextEncode',
        inputs: {
          clip: ['4', 1],
          text: negativePrompt,
        },
      },
      '8': {
        class_type: 'VAEDecode',
        inputs: {
          samples: ['3', 0],
          vae: ['4', 2],
        },
      },
      '9': {
        class_type: 'SaveImage',
        inputs: {
          filename_prefix: 'LivingCanvas',
          images: ['8', 0],
        },
      },
    },
  };
}

/**
 * Generates an editorial SVG poster directly when ComfyUI is offline.
 * Renders continuous Bézier curves, palette chips, and typography in clean vector format.
 */
function renderMockPosterSvg(songMeta, concept, prompts) {
  const { title = 'Untitled', artist = 'Unknown Artist' } = songMeta;
  const { color_palette, emotional_theme, central_metaphor, supporting_symbols = [] } = concept;

  const bg = color_palette.background || '#0f172a';
  const line = color_palette.line_color || '#f8fafc';
  const accent = color_palette.accent_color || '#38bdf8';
  const secAccent = color_palette.secondary_accent || color_palette.accent_color;

  // Generate distinct continuous curve paths based on song title hash
  const hash = (title + artist).split('').reduce((acc, c, i) => acc + c.charCodeAt(0) * (i + 1), 0);
  const variant = hash % 3;

  let artPaths = '';
  if (variant === 0) {
    // Nocturnal / Rain / Ripples / Solitary descent
    artPaths = `
      <!-- Accent Glow Orb -->
      <circle cx="680" cy="460" r="140" fill="${accent}" opacity="0.16" filter="blur(60px)" />
      
      <!-- Continuous Single Ink Line: Solitary Contour into Ripples -->
      <path d="M 460 280 
               C 470 240, 520 230, 550 260 
               C 580 290, 560 360, 520 400 
               C 480 440, 430 460, 420 540 
               C 410 620, 490 680, 530 730 
               C 570 780, 560 840, 510 880 
               C 450 930, 360 920, 330 870 
               C 300 810, 340 760, 420 750 
               C 530 740, 680 770, 740 830 
               C 800 890, 770 980, 670 1020 
               C 550 1060, 390 1050, 320 990 
               C 240 920, 270 810, 380 780 
               C 520 740, 740 790, 840 880 
               C 920 960, 890 1080, 750 1140 
               C 590 1200, 380 1180, 270 1100" 
            fill="none" 
            stroke="${line}" 
            stroke-width="3.5" 
            stroke-linecap="round" 
            stroke-linejoin="round" />

      <!-- Minimal Accent Symbol: Concentric Droplet -->
      <circle cx="550" cy="260" r="6" fill="${accent}" />
      <path d="M 550 266 Q 550 310 520 350" fill="none" stroke="${accent}" stroke-width="2" stroke-dasharray="4 6" opacity="0.7" />
    `;
  } else if (variant === 1) {
    // Ascension / Solar / Origami Crane Wings
    artPaths = `
      <!-- Accent Solar Corona -->
      <circle cx="620" cy="500" r="220" fill="${accent}" opacity="0.18" />
      <circle cx="620" cy="500" r="120" fill="none" stroke="${accent}" stroke-width="1.5" stroke-dasharray="6 8" opacity="0.6" />

      <!-- Continuous Single Ink Line: Ascending Wings & Horizon -->
      <path d="M 280 1120 
               C 320 980, 420 860, 480 780 
               C 520 720, 530 640, 500 580 
               C 470 510, 520 460, 580 470 
               C 640 480, 660 550, 620 620 
               C 580 690, 610 770, 700 780 
               C 800 790, 880 720, 910 610 
               C 930 520, 880 430, 790 390 
               C 700 350, 610 390, 590 480 
               C 570 560, 650 630, 740 640 
               C 850 650, 930 570, 960 460 
               C 980 370, 920 290, 820 280 
               C 720 270, 640 330, 620 420" 
            fill="none" 
            stroke="${line}" 
            stroke-width="3.8" 
            stroke-linecap="round" 
            stroke-linejoin="round" />

      <!-- Secondary Accent: Origami Crest -->
      <polygon points="620,420 660,370 600,380" fill="${secAccent}" opacity="0.9" />
    `;
  } else {
    // Acoustic / Wood Grain / Roots Totem
    artPaths = `
      <!-- Grounding Earth Wash -->
      <ellipse cx="600" cy="950" rx="260" ry="80" fill="${accent}" opacity="0.14" />

      <!-- Continuous Single Ink Line: Acoustic Soundboard Weaving into Roots -->
      <path d="M 600 240 
               C 580 320, 620 390, 600 460 
               C 570 540, 460 570, 440 650 
               C 420 720, 460 780, 520 820 
               C 590 860, 610 880, 600 940 
               C 590 1000, 520 1040, 460 1080 
               M 600 460 
               C 640 530, 740 570, 760 650 
               C 780 730, 730 790, 670 830 
               C 610 870, 590 910, 600 960 
               C 610 1020, 680 1060, 740 1100 
               M 600 660 
               A 45 45 0 1 0 600 750 
               A 45 45 0 1 0 600 660 
               M 600 750 
               C 560 810, 400 870, 360 970 
               C 330 1050, 410 1110, 500 1140" 
            fill="none" 
            stroke="${line}" 
            stroke-width="3.6" 
            stroke-linecap="round" 
            stroke-linejoin="round" />

      <!-- Soundhole Ring -->
      <circle cx="600" cy="705" r="28" fill="${accent}" opacity="0.35" />
    `;
  }

  // Escape xml
  const cleanTitle = title.replace(/[<>&"]/g, '');
  const cleanArtist = artist.replace(/[<>&"]/g, '');
  const cleanTheme = emotional_theme.replace(/[<>&"]/g, '');
  const cleanMetaphor = central_metaphor.replace(/[<>&"]/g, '');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1600" width="1200" height="1600">
  <defs>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600&amp;family=Inter:wght@300;400;500;600&amp;display=swap');
      .poster-bg { fill: ${bg}; }
      .art-frame { fill: none; stroke: ${line}; stroke-width: 0.8; opacity: 0.18; }
      .header-series { font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 600; letter-spacing: 0.28em; fill: ${line}; opacity: 0.55; text-transform: uppercase; }
      .header-num { font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 500; letter-spacing: 0.15em; fill: ${accent}; }
      .poster-title { font-family: 'Cinzel', serif; font-size: 44px; font-weight: 600; letter-spacing: 0.08em; fill: ${line}; }
      .poster-artist { font-family: 'Inter', sans-serif; font-size: 18px; font-weight: 400; letter-spacing: 0.18em; fill: ${accent}; text-transform: uppercase; }
      .meta-label { font-family: 'Inter', sans-serif; font-size: 10px; font-weight: 600; letter-spacing: 0.22em; fill: ${line}; opacity: 0.45; text-transform: uppercase; }
      .meta-text { font-family: 'Inter', sans-serif; font-size: 13.5px; font-weight: 300; line-height: 1.5; fill: ${line}; opacity: 0.82; }
      .tag { font-family: 'Inter', sans-serif; font-size: 11px; font-weight: 500; fill: ${line}; opacity: 0.65; }
    </style>
  </defs>

  <!-- Canvas Background -->
  <rect width="1200" height="1600" class="poster-bg" />

  <!-- Outer Architectural Framing Border -->
  <rect x="60" y="60" width="1080" height="1480" class="art-frame" />
  <rect x="76" y="76" width="1048" height="1448" class="art-frame" stroke-dasharray="4 8" />

  <!-- Header Exhibition Banner -->
  <g transform="translate(110, 120)">
    <text y="0" class="header-series">Island Living Canvas — Pass 01</text>
    <text x="980" y="0" text-anchor="end" class="header-num">PLATE № ${(hash % 99 + 1).toString().padStart(2, '0')}</text>
    <line x1="0" y1="20" x2="980" y2="20" stroke="${line}" stroke-width="0.8" opacity="0.2" />
  </g>

  <!-- Artwork Artwork Viewport (Center) -->
  <g id="continuous-line-artwork">
    ${artPaths}
  </g>

  <!-- Typography & Editorial Storytelling (Bottom Tier) -->
  <g transform="translate(110, 1280)">
    <!-- Dividing Axis -->
    <line x1="0" y1="0" x2="980" y2="0" stroke="${line}" stroke-width="1" opacity="0.25" />
    
    <!-- Title & Artist -->
    <text x="0" y="46" class="poster-title">${cleanTitle}</text>
    <text x="0" y="78" class="poster-artist">${cleanArtist}</text>

    <!-- Narrative Metaphor -->
    <text x="0" y="125" class="meta-label">Central Visual Metaphor</text>
    <text x="0" y="148" class="meta-text" width="620">"${cleanMetaphor}"</text>

    <!-- Emotional Core -->
    <text x="0" y="195" class="meta-label">Emotional Atmosphere</text>
    <text x="0" y="218" class="meta-text" width="620">${cleanTheme}</text>

    <!-- Color Palette Chips & Specs (Right Column) -->
    <g transform="translate(740, 26)">
      <text x="0" y="18" class="meta-label">Palette &amp; Medium</text>
      
      <!-- Swatches -->
      <g transform="translate(0, 32)">
        <rect x="0" y="0" width="32" height="32" rx="4" fill="${bg}" stroke="${line}" stroke-width="0.8" />
        <rect x="42" y="0" width="32" height="32" rx="4" fill="${line}" />
        <rect x="84" y="0" width="32" height="32" rx="4" fill="${accent}" />
        <rect x="126" y="0" width="32" height="32" rx="4" fill="${secAccent}" />
      </g>
      
      <text x="0" y="92" class="tag">Medium: Sumi-e Continuous Ink Line</text>
      <text x="0" y="112" class="tag">Format: Vector Monotype Print</text>
      <text x="0" y="132" class="tag">Substrate: Heavy Rag Cotton (Mock Mode)</text>
    </g>
  </g>
</svg>`;
}

/**
 * Executes artwork generation via ComfyUI if online, or renders vector SVG poster in mock mode.
 */
async function generateArtwork(songMeta, concept, options = {}) {
  const { forceMock = false, comfyUrl = config.comfy.url } = options;
  const prompts = buildPromptsFromConcept(concept);

  if (forceMock) {
    const svgContent = renderMockPosterSvg(songMeta, concept, prompts);
    return {
      ok: true,
      mode: 'mock-svg-renderer',
      format: 'svg',
      content: svgContent,
      prompts,
      comfyWorkflow: createComfyWorkflow(prompts.positivePrompt, prompts.negativePrompt),
    };
  }

  // Attempt live ComfyUI generation
  try {
    const workflow = createComfyWorkflow(prompts.positivePrompt, prompts.negativePrompt);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.comfy.timeoutMs);

    const postRes = await fetch(`${comfyUrl}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(workflow),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!postRes.ok) {
      throw new Error(`ComfyUI /prompt error HTTP ${postRes.status}: ${postRes.statusText}`);
    }

    const { prompt_id } = await postRes.json();
    return {
      ok: true,
      mode: 'comfyui-live',
      format: 'workflow-queued',
      promptId: prompt_id,
      prompts,
      comfyWorkflow: workflow,
    };
  } catch (err) {
    // Graceful fallback to deterministic high-res SVG poster
    const svgContent = renderMockPosterSvg(songMeta, concept, prompts);
    return {
      ok: true,
      mode: 'mock-svg-fallback',
      format: 'svg',
      content: svgContent,
      prompts,
      comfyWorkflow: createComfyWorkflow(prompts.positivePrompt, prompts.negativePrompt),
      fallbackReason: err.message,
    };
  }
}

module.exports = {
  buildPromptsFromConcept,
  createComfyWorkflow,
  renderMockPosterSvg,
  generateArtwork,
};
