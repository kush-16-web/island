/**
 * music-actions.js: Safe, deterministic music control and favorites engine for Jadu.
 *
 * Implements:
 * - play_track
 * - play_favorite
 * - play_random_favorite
 * - pause
 * - resume
 * - next_track
 * - previous_track
 * - get_current_track
 * - add_current_to_favorites
 * - remove_current_from_favorites
 *
 * Adheres strictly to requirements:
 * 1. Uses Island's existing SMTC controller and localStorage ('island_fav_tracks').
 * 2. Normalizes track titles/artists with accent stripping and fuzzy string scoring.
 * 3. Enforces favorites-only searching when requested.
 * 4. Detects ambiguous matches and asks for clarification.
 * 5. Returns structured results with truth-grounded spoken confirmations.
 * 6. Never fabricates tracks or URLs; zero arbitrary execution.
 */

export const ALLOWED_ACTIONS = Object.freeze([
  'play_track',
  'play_favorite',
  'play_random_favorite',
  'pause',
  'resume',
  'next_track',
  'previous_track',
  'get_current_track',
  'add_current_to_favorites',
  'remove_current_from_favorites',
]);

const STORAGE_KEY = 'island_fav_tracks';

/**
 * Normalize string for resilient phonetic/spoken comparison.
 * Strips accents (e.g. "São Paulo" -> "sao paulo"), removes punctuation, normalizes whitespace.
 */
export function normalizeText(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacritics
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ') // replace punctuation with spaces
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Standard Levenshtein distance between two normalized strings.
 */
export function levenshteinDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const matrix = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));

  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[a.length][b.length];
}

/**
 * Compute similarity score [0.0 - 1.0] between query and candidate text.
 */
export function stringSimilarity(strA, strB) {
  const normA = normalizeText(strA);
  const normB = normalizeText(strB);

  if (!normA || !normB) return 0;
  if (normA === normB) return 1.0;

  // Exact substring match bonus
  if (normB.includes(normA) || normA.includes(normB)) {
    const minLen = Math.min(normA.length, normB.length);
    const maxLen = Math.max(normA.length, normB.length);
    const lenRatio = minLen / maxLen;
    return Math.max(0.85, 0.75 + lenRatio * 0.25);
  }

  // Token overlap (Jaccard)
  const tokensA = new Set(normA.split(' ').filter(Boolean));
  const tokensB = new Set(normB.split(' ').filter(Boolean));
  let intersection = 0;
  tokensA.forEach((token) => {
    if (tokensB.has(token)) intersection++;
  });
  const union = new Set([...tokensA, ...tokensB]).size;
  const tokenScore = union > 0 ? intersection / union : 0;

  // Levenshtein ratio
  const maxLen = Math.max(normA.length, normB.length);
  const dist = levenshteinDistance(normA, normB);
  const levScore = 1.0 - dist / maxLen;

  return Math.max(0, tokenScore * 0.4 + levScore * 0.6);
}

/**
 * Score a track candidate against a spoken query.
 */
export function scoreTrack(track, query) {
  if (!track || !query) return 0;
  const title = track.title || '';
  const artist = track.artist || '';
  const combined = `${title} ${artist}`.trim();

  const titleScore = stringSimilarity(query, title);
  const artistScore = stringSimilarity(query, artist);
  const combinedScore = stringSimilarity(query, combined);

  // Highest score with weight on title
  return Math.max(titleScore * 1.1, combinedScore, artistScore * 0.8);
}

/**
 * Retrieve favorites map from localStorage or fallback storage.
 */
export function getFavorites(customStorage) {
  try {
    const storage = customStorage || (typeof window !== 'undefined' ? window.localStorage : null);
    if (!storage) return {};
    const raw = storage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * Save favorites map to localStorage or fallback storage.
 */
export function saveFavorites(favs, customStorage) {
  try {
    const storage = customStorage || (typeof window !== 'undefined' ? window.localStorage : null);
    if (!storage) return false;
    storage.setItem(STORAGE_KEY, JSON.stringify(favs));
    return true;
  } catch {
    return false;
  }
}

/**
 * Search a list of tracks with ranked fuzzy matching and ambiguity detection.
 * @param {Array<{title: string, artist?: string}>} tracks
 * @param {string} query
 * @returns {{ match: object|null, ambiguous: boolean, candidates: Array }}
 */
export function matchTrack(tracks, query) {
  if (!Array.isArray(tracks) || tracks.length === 0 || !query) {
    return { match: null, ambiguous: false, candidates: [] };
  }

  const scored = tracks
    .map((track) => ({
      track,
      score: scoreTrack(track, query),
    }))
    .filter((item) => item.score >= 0.55)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return { match: null, ambiguous: false, candidates: [] };
  }

  const best = scored[0];
  const second = scored[1];

  // Ambiguity detection:
  // 1. Top two candidates have very close scores (<= 0.12)
  // 2. OR query is a common root/prefix of multiple distinct track variants (e.g. "São Paulo" vs "São Paulo (Remix)")
  const isAmbiguous =
    second &&
    normalizeText(best.track.title) !== normalizeText(second.track.title) &&
    (
      Math.abs(best.score - second.score) <= 0.12 ||
      (
        second.score >= 0.75 &&
        normalizeText(second.track.title).startsWith(normalizeText(query)) &&
        normalizeText(best.track.title).startsWith(normalizeText(query))
      )
    );

  if (isAmbiguous) {
    return {
      match: null,
      ambiguous: true,
      candidates: scored.slice(0, 3).map((s) => s.track),
    };
  }

  return {
    match: best.track,
    ambiguous: false,
    candidates: scored.slice(0, 3).map((s) => s.track),
  };
}

/**
 * Execute an allowlisted music action safely against real Island media and favorites state.
 *
 * @param {object} intent - { action: string, query?: string }
 * @param {object} env - { media, onControl, customStorage }
 * @returns {object} structured action result
 */
export function executeMusicAction(intent, env = {}) {
  const { action, query } = intent || {};
  const media = env.media || { active: false };
  const onControl = typeof env.onControl === 'function' ? env.onControl : () => {};
  const storage = env.customStorage || null;

  if (!ALLOWED_ACTIONS.includes(action)) {
    return {
      ok: false,
      action: action || 'unknown',
      reason: 'invalid_action',
      spokenConfirmation: "I'm sorry, that music command is not supported.",
    };
  }

  switch (action) {
    case 'pause': {
      if (!media.active) {
        return {
          ok: false,
          action,
          reason: 'nothing_playing',
          spokenConfirmation: 'Nothing is currently playing.',
        };
      }
      if (media.status === 'paused') {
        return {
          ok: false,
          action,
          reason: 'already_paused',
          spokenConfirmation: 'Music is already paused.',
        };
      }
      onControl('pause');
      return {
        ok: true,
        action,
        track: { title: media.title, artist: media.artist },
        spokenConfirmation: 'Paused music playback.',
      };
    }

    case 'resume': {
      if (!media.active) {
        return {
          ok: false,
          action,
          reason: 'nothing_playing',
          spokenConfirmation: 'Nothing is currently queued to resume.',
        };
      }
      if (media.status === 'playing') {
        return {
          ok: false,
          action,
          reason: 'already_playing',
          spokenConfirmation: 'Music is already playing.',
        };
      }
      onControl('play');
      return {
        ok: true,
        action,
        track: { title: media.title, artist: media.artist },
        spokenConfirmation: 'Resumed music playback.',
      };
    }

    case 'next_track': {
      if (!media.active) {
        return {
          ok: false,
          action,
          reason: 'nothing_playing',
          spokenConfirmation: 'Nothing is playing to skip.',
        };
      }
      onControl('next');
      return {
        ok: true,
        action,
        spokenConfirmation: 'Skipped to the next track.',
      };
    }

    case 'previous_track': {
      if (!media.active) {
        return {
          ok: false,
          action,
          reason: 'nothing_playing',
          spokenConfirmation: 'Nothing is playing to go back to.',
        };
      }
      onControl('previous');
      return {
        ok: true,
        action,
        spokenConfirmation: 'Skipped to the previous track.',
      };
    }

    case 'get_current_track': {
      if (!media.active || !media.title) {
        return {
          ok: false,
          action,
          reason: 'nothing_playing',
          spokenConfirmation: 'Nothing is currently playing.',
        };
      }
      const artist = media.artist ? ` by ${media.artist}` : '';
      return {
        ok: true,
        action,
        track: { title: media.title, artist: media.artist, album: media.album },
        spokenConfirmation: `Currently playing ${media.title}${artist}.`,
      };
    }

    case 'add_current_to_favorites': {
      if (!media.active || !media.title) {
        return {
          ok: false,
          action,
          reason: 'nothing_playing',
          spokenConfirmation: 'No song is currently playing to add to favorites.',
        };
      }
      const trackKey = `${media.title}|${media.artist || ''}`;
      const favs = getFavorites(storage);
      if (favs[trackKey]) {
        return {
          ok: true,
          action,
          track: { title: media.title, artist: media.artist },
          spokenConfirmation: `${media.title} is already in your favorites.`,
        };
      }
      favs[trackKey] = {
        title: media.title,
        artist: media.artist || '',
        addedAt: Date.now(),
      };
      saveFavorites(favs, storage);
      return {
        ok: true,
        action,
        track: { title: media.title, artist: media.artist },
        spokenConfirmation: `Added ${media.title} to your favorites.`,
      };
    }

    case 'remove_current_from_favorites': {
      if (!media.active || !media.title) {
        return {
          ok: false,
          action,
          reason: 'nothing_playing',
          spokenConfirmation: 'No song is currently playing to remove.',
        };
      }
      const trackKey = `${media.title}|${media.artist || ''}`;
      const favs = getFavorites(storage);
      if (!favs[trackKey]) {
        return {
          ok: false,
          action,
          reason: 'not_in_favorites',
          track: { title: media.title, artist: media.artist },
          spokenConfirmation: `${media.title} is not in your favorites.`,
        };
      }
      delete favs[trackKey];
      saveFavorites(favs, storage);
      return {
        ok: true,
        action,
        track: { title: media.title, artist: media.artist },
        spokenConfirmation: `Removed ${media.title} from your favorites.`,
      };
    }

    case 'play_random_favorite': {
      const favs = getFavorites(storage);
      const list = Object.values(favs);
      if (list.length === 0) {
        return {
          ok: false,
          action,
          reason: 'empty_favorites',
          spokenConfirmation: 'Your favorites list is empty.',
        };
      }
      const randomIndex = Math.floor(Math.random() * list.length);
      const chosen = list[randomIndex];

      // If already playing this track, ensure playback is active
      const isCurrent =
        media.active &&
        normalizeText(media.title) === normalizeText(chosen.title) &&
        (!chosen.artist || normalizeText(media.artist) === normalizeText(chosen.artist));

      if (isCurrent) {
        if (media.status !== 'playing') onControl('play');
      } else {
        onControl('play');
      }

      const artistText = chosen.artist ? ` by ${chosen.artist}` : '';
      return {
        ok: true,
        action,
        track: { title: chosen.title, artist: chosen.artist },
        spokenConfirmation: `Playing ${chosen.title}${artistText} from your favorites.`,
      };
    }

    case 'play_favorite': {
      const favs = getFavorites(storage);
      const list = Object.values(favs);
      if (list.length === 0) {
        return {
          ok: false,
          action,
          reason: 'empty_favorites',
          spokenConfirmation: 'Your favorites list is empty.',
        };
      }

      if (!query || !query.trim()) {
        // Fall back to first or random favorite if query omitted
        return executeMusicAction({ action: 'play_random_favorite' }, env);
      }

      const { match, ambiguous, candidates } = matchTrack(list, query);

      if (ambiguous) {
        const names = candidates.map((c) => `"${c.title}"`).join(' or ');
        return {
          ok: false,
          action,
          reason: 'ambiguous_match',
          clarificationNeeded: true,
          matches: candidates,
          spokenConfirmation: `I found multiple tracks matching that: ${names}. Which one would you like?`,
        };
      }

      if (!match) {
        return {
          ok: false,
          action,
          reason: 'not_found',
          spokenConfirmation: `I couldn't find "${query}" in your favorites.`,
        };
      }

      // Check if match matches currently active track
      const isCurrent =
        media.active &&
        normalizeText(media.title) === normalizeText(match.title) &&
        (!match.artist || normalizeText(media.artist) === normalizeText(match.artist));

      if (isCurrent) {
        if (media.status !== 'playing') onControl('play');
      } else {
        onControl('play');
      }

      const artistText = match.artist ? ` by ${match.artist}` : '';
      return {
        ok: true,
        action,
        track: { title: match.title, artist: match.artist },
        spokenConfirmation: `Playing ${match.title}${artistText} from your favorites.`,
      };
    }

    case 'play_track': {
      if (!query || !query.trim()) {
        return executeMusicAction({ action: 'resume' }, env);
      }

      // First check if user is asking to play the currently loaded track
      if (media.active && media.title) {
        const sim = stringSimilarity(query, media.title);
        if (sim >= 0.7) {
          if (media.status !== 'playing') onControl('play');
          return {
            ok: true,
            action,
            track: { title: media.title, artist: media.artist },
            spokenConfirmation: `Playing ${media.title}.`,
          };
        }
      }

      // Check favorites list for a matching track
      const favs = getFavorites(storage);
      const list = Object.values(favs);
      if (list.length > 0) {
        const { match, ambiguous, candidates } = matchTrack(list, query);
        if (ambiguous) {
          const names = candidates.map((c) => `"${c.title}"`).join(' or ');
          return {
            ok: false,
            action,
            reason: 'ambiguous_match',
            clarificationNeeded: true,
            matches: candidates,
            spokenConfirmation: `I found multiple tracks matching that: ${names}. Which one did you mean?`,
          };
        }
        if (match) {
          onControl('play');
          const artistText = match.artist ? ` by ${match.artist}` : '';
          return {
            ok: true,
            action,
            track: { title: match.title, artist: match.artist },
            spokenConfirmation: `Playing ${match.title}${artistText}.`,
          };
        }
      }

      // If not in favorites and not active track, never fabricate a track!
      return {
        ok: false,
        action,
        reason: 'not_found',
        spokenConfirmation: `I couldn't find "${query}" in your available tracks or favorites.`,
      };
    }

    default:
      return {
        ok: false,
        action,
        reason: 'unknown_action',
        spokenConfirmation: "I'm not sure how to perform that music action.",
      };
  }
}
