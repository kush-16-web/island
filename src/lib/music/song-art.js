'use strict';
/**
 * src/lib/song-art.js
 * Living Canvas — Extensible Visual Metaphor Composition Strategies & Progressive Art Engine.
 *
 * Implements 5 distinct visual composition strategies based on interpreted song concepts:
 * 1. celestial_solar: Layered mountain horizons, rising sunbeams, ascending origami crane.
 * 2. botanical_roots: Earthy root strata, acoustic instrument waist contour, sinuous vines & foliage.
 * 3. nocturnal_rain: Distant skyline silhouette, diagonal rain striations, umbrella curve, pavement ripples.
 * 4. romantic_flame: Lotus base petals, dual rising flame silhouettes in embrace, silk ribbon coil, aura halo.
 * 5. geometric_kinetic: Isometric coordinate planes, stepped syncopated rhythm bars, kinetic acoustic vector.
 *
 * Each strategy provides 4 distinct progressive drawing layers (foundation, structure, metaphor, accent).
 */

export const STRATEGY_IDS = {
  CELESTIAL_SOLAR: 'celestial_solar',
  BOTANICAL_ROOTS: 'botanical_roots',
  NOCTURNAL_RAIN: 'nocturnal_rain',
  ROMANTIC_FLAME: 'romantic_flame',
  GEOMETRIC_KINETIC: 'geometric_kinetic',
};

/**
 * Classifies a song into a distinct visual metaphor composition strategy.
 * @param {string} title
 * @param {string} artist
 * @param {string} [lyrics]
 * @returns {string} Strategy ID
 */
export function classifySongStrategy(title = '', artist = '', lyrics = '') {
  const norm = `${title} ${artist} ${lyrics}`.toLowerCase();

  // 1. Romantic / Sacred Flame / Devotion (e.g. Kalank, Bol Do Na Zara, Pashmina, Perfect)
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
    norm.includes('tum') ||
    norm.includes('romance') ||
    norm.includes('kiss')
  ) {
    return STRATEGY_IDS.ROMANTIC_FLAME;
  }

  // 2. Nocturnal / Melancholy / Rain / Solitude (e.g. Midnight Rain, Someone Like You, Blue)
  if (
    norm.includes('rain') ||
    norm.includes('midnight') ||
    norm.includes('night') ||
    norm.includes('blue') ||
    norm.includes('lonely') ||
    norm.includes('dark') ||
    norm.includes('sad') ||
    norm.includes('tear') ||
    norm.includes('shadow') ||
    norm.includes('cold') ||
    norm.includes('hollow')
  ) {
    return STRATEGY_IDS.NOCTURNAL_RAIN;
  }

  // 3. Celestial Solar / Ascension / Daybreak / Light (e.g. Solar Flare, Daylight, Golden, Sky)
  if (
    norm.includes('sun') ||
    norm.includes('flare') ||
    norm.includes('light') ||
    norm.includes('fire') ||
    norm.includes('fly') ||
    norm.includes('sky') ||
    norm.includes('gold') ||
    norm.includes('star') ||
    norm.includes('dawn') ||
    norm.includes('morning') ||
    norm.includes('ascend') ||
    norm.includes('shine')
  ) {
    return STRATEGY_IDS.CELESTIAL_SOLAR;
  }

  // 4. Botanical Roots / Acoustic / Wood / Earth (e.g. Wooden Porch Echoes, Roots, River, Home)
  if (
    norm.includes('wood') ||
    norm.includes('echo') ||
    norm.includes('tree') ||
    norm.includes('pine') ||
    norm.includes('home') ||
    norm.includes('dust') ||
    norm.includes('river') ||
    norm.includes('acoustic') ||
    norm.includes('roots') ||
    norm.includes('earth') ||
    norm.includes('cabin') ||
    norm.includes('forest')
  ) {
    return STRATEGY_IDS.BOTANICAL_ROOTS;
  }

  // 5. Pop / Funk / Rhythmic / Kinetic Groove (e.g. How Long, Peaches, Attention, Uptown Funk)
  if (
    norm.includes('how long') ||
    norm.includes('peaches') ||
    norm.includes('attention') ||
    norm.includes('groove') ||
    norm.includes('funk') ||
    norm.includes('pop') ||
    norm.includes('beat') ||
    norm.includes('rhythm') ||
    norm.includes('charlie') ||
    norm.includes('bieber') ||
    norm.includes('dua') ||
    norm.includes('the weeknd') ||
    norm.includes('bruno') ||
    norm.includes('dance') ||
    norm.includes('disco') ||
    norm.includes('speed')
  ) {
    return STRATEGY_IDS.GEOMETRIC_KINETIC;
  }

  // Deterministic seed fallback mapping to one of the 5 strategies for arbitrary tracks
  const seed = (title + artist).split('').reduce((acc, c, i) => acc + c.charCodeAt(0) * (i + 1), 0);
  const allStrategies = [
    STRATEGY_IDS.CELESTIAL_SOLAR,
    STRATEGY_IDS.BOTANICAL_ROOTS,
    STRATEGY_IDS.NOCTURNAL_RAIN,
    STRATEGY_IDS.ROMANTIC_FLAME,
    STRATEGY_IDS.GEOMETRIC_KINETIC,
  ];
  return allStrategies[seed % allStrategies.length];
}

/**
 * Builds a deterministic, rich visual composition for a song based on its strategy.
 * Returns 4 progressive drawing layers:
 * - layer 1 (foundation): base horizon/strata/stage
 * - layer 2 (structure): primary subjects
 * - layer 3 (metaphor): thematic focal metaphor
 * - layer 4 (accent): fine details and atmosphere
 *
 * @param {string} title
 * @param {string} artist
 * @param {string} [lyrics]
 * @returns {Object} Complete composition object
 */
export function getCompositionForSong(title = '', artist = '', lyrics = '') {
  const strategyId = classifySongStrategy(title, artist, lyrics);

  // Deterministic fine variance for coordinates based on track hash
  const hash = (title + artist).split('').reduce((acc, c, i) => acc + c.charCodeAt(0) * (i + 1), 0);
  const v = (offset = 0) => {
    const x = Math.sin(hash + offset * 1.618) * 10000;
    return x - Math.floor(x);
  };

  switch (strategyId) {
    case STRATEGY_IDS.CELESTIAL_SOLAR: {
      const ridgeY = Math.round(310 + v(1) * 20);
      return {
        strategyId,
        strategyName: 'Celestial Solar & Ascension',
        emotional_theme: `Transcendent ascension and radiant catharsis breaking free from gravity in "${title}"`,
        central_metaphor: 'Outstretched open palms releasing an origami crane whose wings become rays of morning sun',
        supporting_symbols: ['horizon ridges', 'rising solar disc', 'origami crane', 'solar corona'],
        color_palette: {
          background: '#16110a',
          line_color: '#fef3c7',
          accent_color: '#f97316',
          secondary_accent: '#fbbf24',
          mood_description: 'Obsidian bronze paper with incandescent solar gold and flare contours',
        },
        layers: [
          {
            id: 'foundation',
            phase: 'sketch',
            label: 'Mountain Ridges & Horizon Ground',
            paths: [
              `M 40,380 L 180,${ridgeY} L 320,350 L 480,${ridgeY - 15} L 640,340 L 780,${ridgeY} L 860,380`,
              `M 40,380 L 860,380`,
            ],
            stroke: 'line',
            strokeWidth: 2.2,
            opacity: 0.75,
          },
          {
            id: 'structure',
            phase: 'structure',
            label: 'Rising Solar Disc & Radial Beams',
            paths: [
              `M 370,250 A 80,80 0 0,1 530,250`,
              `M 450,170 L 450,90`,
              `M 405,185 L 340,125`,
              `M 495,185 L 560,125`,
              `M 375,220 L 290,185`,
              `M 525,220 L 610,185`,
            ],
            stroke: 'accent',
            strokeWidth: 2.6,
            opacity: 0.9,
          },
          {
            id: 'metaphor',
            phase: 'metaphor',
            label: 'Origami Celestial Crane in Flight',
            paths: [
              `M 560,170 L 630,105 L 700,140 L 660,180 L 630,105`,
              `M 630,105 L 600,190 L 660,180`,
              `M 700,140 L 760,115 L 720,165`,
            ],
            stroke: 'line',
            strokeWidth: 2.4,
            opacity: 0.95,
          },
          {
            id: 'accent',
            phase: 'accent',
            label: 'Atmospheric Solar Corona & Embers',
            paths: [
              `M 160,260 C 240,210 260,150 360,105`,
              `M 650,85 C 710,65 770,105 830,75`,
            ],
            stroke: 'secondary',
            strokeWidth: 1.8,
            opacity: 0.85,
            nodes: [
              { x: 450, y: 90, r: 4 },
              { x: 630, y: 105, r: 5 },
              { x: 760, y: 115, r: 4 },
            ],
          },
        ],
      };
    }

    case STRATEGY_IDS.BOTANICAL_ROOTS: {
      const rootY = Math.round(360 + v(2) * 15);
      return {
        strategyId,
        strategyName: 'Botanical Roots & Acoustic Heritage',
        emotional_theme: `Tactile warmth, generational memory, and timeless acoustic resonance in "${title}"`,
        central_metaphor: 'The grain of a wooden soundboard branching into living willow roots that cradle a hearth',
        supporting_symbols: ['earthen strata', 'acoustic bout', 'willow vines', 'floating foliage'],
        color_palette: {
          background: '#12100c',
          line_color: '#f5f5f4',
          accent_color: '#d97706',
          secondary_accent: '#78716c',
          mood_description: 'Archival walnut bistre with raw umber root filaments and cotton line',
        },
        layers: [
          {
            id: 'foundation',
            phase: 'sketch',
            label: 'Earthen Ground Strata & Foundation Roots',
            paths: [
              `M 50,345 C 180,355 260,${rootY + 20} 380,${rootY} C 500,365 620,${rootY + 25} 850,345`,
              `M 320,350 C 340,390 310,415 330,435`,
              `M 450,365 C 470,400 440,425 460,438`,
              `M 580,355 C 570,395 615,418 600,435`,
            ],
            stroke: 'accent',
            strokeWidth: 2.2,
            opacity: 0.8,
          },
          {
            id: 'structure',
            phase: 'structure',
            label: 'Acoustic Soundboard Body Silhouette',
            paths: [
              `M 360,345 C 340,290 350,250 390,220 C 410,200 410,165 385,145 C 370,125 385,95 450,95 C 515,95 530,125 515,145 C 490,165 490,200 510,220 C 550,250 560,290 540,345`,
            ],
            stroke: 'line',
            strokeWidth: 2.8,
            opacity: 0.95,
          },
          {
            id: 'metaphor',
            phase: 'metaphor',
            label: 'Sinuous Willow Vines & Soundhole Spiral',
            paths: [
              `M 450,205 C 470,205 475,222 465,232 C 450,242 430,228 435,208 C 440,188 470,182 480,202`,
              `M 385,145 C 310,125 250,165 200,145 C 160,125 140,155 90,135`,
              `M 515,145 C 590,125 650,165 700,145 C 740,125 760,155 810,135`,
            ],
            stroke: 'line',
            strokeWidth: 2.2,
            opacity: 0.85,
          },
          {
            id: 'accent',
            phase: 'accent',
            label: 'Botanical Leaves & Hanging Tendrils',
            paths: [
              `M 200,145 C 215,130 230,150 200,145`,
              `M 700,145 C 715,130 730,150 700,145`,
              `M 270,140 C 285,125 300,145 270,140`,
              `M 630,140 C 645,125 660,145 630,140`,
            ],
            stroke: 'accent',
            strokeWidth: 2.0,
            opacity: 0.9,
            nodes: [
              { x: 450, y: 95, r: 4 },
              { x: 465, y: 232, r: 5 },
              { x: 200, y: 145, r: 4 },
              { x: 700, y: 145, r: 4 },
            ],
          },
        ],
      };
    }

    case STRATEGY_IDS.NOCTURNAL_RAIN: {
      const lampX = Math.round(230 + v(3) * 30);
      return {
        strategyId,
        strategyName: 'Nocturnal Rain & Solitude',
        emotional_theme: `Quiet contemplative solitude and nocturnal reflections in "${title}"`,
        central_metaphor: 'A descending single ink tear that unfurls into concentric water ripples beneath city streetlight',
        supporting_symbols: ['skyline horizon', 'diagonal rain streaks', 'inverted umbrella', 'pavement ripples'],
        color_palette: {
          background: '#090d16',
          line_color: '#cbd5e1',
          accent_color: '#38bdf8',
          secondary_accent: '#fbbf24',
          mood_description: 'Midnight indigo slate with cool mist line work and solitary amber lamplight',
        },
        layers: [
          {
            id: 'foundation',
            phase: 'sketch',
            label: 'Architectural Skyline Silhouette & Asphalt',
            paths: [
              `M 40,340 L 140,340 L 140,290 L 190,290 L 190,340 L 270,340 L 270,265 L 320,265 L 320,340 L 580,340 L 580,275 L 630,275 L 630,340 L 710,340 L 710,295 L 760,295 L 760,340 L 860,340`,
              `M 40,340 L 860,340`,
            ],
            stroke: 'line',
            strokeWidth: 2.0,
            opacity: 0.7,
          },
          {
            id: 'structure',
            phase: 'structure',
            label: 'Slanted Vertical Rain Striations',
            paths: [
              `M 110,50 L 70,240`,
              `M 210,40 L 170,230`,
              `M 330,55 L 290,245`,
              `M 470,40 L 430,230`,
              `M 590,50 L 550,240`,
              `M 710,45 L 670,235`,
              `M 810,60 L 770,250`,
            ],
            stroke: 'accent',
            strokeWidth: 1.6,
            opacity: 0.65,
          },
          {
            id: 'metaphor',
            phase: 'metaphor',
            label: 'Inverted Umbrella Arc & Streetlight',
            paths: [
              `M ${lampX},340 L ${lampX},155 C ${lampX},125 ${lampX + 30},125 ${lampX + 35},140`,
              `M 380,215 C 410,175 490,175 520,215 C 500,205 470,220 450,210 C 430,220 400,205 380,215`,
              `M 450,210 L 450,265 C 450,280 435,280 435,270`,
            ],
            stroke: 'line',
            strokeWidth: 2.4,
            opacity: 0.95,
          },
          {
            id: 'accent',
            phase: 'accent',
            label: 'Concentric Pavement Reflection Ripples',
            paths: [
              `M 410,365 A 45,12 0 1,0 490,365 A 45,12 0 1,0 410,365`,
              `M 370,375 A 85,20 0 1,0 530,375 A 85,20 0 1,0 370,375`,
            ],
            stroke: 'accent',
            strokeWidth: 1.8,
            opacity: 0.85,
            nodes: [
              { x: lampX + 35, y: 140, r: 5 },
              { x: 450, y: 210, r: 4 },
            ],
          },
        ],
      };
    }

    case STRATEGY_IDS.ROMANTIC_FLAME: {
      const touchY = Math.round(65 + v(4) * 15);
      return {
        strategyId,
        strategyName: 'Romantic Flame & Sacred Devotion',
        emotional_theme: `Sacred devotion, intense romantic yearning, and poignant vulnerability in "${title}"`,
        central_metaphor: 'Two ethereal continuous silhouettes entwined like silk ribbons woven through sacred flame',
        supporting_symbols: ['blooming lotus petals', 'dual flame contours', 'silk ribbon coil', 'sacred aura halo'],
        color_palette: {
          background: '#150a0e',
          line_color: '#fef08a',
          accent_color: '#f43f5e',
          secondary_accent: '#fb923c',
          mood_description: 'Deep crimson velvet with sacred saffron and radiant amber line work',
        },
        layers: [
          {
            id: 'foundation',
            phase: 'sketch',
            label: 'Sacred Blooming Lotus Petals',
            paths: [
              `M 350,360 C 370,315 420,295 450,315 C 480,295 530,315 550,360 C 510,360 480,345 450,355 C 420,345 390,360 350,360 Z`,
              `M 320,355 C 340,295 390,285 410,310`,
              `M 580,355 C 560,295 510,285 490,310`,
            ],
            stroke: 'accent',
            strokeWidth: 2.2,
            opacity: 0.85,
          },
          {
            id: 'structure',
            phase: 'structure',
            label: 'Dual Rising Flame Silhouettes',
            paths: [
              `M 380,310 C 345,255 355,195 395,155 C 415,125 425,95 440,${touchY}`,
              `M 520,310 C 555,255 545,195 505,155 C 485,125 475,95 460,${touchY}`,
              `M 440,${touchY} C 445,${touchY - 10} 455,${touchY - 10} 460,${touchY}`,
            ],
            stroke: 'line',
            strokeWidth: 2.8,
            opacity: 0.95,
          },
          {
            id: 'metaphor',
            phase: 'metaphor',
            label: 'Intertwining Silk Ribbon Coil',
            paths: [
              `M 390,240 C 450,270 510,220 460,190 C 410,160 475,130 450,105`,
            ],
            stroke: 'secondary',
            strokeWidth: 2.4,
            opacity: 0.9,
          },
          {
            id: 'accent',
            phase: 'accent',
            label: 'Radiant Aura Halo & Drifting Embers',
            paths: [
              `M 380,160 A 70,70 0 1,1 520,160 A 70,70 0 1,1 380,160`,
            ],
            stroke: 'accent',
            strokeWidth: 1.6,
            opacity: 0.75,
            nodes: [
              { x: 450, y: touchY - 15, r: 5 },
              { x: 380, y: 110, r: 4 },
              { x: 520, y: 110, r: 4 },
              { x: 410, y: 190, r: 3 },
              { x: 490, y: 190, r: 3 },
            ],
          },
        ],
      };
    }

    case STRATEGY_IDS.GEOMETRIC_KINETIC:
    default: {
      return {
        strategyId: STRATEGY_IDS.GEOMETRIC_KINETIC,
        strategyName: 'Geometric Kinetic & Syncopated Groove',
        emotional_theme: `Sensory tension, pulsed basslines, and syncopated kinetic momentum in "${title}"`,
        central_metaphor: 'A spiraling neon acoustic vector cutting through shadows with razor-sharp syncopated cadence',
        supporting_symbols: ['isometric coordinate grid', 'stepped rhythm bars', 'kinetic acoustic vector', 'cadence nodes'],
        color_palette: {
          background: '#120b18',
          line_color: '#f472b6',
          accent_color: '#a855f7',
          secondary_accent: '#38bdf8',
          mood_description: 'Electric violet neon with magenta cadence and deep nocturnal bass',
        },
        layers: [
          {
            id: 'foundation',
            phase: 'sketch',
            label: 'Isometric Ground Coordinate Plane',
            paths: [
              `M 150,380 L 450,285 L 750,380 L 450,438 Z`,
              `M 300,332 L 600,409`,
              `M 600,332 L 300,409`,
              `M 450,285 L 450,438`,
            ],
            stroke: 'secondary',
            strokeWidth: 1.8,
            opacity: 0.7,
          },
          {
            id: 'structure',
            phase: 'structure',
            label: 'Stepped Syncopated Rhythm Bars',
            paths: [
              `M 220,335 L 220,225 L 260,210 L 260,320`,
              `M 340,290 L 340,155 L 380,140 L 380,275`,
              `M 460,280 L 460,115 L 500,100 L 500,265`,
              `M 580,320 L 580,185 L 620,170 L 620,305`,
            ],
            stroke: 'line',
            strokeWidth: 2.2,
            opacity: 0.9,
          },
          {
            id: 'metaphor',
            phase: 'metaphor',
            label: 'Kinetic Acoustic Ribbon Vector',
            paths: [
              `M 90,265 L 260,210 L 380,140 L 460,205 L 580,125 L 710,195 L 820,155`,
            ],
            stroke: 'accent',
            strokeWidth: 3.2,
            opacity: 0.95,
          },
          {
            id: 'accent',
            phase: 'accent',
            label: 'Cadence Intersection Nodes & Chevron Pulse',
            paths: [
              `M 430,90 L 450,75 L 470,90`,
              `M 430,70 L 450,55 L 470,70`,
            ],
            stroke: 'secondary',
            strokeWidth: 2.0,
            opacity: 0.85,
            nodes: [
              { x: 260, y: 210, r: 5 },
              { x: 380, y: 140, r: 6 },
              { x: 460, y: 205, r: 5 },
              { x: 580, y: 125, r: 6 },
              { x: 450, y: 55, r: 4 },
            ],
          },
        ],
      };
    }
  }
}

/**
 * Backward compatibility aliases
 */
export function interpretSongForArt(title = '', artist = '', lyrics = '') {
  const comp = getCompositionForSong(title, artist, lyrics);
  return {
    emotional_theme: comp.emotional_theme,
    central_metaphor: comp.central_metaphor,
    main_visual_subject: comp.layers[1]?.label || comp.strategyName,
    supporting_symbols: comp.supporting_symbols,
    color_palette: comp.color_palette,
    line_type: comp.strategyId,
  };
}

export function generateProceduralCurve(title = '', artist = '') {
  const comp = getCompositionForSong(title, artist);
  const mainLayer = comp.layers[2] || comp.layers[1];
  return {
    pathD: mainLayer.paths[0] || 'M 60,220 C 140,140 220,320 320,250 C 420,180 480,310 580,220 C 680,130 730,290 820,210',
    nodes: comp.layers[3]?.nodes || [{ x: 450, y: 220, r: 5 }],
  };
}
