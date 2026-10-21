'use strict';

const config = require('./config');

const SYSTEM_PROMPT = `You are an expert editorial art director and master continuous-line illustrator.
Your task is to interpret a song's emotional core, lyric narrative, and musical atmosphere into a structured visual concept for an editorial fine-art poster.

CRITICAL ARTISTIC PRINCIPLES:
1. Expressive continuous-line drawing: The artwork must be anchored by an unbroken, organic single-stroke ink line.
2. Conceptual symbolism: Avoid literal depictions. Derive a profound visual metaphor from the song's meaning.
3. Intentional negative space: At least 55% of the composition must remain empty and breathing.
4. Minimal, restrained palette: Exactly 2 to 4 harmonious colors (e.g., warm bone background, charcoal sumi ink line, single burnt-ochre accent).
5. No generic AI clichés: Absolutely NO generic silhouettes, random floating flowers, meaningless mandalas, stock illustrations, or 3D gloss.

You MUST reply ONLY with a valid JSON object matching this exact structure:
{
  "emotional_theme": "1 sentence defining the nuanced emotional core of the song",
  "central_metaphor": "1 sentence describing the visual metaphor translating sound to imagery",
  "main_visual_subject": "Detailed description of the primary continuous-line figure/form",
  "supporting_symbols": ["symbol 1", "symbol 2", "symbol 3"],
  "composition": "Detailed spatial arrangement, balance, and intentional negative space placement",
  "color_palette": {
    "background": "#hex",
    "line_color": "#hex",
    "accent_color": "#hex",
    "secondary_accent": "#hex (optional)",
    "mood_description": "short description of the color harmony"
  },
  "continuous_line_instructions": "Precise path description explaining how the single line flows, loops, and tapers without breaking",
  "negative_prompt": "comma-separated list of visual elements to strictly avoid"
}`;

/**
 * Validates that an interpreted concept contains all required fields and types.
 */
function validateConcept(concept) {
  if (!concept || typeof concept !== 'object') {
    throw new Error('Concept must be a non-null object');
  }
  const requiredFields = [
    'emotional_theme',
    'central_metaphor',
    'main_visual_subject',
    'supporting_symbols',
    'composition',
    'color_palette',
    'continuous_line_instructions',
    'negative_prompt',
  ];

  for (const field of requiredFields) {
    if (!concept[field]) {
      throw new Error(`Concept missing required field: "${field}"`);
    }
  }

  if (!Array.isArray(concept.supporting_symbols) || concept.supporting_symbols.length === 0) {
    throw new Error('supporting_symbols must be a non-empty array of strings');
  }

  const cp = concept.color_palette;
  if (!cp || typeof cp !== 'object' || !cp.background || !cp.line_color || !cp.accent_color) {
    throw new Error('color_palette must contain background, line_color, and accent_color');
  }

  return true;
}

/**
 * Deterministic Mock Concept Generator
 * Provides distinct, fine-art editorial concepts for testing and offline development.
 */
function generateDeterministicMockConcept({ title = '', artist = '', lyrics = '' }) {
  const normalized = `${title} ${artist} ${lyrics}`.toLowerCase();

  // Theme 1: Melancholy / Rain / Midnight / Solitude
  if (normalized.includes('rain') || normalized.includes('midnight') || normalized.includes('night') || normalized.includes('blue') || normalized.includes('lonely') || normalized.includes('shadow')) {
    return {
      emotional_theme: 'Solitary grief transitioning into silent nocturnal acceptance amidst city rain',
      central_metaphor: 'A descending tear that unfurls into pavement water ripples, absorbing city lamplight',
      main_visual_subject: 'A continuous sumi-ink stroke tracing the bowed posture of a solitary trench-coated listener whose spine dissolves into concentric water rings',
      supporting_symbols: [
        'inverted umbrella catching fallen stars',
        'subtle vertical rain striations',
        'single amber streetlamp glow',
      ],
      composition: 'Off-center vertical placement in the lower-left third; 65% serene negative space in the upper-right hemisphere allowing breathing room',
      color_palette: {
        background: '#0d131a',
        line_color: '#cbd5e1',
        accent_color: '#d97706',
        secondary_accent: '#334155',
        mood_description: 'Deep midnight slate with cool mist line work and solitary warm amber lamplight',
      },
      continuous_line_instructions: 'An unbroken, weighted fluid stroke begins at the figure silhouette crown, flows down the curve of the back, loops tightly around the folded arms, then expands outward in four gentle, widening elliptical ripples across the bottom plane without ever lifting the pen.',
      negative_prompt: 'photorealism, 3D render, glossy textures, neon lights, generic umbrella silhouette, stock raindrops, text, signature, watermark, clutter',
    };
  }

  // Theme 2: Euphoria / Solar / Ascension / Electronic / Awakening
  if (normalized.includes('sun') || normalized.includes('flare') || normalized.includes('light') || normalized.includes('fire') || normalized.includes('fly') || normalized.includes('gold') || normalized.includes('sky')) {
    return {
      emotional_theme: 'Electric catharsis and spiritual transcendence breaking free from earthbound gravity',
      central_metaphor: 'Outstretched human hands releasing an origami crane whose wings become the rays of a rising solar dawn',
      main_visual_subject: 'A single energetic continuous contour outlining two intertwined open palms ascending upward into an unfolding celestial sunburst',
      supporting_symbols: [
        'geometric paper crane in flight',
        'radial sunray arcs',
        'fine harmonic frequency lines',
      ],
      composition: 'Ascending diagonal composition rising from bottom-center toward top-right; 60% negative space on bottom and flanks focusing upward energy',
      color_palette: {
        background: '#fafaf9',
        line_color: '#1c1917',
        accent_color: '#ea580c',
        secondary_accent: '#facc15',
        mood_description: 'Warm natural linen paper with rich carbon ink line and vibrant cadmium solar flare',
      },
      continuous_line_instructions: 'The stroke enters from the lower edge, weaves through the fingers of the lower hand, spirals smoothly into the upper wrist, leaps across the wingspan of the origami bird, and spirals outward in two sweeping solar coronas before tapering into silence.',
      negative_prompt: '3D glossy CGI, lens flare, oversaturated gradient, generic sun emoji, cartoon wings, photorealistic hands, messy scribbles, watermark',
    };
  }

  // Theme 3: Acoustic / Nostalgia / Memory / Wood / Earth / Roots
  if (normalized.includes('wood') || normalized.includes('echo') || normalized.includes('tree') || normalized.includes('pine') || normalized.includes('heart') || normalized.includes('home') || normalized.includes('dust')) {
    return {
      emotional_theme: 'Generational memory, quiet reverence for time, and the tactile comfort of acoustic woodcraft',
      central_metaphor: 'The grain of an ancient acoustic guitar soundboard branching into living willow roots that cradle an old family hearth',
      main_visual_subject: 'A calligraphic continuous line tracing the waist and bout of a hollow wooden instrument whose grain lines seamlessly grow into deep earthen roots',
      supporting_symbols: [
        'spiral acoustic soundhole',
        'drifting autumnal leaf outline',
        'delicate root filaments',
      ],
      composition: 'Centrally anchored balanced vertical totem with 55% quiet negative space surrounding the perimeter; evokes classical museum lithograph balance',
      color_palette: {
        background: '#f5f2eb',
        line_color: '#292524',
        accent_color: '#854d0e',
        secondary_accent: '#44403c',
        mood_description: 'Weathered archival cotton paper, aged walnut bistre ink, and warm raw umber earth tones',
      },
      continuous_line_instructions: 'Beginning at the guitar tuning peg, the line cascades down the neck, loops gracefully around the central soundhole spiral, contours the acoustic lower bout, and branches into three sinuous root fibers that anchor the composition base.',
      negative_prompt: 'digital gradient, 3D musical notes, cartoon guitar, glossy veneer, generic tree silhouette, clipart, watermark, signature',
    };
  }

  // Dynamic Algorithmic Fallback for arbitrary songs
  const seed = (title + artist).split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const palettes = [
    { background: '#f8fafc', line_color: '#0f172a', accent_color: '#0284c7', mood: 'Cool architectural slate with Aegean sea blue' },
    { background: '#18181b', line_color: '#e4e4e7', accent_color: '#a855f7', mood: 'Obsidian concert hall with ethereal violet ink' },
    { background: '#fefce8', line_color: '#1e1b4b', accent_color: '#e11d48', mood: 'Warm Japanese washi with indigo sumi and crimson seal' },
  ];
  const chosenPalette = palettes[seed % palettes.length];

  return {
    emotional_theme: `Reflective contemplative journey exploring resonance and quiet vulnerability in "${title}"`,
    central_metaphor: `Sound vibrations taking physical form as an unfolding architectural ribbon bridging past memory and present sensation`,
    main_visual_subject: `An unbroken fluid continuous line charting the silhouette of a human profile whose gaze transforms into undulating soundwaves`,
    supporting_symbols: [
      'whispering wave curve',
      'suspended acoustic pendulum',
      'orbital alignment sphere',
    ],
    composition: 'Asymmetrical horizontal sweep across the center tier with 58% negative space framing the top and bottom margins',
    color_palette: {
      background: chosenPalette.background,
      line_color: chosenPalette.line_color,
      accent_color: chosenPalette.accent_color,
      mood_description: chosenPalette.mood,
    },
    continuous_line_instructions: 'One single unbroken line traces the forehead and lips of a contemplative face, sweeps backward into a looping harmonic frequency wave, and coils softly back onto itself without interruption.',
    negative_prompt: 'photorealistic rendering, 3D CGI, cartoon illustration, chaotic scratches, stock clipart, watermark, text',
  };
}

/**
 * Interprets a song using local Ollama if available, falling back to deterministic mock concept.
 */
async function interpretSong({ title, artist = 'Unknown Artist', lyrics = '' }, options = {}) {
  const { forceMock = false, ollamaUrl = config.ollama.url, model = config.ollama.model } = options;

  if (forceMock) {
    return {
      concept: generateDeterministicMockConcept({ title, artist, lyrics }),
      source: 'deterministic-mock',
      model: 'rule-based-art-director',
    };
  }

  try {
    const userPrompt = `Song Title: "${title}"\nArtist: "${artist}"\nLyrics/Excerpts: ${lyrics ? `\n"${lyrics.slice(0, 800)}"` : 'None provided'}\n\nGenerate the structured visual concept JSON:`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.ollama.timeoutMs);

    const res = await fetch(`${ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        stream: false,
        format: 'json',
      }),
    });
    clearTimeout(timer);

    if (!res.ok) {
      throw new Error(`Ollama returned HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    const rawContent = data.message?.content || '{}';
    const parsed = JSON.parse(rawContent);

    validateConcept(parsed);

    return {
      concept: parsed,
      source: 'local-ollama',
      model,
    };
  } catch (err) {
    // Graceful fallback to deterministic mock engine
    const fallback = generateDeterministicMockConcept({ title, artist, lyrics });
    return {
      concept: fallback,
      source: 'deterministic-mock',
      fallbackReason: err.message,
      model: 'rule-based-art-director',
    };
  }
}

module.exports = {
  interpretSong,
  generateDeterministicMockConcept,
  validateConcept,
  SYSTEM_PROMPT,
};
