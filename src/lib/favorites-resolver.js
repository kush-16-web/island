/**
 * favorites-resolver.js: High-precision favorites matching engine for Island.
 *
 * Requirements (PASS 2 - PART C & D):
 * 1. Normalized matching against actual user saved favorites library:
 *    - Exact normalized title
 *    - Explicit artist matching
 *    - Combined title & artist matching
 *    - Token overlap & Levenshtein distance for resilient speech recognition
 * 2. Speech & Whisper Normalization:
 *    - Normalizes common Whisper mis-transcriptions ("the weekend" -> "the weeknd")
 *    - Strips punctuation, apostrophes, and Unicode diacritics
 * 3. Ambiguity Detection:
 *    - Detects multiple close candidates (e.g. original vs remix, or same title different artist)
 *    - Returns candidates for clarification without guessing
 * 4. Temporal Matching:
 *    - "Play the song I just liked" / "recently liked" returns the most recently added favorite (highest addedAt)
 * 5. Random/Shuffle Matching:
 *    - "Play something from my favorites" selects a random valid playable favorite
 * 6. Provider Verification:
 *    - Preserves and respects real stored provider (YouTube Music vs Apple Music vs Spotify)
 */

import { normalizeText, stringSimilarity } from './music-actions.js';
import { getAllFavorites, SUPPORTED_PROVIDERS } from './favorites.js';
import { musicContext } from './music-conversation-context.js';

// Common phonetic and orthographic Whisper replacements for music queries
const WHISPER_NORMALIZATIONS = [
  [/\bthe\s+weekend\b/gi, 'the weeknd'],
  [/\bdied\s+for\s+you\b/gi, 'die for you'],
  [/\bstar\s+boy\b/gi, 'starboy'],
  [/\bblinding\s+light\b/gi, 'blinding lights'],
  [/\bsao\s+paolo\b/gi, 'sao paulo'],
];

export function cleanSpokenQuery(text) {
  if (!text || typeof text !== 'string') return '';
  let cleaned = text.trim();
  for (const [pattern, replacement] of WHISPER_NORMALIZATIONS) {
    cleaned = cleaned.replace(pattern, replacement);
  }
  return cleaned;
}

/**
 * Score a favorite item against a spoken query, title, optional artist, and language hint.
 */
export function scoreFavoriteCandidate(favorite, queryTitle, queryArtist = '', languageHint = null) {
  if (!favorite || !favorite.title) return 0;

  const favTitle = normalizeText(favorite.title);
  const favArtist = normalizeText(favorite.artist || '');
  const cleanQTitle = normalizeText(queryTitle);
  const cleanQArtist = normalizeText(queryArtist);

  // 1. Exact match bonus
  if (cleanQArtist) {
    if (favTitle === cleanQTitle && favArtist === cleanQArtist) {
      return 1.0;
    }
    if (favTitle === cleanQTitle && favArtist.includes(cleanQArtist)) {
      return 0.98;
    }
  } else if (favTitle === cleanQTitle) {
    return 0.95;
  }

  // 2. Title similarity
  let titleSim = stringSimilarity(cleanQTitle, favTitle);

  // Check for common transliterated Hindi / phonetic variations (e.g. "tuu" vs "tu")
  if (cleanQTitle.replace(/u+/g, 'u') === favTitle.replace(/u+/g, 'u')) {
    titleSim = Math.max(titleSim, 0.92);
  }
  if (cleanQTitle.replace(/e+/g, 'e') === favTitle.replace(/e+/g, 'e')) {
    titleSim = Math.max(titleSim, 0.92);
  }
  if (cleanQTitle.replace(/a+/g, 'a') === favTitle.replace(/a+/g, 'a')) {
    titleSim = Math.max(titleSim, 0.92);
  }

  // 3. Language hint boost: If user mentions "Hindi", boost Indian / Hindi titles or artists
  if (languageHint && (languageHint === 'hindi' || languageHint === 'hinglish' || languageHint === 'punjabi')) {
    const isIndianArtist = /arijit|pritam|atif|shreya|ar\s+rahman|diljit|badshah|honey|neha|jubin|sidhu|vishal|shekhar|amit|trivedi|salim|sulaiman/i.test(favArtist);
    if (isIndianArtist) {
      titleSim = Math.min(1.0, titleSim + 0.15);
    }
  }

  // 4. If explicit artist was provided, check artist match
  if (cleanQArtist) {
    const artistSim = stringSimilarity(cleanQArtist, favArtist);
    if (artistSim < 0.45 && !favArtist.includes(cleanQArtist) && !cleanQArtist.includes(favArtist)) {
      // Wrong artist penalty: prevent matching "Die For You by Joji" when user asked for "The Weeknd"
      return titleSim * 0.3;
    }
    return titleSim * 0.65 + artistSim * 0.35;
  }

  // 5. Combined query against title + artist
  const favCombined = `${favTitle} ${favArtist}`.trim();
  const combinedSim = stringSimilarity(cleanQTitle, favCombined);

  return Math.max(titleSim, combinedSim);
}

/**
 * Search the favorites library for a matching track.
 *
 * @param {object} params
 * @param {string} params.query - Spoken search string
 * @param {string} [params.title] - Extracted song title if parsed
 * @param {string} [params.artist] - Extracted artist name if parsed
 * @param {string} [params.languageHint] - Language hint if parsed (e.g. 'hindi')
 * @param {string} [params.provider] - Optional provider filter ('youtube' | 'spotify' | 'apple')
 * @param {boolean} [params.mostRecent] - If true, returns the most recently added favorite
 * @param {boolean} [params.random] - If true, picks a random playable favorite
 * @param {Storage|null} [params.storage] - Custom storage for testing
 * @returns {{ match: object|null, ambiguous: boolean, candidates: object[], reason?: string }}
 */
export function resolveFavoriteTrack({
  query = '',
  title = '',
  artist = '',
  languageHint = null,
  provider = null,
  mostRecent = false,
  random = false,
  storage = null,
} = {}) {
  let list = getAllFavorites(storage);

  if (!list || list.length === 0) {
    return { match: null, ambiguous: false, candidates: [], reason: 'empty_favorites' };
  }

  // Filter by provider if requested
  if (provider && Object.values(SUPPORTED_PROVIDERS).includes(provider)) {
    list = list.filter((f) => f.provider === provider);
    if (list.length === 0) {
      return { match: null, ambiguous: false, candidates: [], reason: 'no_provider_favorites' };
    }
  }

  // Case A: Most recently added favorite ("Play the song I just liked")
  if (mostRecent) {
    const sorted = [...list].sort((a, b) => (Number(b.addedAt) || 0) - (Number(a.addedAt) || 0));
    return { match: sorted[0], ambiguous: false, candidates: sorted.slice(0, 3) };
  }

  // Case B: Random / shuffle favorite ("Play something from my favorites")
  if (random || (!query && !title && !artist)) {
    const idx = Math.floor(Math.random() * list.length);
    return { match: list[idx], ambiguous: false, candidates: [list[idx]] };
  }

  // Case C: Target query matching
  let effectiveTitle = cleanSpokenQuery(title || query);
  let effectiveArtist = cleanSpokenQuery(artist);

  // Check if title is spelled out: "T-U-U" or "T U U" -> "tuu"
  const spelled = musicContext.normalizeSpelledLetters(effectiveTitle);
  if (spelled) {
    effectiveTitle = spelled;
  }

  // Check learned persistent aliases: e.g. user previously confirmed "two" means "Tuu"
  const aliasId = musicContext.getLearnedAlias(effectiveTitle, storage);
  if (aliasId) {
    const aliasMatch = list.find((f) => f.id === aliasId);
    if (aliasMatch) {
      return { match: aliasMatch, ambiguous: false, candidates: [aliasMatch] };
    }
  }

  if (!effectiveArtist && /\s+by\s+/i.test(effectiveTitle)) {
    const parts = effectiveTitle.split(/\s+by\s+/i);
    effectiveTitle = parts[0].trim();
    effectiveArtist = parts.slice(1).join(' by ').trim();
  }

  const scored = list
    .map((item) => ({
      track: item,
      score: scoreFavoriteCandidate(item, effectiveTitle, effectiveArtist, languageHint),
    }))
    .filter((item) => item.score >= 0.55)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return { match: null, ambiguous: false, candidates: [], reason: 'not_found' };
  }

  const best = scored[0];
  const second = scored[1];

  // Ambiguity check: If top two candidates are close in score and distinct songs
  if (second) {
    const bestNorm = `${normalizeText(best.track.title)}|${normalizeText(best.track.artist || '')}`;
    const secondNorm = `${normalizeText(second.track.title)}|${normalizeText(second.track.artist || '')}`;

    if (bestNorm !== secondNorm) {
      const scoreDiff = best.score - second.score;
      // Very close scores or same title by different artists
      if (scoreDiff <= 0.08 || (normalizeText(best.track.title) === normalizeText(second.track.title) && !effectiveArtist)) {
        return {
          match: null,
          ambiguous: true,
          candidates: scored.slice(0, 3).map((s) => s.track),
          reason: 'ambiguous_match',
        };
      }
    }
  }

  return {
    match: best.track,
    ambiguous: false,
    candidates: scored.slice(0, 3).map((s) => s.track),
  };
}

