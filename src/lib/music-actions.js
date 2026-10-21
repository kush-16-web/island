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
 * - show_favorites
 *
 * Grounded Execution Principles:
 * 1. Single authoritative store: Uses unified provider-aware favorites (src/lib/favorites.js).
 * 2. Multi-provider awareness: Distinguishes Spotify, YouTube Music, Apple Music, and Local sources.
 * 3. Never reports success on track switching unless verified or explicitly framed as opening the provider.
 * 4. Resolves the "Attention vs Pashmina" bug: Prevents sending generic SMTC play when switching songs.
 * 5. Structured diagnostics logged to window.__islandVoiceDiagnostics for auditability.
 */

import {
  getAllFavorites,
  addFavorite,
  removeFavorite,
  isTrackFavorite,
  SUPPORTED_PROVIDERS,
} from './favorites.js';

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
  'show_favorites',
]);

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
    .replace(/[^\p{L}\p{N}\s]/gu, ' ') // replace punctuation with spaces
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
 * Search a list of tracks with ranked fuzzy matching and ambiguity detection.
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
  // 2. OR query is a common prefix/root of multiple distinct tracks (e.g. "São Paulo" vs "São Paulo (Remix)")
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
 * Helper to display human-friendly provider names.
 */
export function getFriendlyProviderName(provider) {
  switch (provider) {
    case SUPPORTED_PROVIDERS.SPOTIFY:
      return 'Spotify';
    case SUPPORTED_PROVIDERS.YOUTUBE:
      return 'YouTube Music';
    case SUPPORTED_PROVIDERS.APPLE:
      return 'Apple Music';
    case SUPPORTED_PROVIDERS.LOCAL:
      return 'your Media Player';
    default:
      return 'your music player';
  }
}

/**
 * Log structured diagnostics for development auditability without leaking secrets.
 */
function logActionDiagnostic(record) {
  if (typeof window === 'undefined') return;
  if (!window.__islandVoiceDiagnostics) {
    window.__islandVoiceDiagnostics = [];
  }
  window.__islandVoiceDiagnostics.push({
    timestamp: new Date().toISOString(),
    ...record,
  });
  if (window.__islandVoiceDiagnostics.length > 25) {
    window.__islandVoiceDiagnostics.shift();
  }
}

/**
 * Execute an allowlisted music action safely against real Island media and unified favorites.
 *
 * @param {object} intent - { action: string, query?: string, provider?: string }
 * @param {object} env - { media, onControl, onOpenUrl, customStorage, turnId }
 * @returns {object} structured action result
 */
export function executeMusicAction(intent, env = {}) {
  const { action, query, provider: explicitProvider } = intent || {};
  const media = env.media || { active: false };
  const onControl = typeof env.onControl === 'function' ? env.onControl : () => {};
  const onOpenUrl =
    typeof env.onOpenUrl === 'function'
      ? env.onOpenUrl
      : (url) => {
          if (typeof window !== 'undefined' && window.island?.media?.openUrl) {
            window.island.media.openUrl(url);
          }
        };
  const storage = env.customStorage || null;
  const turnId = env.turnId || Date.now();

  if (!ALLOWED_ACTIONS.includes(action)) {
    const res = {
      ok: false,
      action: action || 'unknown',
      reason: 'invalid_action',
      spokenConfirmation: "I'm sorry, that music command is not supported.",
    };
    logActionDiagnostic({ turnId, action, ok: false, reason: 'invalid_action' });
    return res;
  }

  switch (action) {
    case 'show_favorites': {
      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(
          new CustomEvent('island:navigate', {
            detail: { tab: 'playing', viewMode: 'favorites' },
          })
        );
      }
      const list = getAllFavorites(storage);
      const count = list.length;
      const countMsg = count > 0 ? ` You have ${count} saved song${count === 1 ? '' : 's'}.` : ' Your list is currently empty.';
      const res = {
        ok: true,
        action,
        count,
        spokenConfirmation: `Opening your favorites.${countMsg}`,
      };
      logActionDiagnostic({ turnId, action, ok: true, count });
      return res;
    }

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
      const res = {
        ok: true,
        action,
        track: { title: media.title, artist: media.artist },
        spokenConfirmation: 'Paused music playback.',
      };
      logActionDiagnostic({ turnId, action, ok: true, track: media.title });
      return res;
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
      const res = {
        ok: true,
        action,
        track: { title: media.title, artist: media.artist },
        spokenConfirmation: 'Resumed music playback.',
      };
      logActionDiagnostic({ turnId, action, ok: true, track: media.title });
      return res;
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
        track: { title: media.title, artist: media.artist, album: media.album, app: media.app },
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
      if (isTrackFavorite(media, storage)) {
        return {
          ok: true,
          action,
          track: { title: media.title, artist: media.artist },
          spokenConfirmation: `${media.title} is already in your favorites.`,
        };
      }
      const added = addFavorite(media, storage);
      const res = {
        ok: true,
        action,
        track: { title: media.title, artist: media.artist, provider: added?.provider },
        spokenConfirmation: `Added ${media.title} to your favorites.`,
      };
      logActionDiagnostic({ turnId, action, ok: true, track: media.title });
      return res;
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
      if (!isTrackFavorite(media, storage)) {
        return {
          ok: false,
          action,
          reason: 'not_in_favorites',
          track: { title: media.title, artist: media.artist },
          spokenConfirmation: `${media.title} is not in your favorites.`,
        };
      }
      removeFavorite(media, storage);
      const res = {
        ok: true,
        action,
        track: { title: media.title, artist: media.artist },
        spokenConfirmation: `Removed ${media.title} from your favorites.`,
      };
      logActionDiagnostic({ turnId, action, ok: true, track: media.title });
      return res;
    }

    case 'play_random_favorite': {
      let list = getAllFavorites(storage);
      if (list.length === 0) {
        return {
          ok: false,
          action,
          reason: 'empty_favorites',
          spokenConfirmation: 'Your favorites list is empty.',
        };
      }

      // Check if user specifically requested a provider
      if (explicitProvider) {
        const filtered = list.filter((f) => f.provider === explicitProvider);
        if (filtered.length > 0) list = filtered;
      }

      const randomIndex = Math.floor(Math.random() * list.length);
      const chosen = list[randomIndex];

      return handlePlaybackExecution(chosen, {
        action: 'play_random_favorite',
        media,
        onControl,
        onOpenUrl,
        turnId,
      });
    }

    case 'play_favorite': {
      let list = getAllFavorites(storage);
      if (list.length === 0) {
        return {
          ok: false,
          action,
          reason: 'empty_favorites',
          spokenConfirmation: 'Your favorites list is empty.',
        };
      }

      // Parse provider filter if specified in query, e.g. "play my spotify favorites"
      let cleanQuery = query || '';
      let targetProvider = explicitProvider || null;

      if (/spotify/i.test(cleanQuery)) {
        targetProvider = SUPPORTED_PROVIDERS.SPOTIFY;
        cleanQuery = cleanQuery.replace(/spotify/gi, '').trim();
      } else if (/youtube/i.test(cleanQuery)) {
        targetProvider = SUPPORTED_PROVIDERS.YOUTUBE;
        cleanQuery = cleanQuery.replace(/youtube(\s+music)?/gi, '').trim();
      } else if (/apple(\s+music)?/i.test(cleanQuery)) {
        targetProvider = SUPPORTED_PROVIDERS.APPLE;
        cleanQuery = cleanQuery.replace(/apple(\s+music)?/gi, '').trim();
      }

      if (targetProvider) {
        const filtered = list.filter((f) => f.provider === targetProvider);
        if (filtered.length === 0) {
          return {
            ok: false,
            action,
            reason: 'no_provider_favorites',
            spokenConfirmation: `You don't have any songs from ${getFriendlyProviderName(targetProvider)} in your favorites.`,
          };
        }
        list = filtered;
      }

      // Strip conversational filler words: e.g. "play something from my favorites" -> ""
      // "play attention from my favorites" -> "attention"
      cleanQuery = cleanQuery
        .replace(/\b(play|something|from|my|favorites?|favs?|saved|songs?|tracks?)\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (!cleanQuery) {
        return executeMusicAction({ action: 'play_random_favorite', provider: targetProvider }, env);
      }

      const { match, ambiguous, candidates } = matchTrack(list, cleanQuery);

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
        logActionDiagnostic({ turnId, action, ok: false, reason: 'not_found', query: cleanQuery });
        return {
          ok: false,
          action,
          reason: 'not_found',
          spokenConfirmation: `I couldn't find "${cleanQuery}" in your favorites.`,
        };
      }

      return handlePlaybackExecution(match, {
        action: 'play_favorite',
        media,
        onControl,
        onOpenUrl,
        turnId,
      });
    }

    case 'play_track': {
      if (!query || !query.trim()) {
        return executeMusicAction({ action: 'resume' }, env);
      }

      // Check if user is asking to resume the currently active song
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

      // Check favorites list
      const list = getAllFavorites(storage);
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
          return handlePlaybackExecution(match, {
            action: 'play_track',
            media,
            onControl,
            onOpenUrl,
            turnId,
          });
        }
      }

      // Never fabricate tracks or playback URLs
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

/**
 * Handle playback execution with provider awareness and truth-grounded confirmation.
 * Resolves the "Attention vs Pashmina" bug where sending SMTC 'play' blindly resumed the wrong song.
 */
function handlePlaybackExecution(track, { action, media, onControl, onOpenUrl, turnId }) {
  const isCurrent =
    media.active &&
    normalizeText(media.title) === normalizeText(track.title) &&
    (!track.artist || normalizeText(media.artist) === normalizeText(track.artist));

  const artistText = track.artist ? ` by ${track.artist}` : '';
  const providerName = getFriendlyProviderName(track.provider);

  // 1. If the requested song is ALREADY the active song on SMTC, send SMTC play to resume it
  if (isCurrent) {
    if (media.status !== 'playing') {
      onControl('play');
    }
    const res = {
      ok: true,
      action,
      track: { title: track.title, artist: track.artist, provider: track.provider },
      spokenConfirmation: `Resuming ${track.title}${artistText}.`,
    };
    logActionDiagnostic({ turnId, action, ok: true, track: track.title, status: 'resumed_current' });
    return res;
  }

  // 2. The requested song is a DIFFERENT track than what's playing (e.g. Pashmina is active, user asked for Attention)
  // Check if we have a playable reference (e.g. spotify:search:... or youtube URL)
  if (track.playableUrl) {
    onOpenUrl(track.playableUrl);

    // Honest truth: We launched the playback command to the provider
    const res = {
      ok: true,
      action,
      track: { title: track.title, artist: track.artist, provider: track.provider },
      spokenConfirmation: `Opening ${track.title} in ${providerName}.`,
    };
    logActionDiagnostic({
      turnId,
      action,
      ok: true,
      track: track.title,
      status: 'opened_provider',
      provider: track.provider,
      url: track.playableUrl,
    });
    return res;
  }

  // 3. Fallback: If no playable URL or provider integration exists, do NOT falsely claim playback succeeded!
  const res = {
    ok: false,
    action,
    reason: 'unsupported_provider_playback',
    track: { title: track.title, artist: track.artist, provider: track.provider },
    spokenConfirmation: `Found ${track.title} in your favorites, but automatic switching is not supported by ${providerName}. Please select it in your Favorites menu.`,
  };
  logActionDiagnostic({
    turnId,
    action,
    ok: false,
    track: track.title,
    status: 'unsupported_provider_playback',
    provider: track.provider,
  });
  return res;
}
