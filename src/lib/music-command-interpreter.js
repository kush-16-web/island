/**
 * music-command-interpreter.js: High-confidence local music command parser for Jadu.
 *
 * Requirements (PASS 2 - PART B):
 * 1. Zero Groq Chat quota spent for deterministic local music commands:
 *    - Pause / Resume / Skip / Previous / What is playing
 *    - Play from favorites by title and/or artist
 *    - Play something from favorites / shuffle
 *    - Play the song I just liked
 * 2. Natural variation and Whisper speech recognition resilience:
 *    - Handles conversational fillers ("please", "can you", "hey jett", etc.)
 *    - Handles case differences, trailing punctuation, apostrophes
 *    - Normalizes Whisper phonetic mis-transcriptions
 * 3. Conversational Guard:
 *    - Does NOT hijack normal conversations (e.g. "Let's play chess", "play a role")
 * 4. Safe Groq Fallback:
 *    - Falls back to configured Groq chat model only when genuinely ambiguous
 */

import { cleanSpokenQuery, resolveFavoriteTrack } from './favorites-resolver.js';
import { executeMusicAction, normalizeText } from './music-actions.js';
import { SUPPORTED_PROVIDERS, getAllFavorites } from './favorites.js';

// Conversational filler prefixes that can precede commands
const FILLER_PREFIXES = /^(hey\s+)?(jett|jadu|island|computer|assistant)?[\s,]*(please\s+)?(can\s+you\s+)?(could\s+you\s+)?/i;

// Conversational phrases containing "play" that are NOT music commands
const NON_MUSIC_PLAY_PATTERNS = [
  /\bplay\s+(a\s+game|chess|cards|football|soccer|basketball|tennis|videogames?|games?)\b/i,
  /\bplay\s+(a\s+role|with\s+me|around|along|dead|fair)\b/i,
  /\bhow\s+to\s+play\b/i,
];

/**
 * Clean and normalize a spoken user text.
 */
export function sanitizeSpokenInput(rawText) {
  if (!rawText || typeof rawText !== 'string') return '';
  return cleanSpokenQuery(
    rawText
      .replace(FILLER_PREFIXES, '')
      .replace(/[.,!?;:]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * Interpret a spoken sentence locally for high-confidence music actions.
 *
 * @param {string} rawText - Transcribed speech from Whisper
 * @param {object} env - Environment { media, onControl, onOpenUrl, customStorage, turnId }
 * @returns {{ handledLocally: boolean, actionResult?: object, fallbackToLlm?: boolean, reason?: string }}
 */
export function interpretLocalMusicCommand(rawText, env = {}) {
  if (!rawText || typeof rawText !== 'string') {
    return { handledLocally: false };
  }

  const cleaned = sanitizeSpokenInput(rawText);
  if (!cleaned) return { handledLocally: false };

  // Guard against non-music utterances containing "play"
  for (const nonMusicPattern of NON_MUSIC_PLAY_PATTERNS) {
    if (nonMusicPattern.test(rawText)) {
      return { handledLocally: false, fallbackToLlm: true, reason: 'conversational_phrase' };
    }
  }

  const media = env.media || { active: false };
  const storage = env.customStorage || null;
  const turnId = env.turnId || Date.now();

  // 1. Basic Transport Commands
  if (/^(pause|pause music|pause the music|stop music|stop the music|pause playback|halt)$/i.test(cleaned)) {
    return {
      handledLocally: true,
      actionResult: executeMusicAction({ action: 'pause' }, env),
    };
  }

  if (/^(resume|resume music|resume the music|resume playback|unpause|unpause music|continue playing)$/i.test(cleaned)) {
    return {
      handledLocally: true,
      actionResult: executeMusicAction({ action: 'resume' }, env),
    };
  }

  // Generic "play" or "play music" when already active and paused -> resume
  if (/^(play|play music|start music)$/i.test(cleaned)) {
    if (media.active && media.status === 'paused') {
      return {
        handledLocally: true,
        actionResult: executeMusicAction({ action: 'resume' }, env),
      };
    }
    // If nothing playing, play a random favorite
    return {
      handledLocally: true,
      actionResult: executeMusicAction({ action: 'play_random_favorite' }, env),
    };
  }

  if (/^(next|next song|next track|skip|skip track|skip song|play the next song|play the next track)$/i.test(cleaned)) {
    return {
      handledLocally: true,
      actionResult: executeMusicAction({ action: 'next_track' }, env),
    };
  }

  if (/^(previous|previous song|previous track|prev song|prev track|go back|go back to the previous track|go back to the previous song)$/i.test(cleaned)) {
    return {
      handledLocally: true,
      actionResult: executeMusicAction({ action: 'previous_track' }, env),
    };
  }

  if (/^(what is playing|whats playing|what's playing|what song is this|what track is this|current song|current track|which song is playing)$/i.test(cleaned)) {
    return {
      handledLocally: true,
      actionResult: executeMusicAction({ action: 'get_current_track' }, env),
    };
  }

  if (/^(show|open|browse|view|display)\s+(my\s+)?favorites(\s+menu)?$/i.test(cleaned) ||
      /^(show|open|view)\s+my\s+saved\s+songs$/i.test(cleaned)) {
    return {
      handledLocally: true,
      actionResult: executeMusicAction({ action: 'show_favorites' }, env),
    };
  }

  if (/^(add\s+(this\s+song|this\s+track|this)?\s*to\s+favorites|favorite\s+this(\s+song)?|like\s+this(\s+song)?)$/i.test(cleaned)) {
    return {
      handledLocally: true,
      actionResult: executeMusicAction({ action: 'add_current_to_favorites' }, env),
    };
  }

  // 2. Favorites Commands: Shuffle / Something / Saved songs
  if (/^play\s+(something|anything|a\s+song|random)\s+from\s+(my\s+)?favorites$/i.test(cleaned) ||
      /^play\s+my\s+(saved\s+songs|favorites)$/i.test(cleaned) ||
      /^shuffle\s+(my\s+)?favorites$/i.test(cleaned)) {
    return {
      handledLocally: true,
      actionResult: executeMusicAction({ action: 'play_random_favorite' }, env),
    };
  }

  // 3. Favorites Command: Most recently liked song ("Play the song I just liked / saved")
  if (/^play\s+the\s+song\s+i\s+(just\s+)?(liked|saved|favorited)$/i.test(cleaned) ||
      /^play\s+(my\s+)?(recently|latest|last)\s+(liked|saved|favorited)\s+song$/i.test(cleaned)) {
    const resolution = resolveFavoriteTrack({ mostRecent: true, storage });
    if (!resolution.match) {
      return {
        handledLocally: true,
        actionResult: {
          ok: false,
          action: 'play_favorite',
          reason: 'empty_favorites',
          spokenConfirmation: "You don't have any saved favorites yet.",
        },
      };
    }
    return {
      handledLocally: true,
      actionResult: executeMusicAction({ action: 'play_favorite', query: resolution.match.title }, env),
    };
  }

  // 4. Targeted Favorites Commands: e.g. "Play Die For You from my favorites"
  // or "Play Die For You by The Weeknd from my favorites"
  const favMatch = cleaned.match(/^play\s+(.+?)\s+from\s+(my\s+)?favorites$/i) ||
                   cleaned.match(/^play\s+my\s+favorite\s+song\s+(.+)$/i) ||
                   cleaned.match(/^play\s+favorite\s+(.+)$/i);

  if (favMatch) {
    const rawSongTarget = favMatch[1].trim();
    // Check if artist is specified: "[song] by [artist]"
    let title = rawSongTarget;
    let artist = '';
    const byMatch = rawSongTarget.match(/^(.+?)\s+by\s+(.+)$/i);
    if (byMatch) {
      title = byMatch[1].trim();
      artist = byMatch[2].trim();
    }

    const resolution = resolveFavoriteTrack({
      query: rawSongTarget,
      title,
      artist,
      storage,
    });

    if (resolution.ambiguous) {
      const candidateList = resolution.candidates
        .map((c) => `"${c.title}"${c.artist ? ` by ${c.artist}` : ''}`)
        .join(' or ');
      return {
        handledLocally: true,
        actionResult: {
          ok: false,
          action: 'play_favorite',
          reason: 'ambiguous_match',
          matches: resolution.candidates,
          spokenConfirmation: `I found multiple matching songs in your favorites: ${candidateList}. Which one would you like?`,
        },
      };
    }

    if (resolution.match) {
      return {
        handledLocally: true,
        actionResult: executeMusicAction({ action: 'play_favorite', query: resolution.match.title }, env),
      };
    }

    // Honest negative feedback: Never fabricate or search internet if user asked for a favorite
    return {
      handledLocally: true,
      actionResult: {
        ok: false,
        action: 'play_favorite',
        reason: 'not_found',
        spokenConfirmation: `I couldn't find "${title}" in your favorites.`,
      },
    };
  }

  // 5. General "Play [song] by [artist]" or "Play [song]"
  const generalPlayMatch = cleaned.match(/^play\s+(.+)$/i);
  if (generalPlayMatch) {
    const candidateQuery = generalPlayMatch[1].trim();
    let title = candidateQuery;
    let artist = '';
    const byMatch = candidateQuery.match(/^(.+?)\s+by\s+(.+)$/i);
    if (byMatch) {
      title = byMatch[1].trim();
      artist = byMatch[2].trim();
    }

    // Check if it matches an existing saved favorite with high confidence
    const favRes = resolveFavoriteTrack({
      query: candidateQuery,
      title,
      artist,
      storage,
    });

    if (favRes.match) {
      return {
        handledLocally: true,
        actionResult: executeMusicAction({ action: 'play_favorite', query: favRes.match.title }, env),
      };
    }

    if (favRes.ambiguous) {
      const candidateList = favRes.candidates
        .map((c) => `"${c.title}"${c.artist ? ` by ${c.artist}` : ''}`)
        .join(' or ');
      return {
        handledLocally: true,
        actionResult: {
          ok: false,
          action: 'play_track',
          reason: 'ambiguous_match',
          matches: favRes.candidates,
          spokenConfirmation: `I found multiple matching songs: ${candidateList}. Which one did you mean?`,
        },
      };
    }

    // If query has clear music structure ("song by artist" or "track") but is not in favorites:
    // Execute play_track to search SMTC / launch provider
    return {
      handledLocally: true,
      actionResult: executeMusicAction({ action: 'play_track', query: candidateQuery }, env),
    };
  }

  // Not a deterministic music command -> pass to Groq chat
  return { handledLocally: false, fallbackToLlm: true };
}
