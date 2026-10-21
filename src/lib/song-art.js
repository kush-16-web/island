'use strict';
/**
 * src/lib/song-art.js
 * Living Canvas — Editorial Song Interpretation & Procedural Continuous-Line Art Engine.
 *
 * Interprets any song's emotional core, lyric narrative, and musical atmosphere
 * into a structured visual concept with procedurally generated continuous-line vector artwork.
 */

/**
 * Procedural Curve Generator:
 * Creates unique, deterministic Bézier spline curves and focal nodes for ANY song title & artist.
 * Ensures every single track generates a distinct, unique artwork rather than a static duplicate.
 *
 * @param {string} title
 * @param {string} artist
 * @returns {{ pathD: string, nodes: Array<{ x: number, y: number, r: number }> }}
 */
export function generateProceduralCurve(title = '', artist = '') {
  let hash = 0;
  const str = `${(title || 'untitled').trim()}__${(artist || 'unknown').trim()}`.toLowerCase();
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }

  const rng = (offset = 0) => {
    const x = Math.sin(hash + offset * 1.618) * 10000;
    return x - Math.floor(x);
  };

  const startY = 160 + Math.round(rng(1) * 120);
  let pathD = `M 60,${startY}`;
  const nodes = [];

  const segments = 4;
  const segWidth = (840 - 60) / segments;

  for (let i = 1; i <= segments; i++) {
    const endX = Math.round(60 + i * segWidth);
    // Vertical harmonic inflection based on seed
    const endY = Math.round(100 + rng(i * 5 + 2) * 220);

    const cp1X = Math.round(endX - segWidth * (0.65 - rng(i * 7 + 1) * 0.2));
    const cp1Y = Math.round(60 + rng(i * 11 + 3) * 300);

    const cp2X = Math.round(endX - segWidth * (0.25 - rng(i * 13 + 4) * 0.15));
    const cp2Y = Math.round(60 + rng(i * 17 + 5) * 300);

    pathD += ` C ${cp1X},${cp1Y} ${cp2X},${cp2Y} ${endX},${endY}`;

    // Anchor focal nodes at dynamic crests
    if (i < segments) {
      nodes.push({
        x: endX,
        y: endY,
        r: 4 + Math.round(rng(i * 19) * 3),
      });
    }
  }

  return { pathD, nodes };
}

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

  // 2. Pop / Funk / Rhythmic / Groove (e.g. How Long, Attention, Blinding Lights, Uptown Funk)
  if (
    norm.includes('how long') ||
    norm.includes('attention') ||
    norm.includes('groove') ||
    norm.includes('funk') ||
    norm.includes('pop') ||
    norm.includes('beat') ||
    norm.includes('rhythm') ||
    norm.includes('charlie') ||
    norm.includes('dua') ||
    norm.includes('the weeknd') ||
    norm.includes('bruno') ||
    norm.includes('dance') ||
    norm.includes('disco')
  ) {
    return {
      emotional_theme: `Sensory tension, pulsed basslines, and syncopated kinetic momentum in "${title}"`,
      central_metaphor: 'A spiraling neon acoustic vector cutting through shadows with razor-sharp syncopated cadence',
      main_visual_subject: 'A kinetic continuous stroke oscillating in tight energetic harmonic waves before looping into an accented focal pulse',
      supporting_symbols: ['syncopated pulse bar', 'orbital wave resonance', 'focal cadence node'],
      color_palette: {
        background: '#120b18',
        line_color: '#f472b6',
        accent_color: '#a855f7',
        secondary_accent: '#38bdf8',
        mood_description: 'Electric violet neon with magenta cadence and deep nocturnal bass',
      },
      line_type: 'rhythmic',
    };
  }

  // 3. Melancholy / Rain / Midnight / Solitude
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

  // 4. Euphoria / Solar / Ascension / Electronic / Light
  if (
    norm.includes('sun') ||
    norm.includes('light') ||
    norm.includes('fire') ||
    norm.includes('fly') ||
    norm.includes('sky') ||
    norm.includes('gold') ||
    norm.includes('star') ||
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

  // 5. Acoustic / Folk / Nature / Earth / Roots
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

  // Dynamic Algorithmic Theme for any other track (uniquely computed from title & artist)
  const seed = (title + artist).split('').reduce((acc, c, i) => acc + c.charCodeAt(0) * (i + 1), 0);
  const palettes = [
    {
      background: '#0c131f',
      line_color: '#e2e8f0',
      accent_color: '#38bdf8',
      secondary_accent: '#818cf8',
      mood: 'Nocturnal deep sea with ethereal luminescent blue stroke',
      metaphor: 'An unfolding architectural ribbon bridging reverberating past memory and present sensation',
    },
    {
      background: '#18121f',
      line_color: '#f3e8ff',
      accent_color: '#c084fc',
      secondary_accent: '#ec4899',
      mood: 'Twilight amethyst with radiant violet and rose ink lines',
      metaphor: 'Prismatic frequency waves condensing into a suspended kinetic crystalline pendulum',
    },
    {
      background: '#0d1814',
      line_color: '#dcfce7',
      accent_color: '#34d399',
      secondary_accent: '#2dd4bf',
      mood: 'Boreal jade forest with tranquil emerald aurora accents',
      metaphor: 'A continuous evergreen harmonic contour winding through quiet mist and resonant stones',
    },
    {
      background: '#1f130d',
      line_color: '#fed7aa',
      accent_color: '#f97316',
      secondary_accent: '#fbbf24',
      mood: 'Amber embers with incandescent brass harmonics',
      metaphor: 'Ascending thermal acoustic spirals tracing the warm afterglow of an analog vinyl groove',
    },
  ];
  const chosen = palettes[seed % palettes.length];

  return {
    emotional_theme: `Reflective contemplative harmony exploring acoustic depth and resonance in "${title || 'Untitled'}"`,
    central_metaphor: chosen.metaphor,
    main_visual_subject: `An unbroken continuous line charting an undulating harmonic contour unique to "${title}"`,
    supporting_symbols: ['whispering wave curve', 'suspended harmonic pendulum', 'orbital alignment sphere'],
    color_palette: {
      background: chosen.background,
      line_color: chosen.line_color,
      accent_color: chosen.accent_color,
      secondary_accent: chosen.secondary_accent,
      mood_description: chosen.mood,
    },
    line_type: 'dynamic',
  };
}
