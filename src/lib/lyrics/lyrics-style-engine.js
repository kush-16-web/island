/**
 * lyrics-style-engine.js
 * Lightweight, deterministic lyrics presentation layer for Island.
 * 
 * Supported Styles:
 * - 'classic': Original clean synchronized lyrics (default). Zero decoration.
 * - 'kinetic': Occasional meaning-aware typography effects (isolation, fade, fracture, fall, stretch, tremble, soft-pulse, weight-shift) without emojis or decorative icons.
 * 
 * Rules:
 * - Deterministic: Same song produces stable, identical selections across sessions.
 * - Restrained: Sparse decoration; at most 1 kinetic line per 5-8 lines; non-consecutive.
 * - Safe: Never alters underlying lyric strings, timestamps, or synchronization.
 * - Accessible: Respects prefers-reduced-motion; keeps screen reader text clean.
 * - Zero API calls: Purely local lexical heuristics + hash distribution.
 */

export const LYRICS_STYLES = {
  CLASSIC: 'classic',
  KINETIC: 'kinetic',
};

export const LYRICS_LAYOUTS = {
  FLOATING: 'floating',
  NORMAL: 'normal',
};

const STORAGE_KEY = 'island_lyrics_style';
const LAYOUT_STORAGE_KEY = 'island_lyrics_layout';

export function getLyricsStyle() {
  if (typeof window === 'undefined') return LYRICS_STYLES.CLASSIC;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === LYRICS_STYLES.KINETIC) {
      return LYRICS_STYLES.KINETIC;
    }
    if (saved === LYRICS_STYLES.CLASSIC) {
      return LYRICS_STYLES.CLASSIC;
    }
    // Migration: Legacy 'expressive' or any unrecognized value migrates to 'classic' and persists
    if (saved === 'expressive' || saved != null) {
      localStorage.setItem(STORAGE_KEY, LYRICS_STYLES.CLASSIC);
      return LYRICS_STYLES.CLASSIC;
    }
  } catch {}
  return LYRICS_STYLES.CLASSIC;
}

export function setLyricsStyle(style) {
  if (typeof window === 'undefined') return;
  try {
    const valid = style === LYRICS_STYLES.KINETIC ? LYRICS_STYLES.KINETIC : LYRICS_STYLES.CLASSIC;
    localStorage.setItem(STORAGE_KEY, valid);
  } catch {}
}

export function getLyricsLayout() {
  if (typeof window === 'undefined') return LYRICS_LAYOUTS.FLOATING;
  try {
    const saved = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (saved === LYRICS_LAYOUTS.NORMAL) return LYRICS_LAYOUTS.NORMAL;
    if (saved === LYRICS_LAYOUTS.FLOATING) return LYRICS_LAYOUTS.FLOATING;
  } catch {}
  return LYRICS_LAYOUTS.FLOATING;
}

export function setLyricsLayout(layout) {
  if (typeof window === 'undefined') return;
  try {
    const valid = layout === LYRICS_LAYOUTS.NORMAL ? LYRICS_LAYOUTS.NORMAL : LYRICS_LAYOUTS.FLOATING;
    localStorage.setItem(LAYOUT_STORAGE_KEY, valid);
  } catch {}
}

/**
 * Fast deterministic string hash (djb2 variant)
 */
export function hashString(str = '') {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) + str.charCodeAt(i);
  }
  return Math.abs(h | 0);
}

// Approved kinetic typography effect vocabulary
export const KINETIC_EFFECTS = [
  'isolation',
  'fade',
  'fracture',
  'fall',
  'stretch',
  'tremble',
  'soft-pulse',
  'weight-shift',
];

/**
 * Meaning-aware emotional concept definitions
 * Used to target the specific word carrying emotional weight, not arbitrary or longest words.
 */
export const SEMANTIC_CONCEPTS = [
  {
    effect: 'isolation',
    label: 'Loneliness / separation',
    // Prioritize specific contextual phrases first, then single meaningful words
    phrases: [
      { pattern: /\b(spend\s+some\s+time\s+)?(alone)\b/i, targetWord: 'alone', score: 95 },
      { pattern: /\b(all\s+)?(alone)\b/i, targetWord: 'alone', score: 90 },
      { pattern: /\b(left\s+)?(alone)\b/i, targetWord: 'alone', score: 90 },
      { pattern: /\b(on\s+my\s+own)\b/i, targetWord: 'own', score: 85 },
      { pattern: /\b(lonely|loneliness)\b/i, score: 85 },
      { pattern: /\b(isolated|isolation)\b/i, score: 85 },
      { pattern: /\b(solitude|deserted|abandoned|forsaken)\b/i, score: 80 },
    ],
    negation: /\b(not\s+alone|never\s+alone|together|with\s+you)\b/i,
  },
  {
    effect: 'fade',
    label: 'Loss / disappearance',
    phrases: [
      { pattern: /\b(slowly\s+)?(fade(\s+out)?|fading|faded)\b/i, targetWord: 'fade', score: 92 },
      { pattern: /\b(disappear(ed|ing)?)\b/i, score: 88 },
      { pattern: /\b(vanish(ed|ing)?)\b/i, score: 88 },
      { pattern: /\b(gone)\b/i, score: 80 },
      { pattern: /\b(ghosts?|shadows?)\b/i, score: 80 },
      { pattern: /\b(drifting|memories|forgotten)\b/i, score: 75 },
    ],
    negation: /\b(never\s+fade|won'?t\s+fade|not\s+lost|not\s+gone|found)\b/i,
  },
  {
    effect: 'fracture',
    label: 'Breaking / shattering',
    phrases: [
      { pattern: /\b(shatter(ed|ing)?)\b/i, score: 95 },
      { pattern: /\b(fractur(e|ed|ing)?)\b/i, score: 92 },
      { pattern: /\b(break(ing)?\s+apart)\b/i, targetWord: 'break', score: 90 },
      { pattern: /\b(shattered\s+into\s+pieces)\b/i, targetWord: 'shattered', score: 95 },
      { pattern: /\b(crack(ed|ing)?|split(ting)?)\b/i, score: 85 },
      { pattern: /\b(broke(n)?|break(ing)?)\b/i, score: 82 },
      { pattern: /\b(pieces|torn|apart)\b/i, score: 75 },
    ],
    negation: /\b(unbreakable|never\s+break|not\s+broken|heal|fix|whole)\b/i,
  },
  {
    effect: 'fall',
    label: 'Falling / sinking',
    phrases: [
      { pattern: /\b(fall(ing)?\s+away)\b/i, targetWord: 'fall', score: 92 },
      { pattern: /\b(sink(ing)?\s+down)\b/i, targetWord: 'sink', score: 90 },
      { pattern: /\b(fall(en|ing)?|fell)\b/i, score: 85 },
      { pattern: /\b(sink(ing)?|sank|sunk)\b/i, score: 85 },
      { pattern: /\b(drown(ing|ed)?|plummet(ed|ing)?|crumbl(e|ed|ing)?)\b/i, score: 82 },
      { pattern: /\b(downward|ground)\b/i, score: 72 },
    ],
    negation: /\b(never\s+fall|won'?t\s+fall|rise|flying|standing\s+tall)\b/i,
  },
  {
    effect: 'stretch',
    label: 'Distance / longing',
    phrases: [
      { pattern: /\b(far\s+away)\b/i, targetWord: 'away', score: 90 },
      { pattern: /\b(miles\s+away)\b/i, targetWord: 'miles', score: 88 },
      { pattern: /\b(distance|distant)\b/i, score: 85 },
      { pattern: /\b(endless|forever)\b/i, score: 82 },
      { pattern: /\b(longing|yearning)\b/i, score: 82 },
      { pattern: /\b(stretch(ed|ing)?|horizon)\b/i, score: 78 },
      { pattern: /\b(slowly)\b/i, score: 70 },
    ],
    negation: /\b(near|close|right\s+here|beside\s+me)\b/i,
  },
  {
    effect: 'tremble',
    label: 'Fear / uncertainty',
    phrases: [
      { pattern: /\b(trembl(e|ed|ing)?)\b/i, score: 92 },
      { pattern: /\b(shak(e|ing|y)?|shiver(s|ed|ing)?)\b/i, score: 88 },
      { pattern: /\b(afraid|fear(ful)?|scared)\b/i, score: 85 },
      { pattern: /\b(hesitat(e|ed|ing)?|anxious|doubt(ing)?)\b/i, score: 80 },
    ],
    negation: /\b(no\s+fear|unafraid|not\s+scared|fearless|brave)\b/i,
  },
  {
    effect: 'soft-pulse',
    label: 'Urgency / intensity',
    phrases: [
      { pattern: /\b(heartbeat|pulse)\b/i, score: 90 },
      { pattern: /\b(alive)\b/i, score: 85 },
      { pattern: /\b(racing|rush(ing)?)\b/i, score: 82 },
      { pattern: /\b(burn(ing)?|ignit(e|ed|ing)?)\b/i, score: 80 },
      { pattern: /\b(breath(e|ing)?|fever|spark)\b/i, score: 75 },
    ],
    negation: /\b(no\s+pulse|dead|cold|still|numb)\b/i,
  },
  {
    effect: 'weight-shift',
    label: 'Weight / pressure',
    phrases: [
      { pattern: /\b(heavy\s+(weight|burden|load))\b/i, targetWord: 'heavy', score: 92 },
      { pattern: /\b(crush(ing|ed)?)\b/i, score: 88 },
      { pattern: /\b(burden|pressure)\b/i, score: 85 },
      { pattern: /\b(heavy|weight)\b/i, score: 80 },
      { pattern: /\b(deep\s+down)\b/i, targetWord: 'deep', score: 75 },
    ],
    negation: /\b(weightless|light|easy|feather)\b/i,
  },
];

// Disallowed trivial words that should never receive isolated kinetic emphasis
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
  'by', 'from', 'up', 'down', 'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'can', 'could', 'should', 'would', 'will',
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
  'my', 'your', 'his', 'its', 'our', 'their', 'this', 'that', 'these', 'those',
  'spend', 'some', 'time', 'just', 'now', 'then', 'here', 'there',
]);

/**
 * Finds the single most emotionally meaningful target word/phrase in a lyric line.
 * Returns null if confidence is insufficient.
 */
export function findMeaningfulKineticTarget(rawLine = '') {
  if (!rawLine || typeof rawLine !== 'string') return null;
  const trimmed = rawLine.trim();
  if (!trimmed) return null;

  const candidates = [];

  for (const concept of SEMANTIC_CONCEPTS) {
    if (concept.negation && concept.negation.test(trimmed)) {
      continue;
    }

    for (const phraseDef of concept.phrases) {
      const match = trimmed.match(phraseDef.pattern);
      if (match && match.index != null) {
        // Resolve exact target word
        let wordToHighlight = phraseDef.targetWord;
        if (!wordToHighlight) {
          // If match has capture group 2, use it; otherwise use group 1 or full match
          wordToHighlight = match[2] || match[1] || match[0];
        }

        // Clean target word for lookup
        const cleanWord = wordToHighlight.trim().replace(/^[^\w]+|[^\w]+$/g, '');
        if (!cleanWord || STOP_WORDS.has(cleanWord.toLowerCase())) {
          continue;
        }

        // Locate exact start and end indices in rawLine to preserve exact character cases
        const regex = new RegExp(`\\b${cleanWord}\\b`, 'i');
        const exactMatch = rawLine.match(regex);
        if (exactMatch && exactMatch.index != null) {
          const startIndex = exactMatch.index;
          const matchedOriginalText = rawLine.slice(startIndex, startIndex + cleanWord.length);

          candidates.push({
            effect: concept.effect,
            targetWord: matchedOriginalText,
            startIndex,
            endIndex: startIndex + matchedOriginalText.length,
            score: phraseDef.score || 70,
          });
        }
      }
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  // Rank by semantic relevance score
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0];
}

// In-memory cache for line presentation plans per track
const presentationCache = new Map();

/**
 * Analyze all lines for a track and return deterministic presentation metadata.
 * Exactly two supported modes: Classic and Kinetic.
 */
export function getTrackLyricsPresentation(lines = [], trackSeed = '', style = LYRICS_STYLES.CLASSIC) {
  if (!lines || lines.length === 0 || style !== LYRICS_STYLES.KINETIC) {
    return lines.map(() => ({ style: LYRICS_STYLES.CLASSIC }));
  }

  const cacheKey = `${trackSeed}::${style}::${lines.length}`;
  if (presentationCache.has(cacheKey)) {
    return presentationCache.get(cacheKey);
  }

  const trackHash = hashString(trackSeed || 'default-track');
  const total = lines.length;
  const result = [];

  // Kinetic rules:
  // - Sparse frequency: approximately 1 in 5-8 lines; minimum distance 5 lines.
  // - Total kinetic lines capped conservatively: max 3-4 lines per full song.
  // - Rare horizontal curvature: maximum 10-15% of eligible lines, never stacked with word effect.
  let lastKineticLine = -99;
  let lastKineticEffect = null;
  let kineticCount = 0;
  const maxKinetic = Math.min(4, Math.max(1, Math.floor(total / 7)));

  let lastCurvedLine = -99;

  for (let idx = 0; idx < total; idx++) {
    const lineText = lines[idx]?.text || '';
    let chosenTarget = null;

    // Check if line is eligible for kinetic typography emphasis
    if (idx - lastKineticLine >= 5 && kineticCount < maxKinetic) {
      const lineTarget = findMeaningfulKineticTarget(lineText);
      if (lineTarget) {
        // Avoid repeating the exact same effect consecutively when possible
        if (lineTarget.effect !== lastKineticEffect || idx - lastKineticLine >= 8) {
          chosenTarget = lineTarget;
          lastKineticLine = idx;
          lastKineticEffect = lineTarget.effect;
          kineticCount++;
        }
      }
    }

    if (chosenTarget) {
      // Primary word effect active: Never stack horizontal curve
      result.push({
        style: LYRICS_STYLES.KINETIC,
        kineticEffect: chosenTarget.effect,
        targetWord: chosenTarget.targetWord,
        startIndex: chosenTarget.startIndex,
        endIndex: chosenTarget.endIndex,
        isCurved: false,
      });
    } else {
      // Small minority of eligible long lines get subtle curvature (max ~10-15%)
      const isLongEnough = lineText.trim().length > 36;
      const curveHash = (trackHash + idx * 79) % 100;
      let isCurved = false;

      if (isLongEnough && curveHash < 14 && idx - lastCurvedLine >= 6) {
        isCurved = true;
        lastCurvedLine = idx;
      }

      result.push({
        style: LYRICS_STYLES.KINETIC,
        isCurved,
      });
    }
  }

  // Prevent cache from growing indefinitely
  if (presentationCache.size > 100) {
    const firstKey = presentationCache.keys().next().value;
    presentationCache.delete(firstKey);
  }

  presentationCache.set(cacheKey, result);
  return result;
}

/**
 * Get presentation metadata for a single lyric line.
 */
export function getLinePresentation(line, index, totalLines, trackSeed, style = LYRICS_STYLES.CLASSIC) {
  if (!line || style !== LYRICS_STYLES.KINETIC) {
    return { style: LYRICS_STYLES.CLASSIC };
  }

  // Check prefers-reduced-motion
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
    return { style: LYRICS_STYLES.CLASSIC };
  }

  const allMeta = getTrackLyricsPresentation(
    Array.from({ length: totalLines }, (_, i) => (i === index ? line : { text: '' })),
    trackSeed,
    style
  );

  return allMeta[index] || { style: LYRICS_STYLES.KINETIC };
}

export const getLyricsPresentationForLine = getLinePresentation;

export function resolveLyricsMode(mode) {
  if (mode === 'off' || mode === 'precision' || mode === 'full') {
    return mode;
  }
  return 'precision';
}
