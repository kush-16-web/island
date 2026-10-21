'use strict';
/**
 * src/lib/song-art.js
 * Living Canvas — Editorial Song Interpretation & Continuous-Line Art Engine.
 *
 * Interprets a song's emotional core, lyric narrative, and musical atmosphere
 * into a structured visual concept with expressive continuous-line vector artwork.
 */

/**
 * Interprets a song and returns a rich concept object.
 * @param {string} title - Song title
 * @param {string} artist - Artist name
 * @param {string} [lyrics] - Lyrics snippet or description
 * @returns {Object} Structured concept
 */
export function interpretSongForArt(title = '', artist = '', lyrics = '') {
  const norm = `${title} ${artist} ${lyrics}`.toLowerCase();

  // 1. Romantic / Devotion / Yearning / Poignant (e.g. Kalank, Bol Do Na Zara, Pashmina)
  if (
    norm.includes('kalank') ||
    norm.includes('bol do') ||
    norm.includes('pashmina') ||
    norm.includes('love') ||
    norm.includes('dil') ||
    norm.includes('zara') ||
    norm.includes('ishq') ||
    norm.includes('tujh') ||
    norm.includes('tere') ||
    norm.includes('heart') ||
    norm.includes('forever') ||
    norm.includes('jaan') ||
    norm.includes('tum')
  ) {
    return {
      emotional_theme: `Sacred devotion, intense romantic yearning, and poignant vulnerability in "${title}"`,
      central_metaphor: 'Two ethereal continuous silhouettes entwined like silk ribbons woven through sacred flame',
      main_visual_subject: 'An unbroken fluid line tracing two leaning profiles whose gaze transforms into blooming lotus curves and celestial embers',
      supporting_symbols: ['drifting flame filament', 'blooming lotus curve', 'sacred aura ring'],
      color_palette: {
        background: '#150a0e',
        line_color: '#fef08a',
        accent_color: '#f43f5e',
        secondary_accent: '#fb923c',
        mood_description: 'Deep crimson velvet with sacred saffron and radiant amber line work',
      },
      line_type: 'romantic',
    };
  }

  // 2. Melancholy / Rain / Midnight / Solitude
  if (
    norm.includes('rain') ||
    norm.includes('midnight') ||
    norm.includes('night') ||
    norm.includes('blue') ||
    norm.includes('lonely') ||
    norm.includes('dark') ||
    norm.includes('sad') ||
    norm.includes('tear')
  ) {
    return {
      emotional_theme: `Quiet contemplative solitude and nocturnal reflections in "${title}"`,
      central_metaphor: 'A descending single ink tear that unfurls into concentric water ripples beneath city streetlight',
      main_visual_subject: 'A continuous line tracing a bowed contemplative figure dissolving into widening harmonic water rings',
      supporting_symbols: ['inverted umbrella', 'vertical rain striation', 'solitary amber streetlight'],
      color_palette: {
        background: '#090d16',
        line_color: '#93c5fd',
        accent_color: '#38bdf8',
        secondary_accent: '#64748b',
        mood_description: 'Midnight indigo slate with cool mist line work and celestial cyan glow',
      },
      line_type: 'melancholic',
    };
  }

  // 3. Euphoria / Solar / Ascension / Electronic / Light
  if (
    norm.includes('sun') ||
    norm.includes('light') ||
    norm.includes('fire') ||
    norm.includes('fly') ||
    norm.includes('sky') ||
    norm.includes('gold') ||
    norm.includes('star') ||
    norm.includes('dance') ||
    norm.includes('energy')
  ) {
    return {
      emotional_theme: `Transcendent ascension and radiant catharsis breaking free from gravity in "${title}"`,
      central_metaphor: 'Outstretched open palms releasing an origami crane whose wings become rays of morning sun',
      main_visual_subject: 'A single unbroken energetic contour ascending upward into an unfolding celestial sunburst',
      supporting_symbols: ['origami crane', 'radial sunray arcs', 'ascending frequency spirals'],
      color_palette: {
        background: '#18110b',
        line_color: '#fef3c7',
        accent_color: '#f97316',
        secondary_accent: '#eab308',
        mood_description: 'Warm obsidian bronze with incandescent solar gold and flare contours',
      },
      line_type: 'solar',
    };
  }

  // 4. Acoustic / Folk / Nature / Earth / Roots
  if (
    norm.includes('wood') ||
    norm.includes('echo') ||
    norm.includes('tree') ||
    norm.includes('pine') ||
    norm.includes('home') ||
    norm.includes('dust') ||
    norm.includes('river') ||
    norm.includes('acoustic')
  ) {
    return {
      emotional_theme: `Tactile warmth, generational memory, and timeless acoustic resonance in "${title}"`,
      central_metaphor: 'The grain of a wooden soundboard branching into living willow roots that cradle a hearth',
      main_visual_subject: 'A calligraphic stroke tracing the waist of a stringed instrument growing into deep earthen roots',
      supporting_symbols: ['acoustic soundhole', 'drifting leaf outline', 'root filaments'],
      color_palette: {
        background: '#14120e',
        line_color: '#e7e5e4',
        accent_color: '#d97706',
        secondary_accent: '#78716c',
        mood_description: 'Aged walnut bistre with archival cotton line and warm raw umber earth tones',
      },
      line_type: 'acoustic',
    };
  }

  // Dynamic Algorithmic Theme for any other track
  const seed = (title + artist).split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const palettes = [
    {
      background: '#0c131f',
      line_color: '#e2e8f0',
      accent_color: '#38bdf8',
      secondary_accent: '#818cf8',
      mood: 'Nocturnal deep sea with ethereal luminescent blue stroke',
    },
    {
      background: '#18121f',
      line_color: '#f3e8ff',
      accent_color: '#c084fc',
      secondary_accent: '#ec4899',
      mood: 'Twilight amethyst with radiant violet and rose ink lines',
    },
    {
      background: '#0d1814',
      line_color: '#dcfce7',
      accent_color: '#34d399',
      secondary_accent: '#2dd4bf',
      mood: 'Boreal jade forest with tranquil emerald aurora accents',
    },
  ];
  const chosen = palettes[seed % palettes.length];

  return {
    emotional_theme: `Reflective contemplative harmony exploring acoustic depth and resonance in "${title || 'Untitled'}"`,
    central_metaphor: 'Sound waves taking physical form as an unfolding calligraphic ribbon bridging memory and present emotion',
    main_visual_subject: 'An unbroken fluid continuous contour charting an undulating melody line coiling into harmonic resonance',
    supporting_symbols: ['whispering wave curve', 'suspended harmonic pendulum', 'orbital alignment sphere'],
    color_palette: {
      background: chosen.background,
      line_color: chosen.line_color,
      accent_color: chosen.accent_color,
      secondary_accent: chosen.secondary_accent,
      mood_description: chosen.mood,
    },
    line_type: 'abstract',
  };
}
