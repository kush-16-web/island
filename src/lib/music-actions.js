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
import { audioCoordinator } from './audio-coordinator.js';

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
  'compound_pause_play',
  'set_volume',
]);

export const PLAYBACK_STATES = Object.freeze({
  RESOLVING: 'resolving',
  OPENING_PROVIDER: 'opening_provider',
  WAITING_FOR_PLAYER: 'waiting_for_player',
  PLAYBACK_REQUESTED: 'playback_requested',
  CONFIRMED_PLAYING: 'confirmed_playing',
  AUTOPLAY_BLOCKED: 'autoplay_blocked',
  FAILED: 'failed',
});

/**
 * Format context-aware, concise final speech matching actual browser companion outcomes.
 * Adheres strictly to Pass 2.2.4 Section 4 specifications.
 */
export function formatActionOutcomeSpeech(outcome, trackTitle, extra = {}) {
  const title = trackTitle || 'the song';
  switch (outcome) {
    case 'confirmed_playing':
    case 'playing':
      return `Playing ${title}. Enjoy!`;

    case 'search_results_opened':
    case 'opened_provider':
    case 'navigated':
      if (extra.isUnresolved || extra.isSearch) {
        return `I've opened the results for ${title}.`;
      }
      return `${title} is open. Playback hasn't started yet.`;

    case 'autoplay_blocked':
      return `${title} is ready, but you'll need to press Play.`;

    case 'navigation_completed_but_not_playing':
    case 'waiting_for_player':
    case 'playback_pending':
      return `${title} is open. Playback hasn't started yet.`;

    case 'failed':
    case 'timed_out':
    case 'COMMAND_TIMEOUT':
    case 'COMMAND_FAILED':
    default:
      return `I couldn't open ${title} this time.`;
  }
}

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
  const cleanQ = query.replace(/\bby\b/gi, ' ').replace(/\s+/g, ' ').trim();

  const titleScore = stringSimilarity(query, title);
  const artistScore = stringSimilarity(query, artist);
  const combinedScore = stringSimilarity(query, combined);
  const cleanCombinedScore = stringSimilarity(cleanQ, combined);

  // Highest score with weight on title
  return Math.max(titleScore * 1.1, combinedScore, cleanCombinedScore, artistScore * 0.8);
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
  const { action, query, provider: explicitProvider, track, trackId } = intent || {};
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
  const companion = env.companion || (typeof window !== 'undefined' ? window.__islandCompanionState : null);
  const onDispatchCompanion =
    typeof env.onDispatchCompanion === 'function'
      ? env.onDispatchCompanion
      : (cmd) => {
          if (typeof window !== 'undefined' && window.island?.companion?.dispatchCommand) {
            return window.island.companion.dispatchCommand(cmd);
          }
          return null;
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
    case 'compound_pause_play': {
      // 1. Preserve intended order: Pause current playback source
      if (media.active && media.status !== 'paused') {
        onControl('pause');
      }
      // 2. Execute target playback action
      const playIntent = intent.playIntent || { action: 'play_favorite', track };
      const playRes = executeMusicAction(playIntent, env);
      const targetTitle = playRes.track?.title || track?.title || 'the song';
      const initialAck = `Pausing and opening ${targetTitle}.`;
      return {
        ...playRes,
        action: 'compound_pause_play',
        subActions: ['pause', playIntent.action],
        initialAcknowledgment: initialAck,
        spokenConfirmation: initialAck,
        isCompound: true,
      };
    }

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
      audioCoordinator.markExplicitPause();
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

    case 'set_volume': {
      let targetLevel = intent.level ?? intent.volume ?? 0.5;
      if (typeof targetLevel === 'string') {
        const match = targetLevel.match(/(\d+)/);
        if (match) targetLevel = parseInt(match[1], 10) / 100;
        else if (/down|lower/i.test(targetLevel)) targetLevel = Math.max(0.1, audioCoordinator.getUserVolume() - 0.2);
        else if (/up|higher/i.test(targetLevel)) targetLevel = Math.min(1.0, audioCoordinator.getUserVolume() + 0.2);
      }
      if (targetLevel > 1) {
        targetLevel = targetLevel / 100;
      }
      targetLevel = Math.max(0, Math.min(1, targetLevel));
      audioCoordinator.setUserVolume(targetLevel);
      if (typeof onDispatchCompanion === 'function') {
        try {
          onDispatchCompanion({ action: 'set_volume', level: targetLevel });
        } catch {}
      }
      const pct = Math.round(targetLevel * 100);
      const res = {
        ok: true,
        action,
        level: pct,
        spokenConfirmation: `Set music volume to ${pct}%.`,
      };
      logActionDiagnostic({ turnId, action, ok: true, level: pct });
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
      const added = addFavorite(media, storage, companion);
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
      // 1. If explicit resolved track was passed, use it directly (never discard identity!)
      if (track && track.title) {
        return handlePlaybackExecution(track, {
          action: 'play_favorite',
          media,
          companion,
          onControl,
          onOpenUrl,
          onDispatchCompanion,
          turnId,
        });
      }

      let list = getAllFavorites(storage);
      if (list.length === 0) {
        return {
          ok: false,
          action,
          reason: 'empty_favorites',
          spokenConfirmation: 'Your favorites list is empty.',
        };
      }

      // 2. If trackId was passed, resolve by unique ID
      if (trackId) {
        const found = list.find((f) => f.id === trackId);
        if (found) {
          return handlePlaybackExecution(found, {
            action: 'play_favorite',
            media,
            companion,
            onControl,
            onOpenUrl,
            onDispatchCompanion,
            turnId,
          });
        }
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
        companion,
        onControl,
        onOpenUrl,
        onDispatchCompanion,
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
            companion,
            onControl,
            onOpenUrl,
            onDispatchCompanion,
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
export function handlePlaybackExecution(
  track,
  {
    action = 'play_favorite',
    media = { active: false },
    companion = null,
    onControl = () => {},
    onOpenUrl = () => {},
    onDispatchCompanion = () => {},
    turnId = Date.now(),
  } = {}
) {
  if (!track || !track.title) {
    return {
      ok: false,
      action,
      reason: 'invalid_track',
      playbackState: PLAYBACK_STATES.FAILED,
      spokenConfirmation: "I couldn't identify that track.",
    };
  }

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
      status: 'resumed_current',
      playbackState: PLAYBACK_STATES.CONFIRMED_PLAYING,
      track: { title: track.title, artist: track.artist, provider: track.provider, id: track.id },
      spokenConfirmation: `Resuming ${track.title}${artistText}.`,
    };
    logActionDiagnostic({ turnId, action, ok: true, track: track.title, status: 'resumed_current' });
    return res;
  }

  // 2. Ambiguous / corrupted provider check
  // E.g. track was misclassified as Apple Music due to legacy iTunes artwork enrichment
  if (track.isAmbiguousSource || track.provider === 'unknown') {
    const res = {
      ok: false,
      action,
      reason: 'ambiguous_provider_source',
      playbackState: PLAYBACK_STATES.FAILED,
      track: { title: track.title, artist: track.artist, provider: track.provider },
      spokenConfirmation: `Found ${track.title} in your favorites, but its music source needs to be confirmed. Please select YouTube Music or Spotify in your Favorites menu.`,
    };
    logActionDiagnostic({
      turnId,
      action,
      ok: false,
      track: track.title,
      status: 'ambiguous_provider_source',
    });
    return res;
  }

  // 3. Apple Music provider check: Island has no authenticated remote playback API for Apple Music on Windows
  if (track.provider === SUPPORTED_PROVIDERS.APPLE) {
    const playableUrl = track.playableUrl || `https://music.apple.com/search?term=${encodeURIComponent(track.title + ' ' + (track.artist || ''))}`;
    if (typeof onOpenUrl === 'function') {
      onOpenUrl(playableUrl);
    }
    const res = {
      ok: false,
      action,
      reason: 'apple_music_manual_start_required',
      playbackState: PLAYBACK_STATES.OPENING_PROVIDER,
      track: { title: track.title, artist: track.artist, provider: track.provider },
      spokenConfirmation: `Found ${track.title} in your favorites and opened it in Apple Music, but automatic playback is not supported by Apple Music. Please start playback in Apple Music.`,
    };
    logActionDiagnostic({
      turnId,
      action,
      ok: false,
      track: track.title,
      status: 'apple_music_manual_start_required',
      provider: track.provider,
    });
    return res;
  }

  // 4. YouTube Music provider playback:
  if (track.provider === SUPPORTED_PROVIDERS.YOUTUBE) {
    const compState = companion || (typeof window !== 'undefined' ? window.__islandCompanionState : null);
    const isCompanionActive = compState && compState.connected && compState.isYtMusicActive;
    let targetVideoId = track.youtubeId || (typeof track.providerTrackId === 'string' && /^[a-zA-Z0-9_-]{11}$/.test(track.providerTrackId) ? track.providerTrackId : null);

    if (!targetVideoId && track.playableUrl) {
      try {
        const u = new URL(track.playableUrl);
        targetVideoId = u.searchParams.get('v') || (u.pathname.startsWith('/shorts/') ? u.pathname.split('/shorts/')[1] : null);
      } catch {}
    }

    // Case 4A: Companion is connected to YouTube Music
    if (isCompanionActive) {
      if (targetVideoId) {
        // Exact video ID available -> request exact playback in existing tab
        if (typeof onDispatchCompanion === 'function') {
          try {
            const p = onDispatchCompanion({
              action: 'play_track',
              videoId: targetVideoId,
              title: track.title,
              artist: track.artist,
            });
            if (p && typeof p.catch === 'function') {
              p.catch((err) => console.warn('[music-actions] onDispatchCompanion handled error:', err.message));
            }
          } catch (err) {
            console.warn('[music-actions] onDispatchCompanion synchronous error:', err.message);
          }
        }

        const res = {
          ok: true,
          action,
          track: { title: track.title, artist: track.artist, provider: track.provider, videoId: targetVideoId, id: track.id },
          status: 'playback_requested',
          playbackState: PLAYBACK_STATES.PLAYBACK_REQUESTED,
          initialAcknowledgment: `Opening ${track.title}.`,
          spokenConfirmation: `Opening ${track.title}.`,
          awaitingResult: true,
        };

        logActionDiagnostic({
          turnId,
          action,
          ok: true,
          track: track.title,
          status: 'playback_requested',
          provider: track.provider,
          videoId: targetVideoId,
        });

        return res;
      } else {
        // Unresolved video ID, but companion tab is open -> reuse existing tab rather than spawning a new tab!
        const searchUrl =
          track.playableUrl ||
          `https://music.youtube.com/search?q=${encodeURIComponent(track.title + ' ' + (track.artist || ''))}`;

        if (typeof onDispatchCompanion === 'function') {
          try {
            const p = onDispatchCompanion({
              action: 'play_track',
              url: searchUrl,
              query: `${track.title} ${track.artist || ''}`.trim(),
              title: track.title,
              artist: track.artist,
            });
            if (p && typeof p.catch === 'function') {
              p.catch((err) => console.warn('[music-actions] onDispatchCompanion search handled error:', err.message));
            }
          } catch (err) {
            console.warn('[music-actions] onDispatchCompanion search error:', err.message);
          }
        }

        const res = {
          ok: true,
          action,
          track: { title: track.title, artist: track.artist, provider: track.provider, isUnresolvedIdentity: true, id: track.id },
          status: 'opened_provider',
          subStatus: 'search_results_opened',
          playbackState: PLAYBACK_STATES.OPENING_PROVIDER,
          initialAcknowledgment: `Opening ${track.title}.`,
          spokenConfirmation: `Opening search for ${track.title} in your YouTube Music tab. Please select your version.`,
          awaitingResult: true,
          isUnresolved: true,
        };

        logActionDiagnostic({
          turnId,
          action,
          ok: true,
          track: track.title,
          status: 'opened_provider_existing_tab',
          provider: track.provider,
          url: searchUrl,
        });

        return res;
      }
    }

    // Case 4B: Exact videoId is available, but companion is not yet connected -> open exact watch URL
    const playableUrl = track.playableUrl || (
      targetVideoId
        ? `https://music.youtube.com/watch?v=${targetVideoId}`
        : `https://music.youtube.com/search?q=${encodeURIComponent(track.title + ' ' + (track.artist || ''))}`
    );

    if (typeof onOpenUrl === 'function') {
      onOpenUrl(playableUrl);
    }

    const res = {
      ok: true,
      action,
      track: { title: track.title, artist: track.artist, provider: track.provider, videoId: targetVideoId, id: track.id },
      status: 'opened_provider',
      subStatus: targetVideoId ? 'opened_provider' : 'search_results_opened',
      playbackState: PLAYBACK_STATES.OPENING_PROVIDER,
      initialAcknowledgment: `Opening ${track.title}.`,
      spokenConfirmation: `Opening ${track.title} in YouTube Music.`,
      awaitingResult: true,
      isUnresolved: !targetVideoId,
    };

    logActionDiagnostic({
      turnId,
      action,
      ok: true,
      track: track.title,
      status: 'opened_provider',
      provider: track.provider,
      url: playableUrl,
    });

    return res;
  }

  // 5. Spotify & generic providers:
  const playableUrl = track.playableUrl || (
    track.provider === SUPPORTED_PROVIDERS.SPOTIFY
      ? `spotify:search:${encodeURIComponent(track.title + ' ' + (track.artist || ''))}`
      : `https://music.youtube.com/search?q=${encodeURIComponent(track.title + ' ' + (track.artist || ''))}`
  );

  if (typeof onOpenUrl === 'function') {
    onOpenUrl(playableUrl);
  }

  const res = {
    ok: true,
    action,
    track: { title: track.title, artist: track.artist, provider: track.provider, id: track.id },
    status: 'opened_provider',
    playbackState: PLAYBACK_STATES.OPENING_PROVIDER,
    spokenConfirmation: `Opening ${track.title} in ${providerName}.`,
  };

  logActionDiagnostic({
    turnId,
    action,
    ok: true,
    track: track.title,
    status: 'opened_provider',
    provider: track.provider,
    url: playableUrl,
  });

  return res;
}

/**
 * Unified authoritative favorites player for both manual UI clicks and voice actions.
 * Guarantees zero discrepancy between clicking Play in Favorites and asking Jett/Nova.
 */
export function playFavoriteTrack(track, env = {}) {
  return handlePlaybackExecution(track, {
    action: 'play_favorite',
    media: env.media || { active: false },
    companion: env.companion || (typeof window !== 'undefined' ? window.__islandCompanionState : null),
    onControl: env.onControl || (() => {}),
    onOpenUrl: env.onOpenUrl || ((url) => (typeof window !== 'undefined' ? window.island?.media?.openUrl?.(url) : null)),
    onDispatchCompanion: env.onDispatchCompanion || ((cmd) => (typeof window !== 'undefined' ? window.island?.companion?.dispatchCommand?.(cmd) : null)),
    turnId: env.turnId || Date.now(),
  });
}
