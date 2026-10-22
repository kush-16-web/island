/**
 * music-conversation-context.js: Session memory and contextual correction resolver for Island (PASS 2.2.5).
 *
 * Implements:
 * 1. Compact structured context surviving multiple voice turns within the active session:
 *    - Current music intent
 *    - Pending unresolved track & failed lookups
 *    - Candidate tracks from ambiguous results
 *    - Recently requested tracks
 *    - Last successful action
 * 2. Natural correction detection & disambiguation:
 *    - "No, T-U-U. It's a Hindi song" -> spelled letter normalization (T-U-U -> tuu) + language clue
 *    - "No, the other one" -> picks from previous candidates
 *    - "The one by Arijit Singh" -> updates artist candidate while keeping title
 *    - "Play the previous one" / "The song I asked for before" -> temporal recall
 * 3. Confirmed Title Alias Learning:
 *    - Persists confirmed user aliases (e.g. "two" -> "Tuu") only after successful playback confirmation.
 */

import { normalizeText, stringSimilarity } from './music-actions.js';

const ALIASES_STORAGE_KEY = 'island_music_aliases';

class MusicConversationContext {
  constructor() {
    this.reset();
  }

  reset() {
    this.pendingIntent = null; // { action, query, title, candidates: [] }
    this.lastFailedAction = null; // { action, query, title, reason, timestamp }
    this.lastSuccessfulAction = null; // { action, track, timestamp }
    this.previousCandidates = []; // Array of candidate tracks from ambiguous resolution
    this.recentRequests = []; // [{ query, title, artist, status, timestamp }]
    this.activePlayerState = null;
  }

  getContext() {
    return {
      pendingIntent: this.pendingIntent,
      lastFailedAction: this.lastFailedAction,
      lastSuccessfulAction: this.lastSuccessfulAction,
      previousCandidates: this.previousCandidates,
      recentRequests: this.recentRequests,
      activePlayerState: this.activePlayerState,
    };
  }

  recordRequest({ query, title, artist, action, status = 'requested' }) {
    if (!title && !query) return;
    const item = {
      query: query || title,
      title: title || query,
      artist: artist || '',
      action: action || 'play_track',
      status,
      timestamp: Date.now(),
    };
    this.recentRequests.unshift(item);
    if (this.recentRequests.length > 8) {
      this.recentRequests.length = 8;
    }
  }

  recordSuccess(action, track) {
    this.lastSuccessfulAction = {
      action,
      track: track ? { ...track } : null,
      timestamp: Date.now(),
    };
    this.pendingIntent = null;
    this.lastFailedAction = null;
    this.recordRequest({
      title: track?.title,
      artist: track?.artist,
      action,
      status: 'confirmed_playing',
    });
  }

  recordFailure(action, query, reason = 'not_found', candidates = []) {
    this.lastFailedAction = {
      action,
      query,
      reason,
      timestamp: Date.now(),
    };
    this.pendingIntent = {
      action,
      query,
      candidates,
    };
    if (candidates && candidates.length > 0) {
      this.previousCandidates = [...candidates];
    }
  }

  setPreviousCandidates(candidates = []) {
    if (Array.isArray(candidates) && candidates.length > 0) {
      this.previousCandidates = candidates.map((c) => ({ ...c }));
    }
  }

  getPreviousTrackCandidate() {
    if (this.previousCandidates.length > 0) {
      return this.previousCandidates[0];
    }
    if (this.recentRequests.length > 0) {
      return this.recentRequests[0];
    }
    return null;
  }

  /**
   * Normalize spelled-out letter sequences:
   * e.g. "T-U-U", "T.U.U.", "T U U", "t-u-u" -> "tuu"
   * e.g. "it's spelled T-U-U" -> "tuu"
   */
  normalizeSpelledLetters(text) {
    if (!text || typeof text !== 'string') return '';

    // Match patterns like "T-U-U", "T - U - U", "T.U.U.", "T U U" (2 to 8 single capital/spaced letters)
    const spelledMatch = text.match(/\b([a-zA-Z](?:[\s.-]+[a-zA-Z]){1,7})\b/);
    if (spelledMatch) {
      const letters = spelledMatch[1].replace(/[\s.-]/g, '');
      // Only treat as spelled letters if each segment was a single letter
      const segments = spelledMatch[1].split(/[\s.-]+/).filter(Boolean);
      if (segments.length >= 2 && segments.every((s) => s.length === 1)) {
        return letters.toLowerCase();
      }
    }

    return null;
  }

  /**
   * Detect if the incoming user utterance is a correction of the previous music turn.
   *
   * @param {string} userText - Raw transcribed user speech
   * @returns {object|null} { isCorrection: boolean, targetTitle, targetArtist, languageHint, candidatePick, action }
   */
  detectCorrection(userText) {
    if (!userText || typeof userText !== 'string') return null;

    const trimmed = userText.trim();
    const lower = trimmed.toLowerCase();

    const isCorrectionPrefix = /^(?:no|nope|not\s+that|not\s+this|i\s+meant|actually|it's\s+spelled|spelled)\b/i.test(lower);
    const spelledWord = this.normalizeSpelledLetters(trimmed);
    const langMatch = lower.match(/\b(hindi|punjabi|bengali|tamil|telugu|hinglish|english|spanish)\b/i);

    const hasPendingContext = Boolean(this.pendingIntent || this.lastFailedAction || this.previousCandidates.length > 0);
    if (!hasPendingContext && !isCorrectionPrefix && !spelledWord && !langMatch) return null;

    const prevAction = this.pendingIntent?.action || this.lastFailedAction?.action || 'play_favorite';
    const prevQuery = this.pendingIntent?.query || this.lastFailedAction?.query || '';

    // 1. Check for candidate selection: "No, the other one", "The second one", "Play the first one"
    if (/\b(?:no[,.\s]+)?(?:the\s+)?other\s+one\b/i.test(lower) || /\bsecond\s+(?:one|candidate|track|song)\b/i.test(lower)) {
      if (this.previousCandidates.length >= 2) {
        return {
          isCorrection: true,
          action: prevAction,
          selectedTrack: this.previousCandidates[1],
          reason: 'chose_second_candidate',
        };
      }
    }

    if (/\b(?:the\s+)?first\s+(?:one|candidate|track|song)\b/i.test(lower)) {
      if (this.previousCandidates.length >= 1) {
        return {
          isCorrection: true,
          action: prevAction,
          selectedTrack: this.previousCandidates[0],
          reason: 'chose_first_candidate',
        };
      }
    }

    // 3. Extract language clues: Hindi, Punjabi, Bengali, Tamil, Telugu, Hinglish, Spanish, etc.
    let languageHint = null;
    if (langMatch) {
      languageHint = langMatch[1].toLowerCase();
    }

    // 4. Extract artist hints: "The one by [artist]", "By [artist]"
    let artistHint = null;
    const byMatch = trimmed.match(/\b(?:the\s+one\s+)?by\s+([A-Za-z0-9\s]+?)(?:[.,!?;]|$)/i);
    if (byMatch) {
      artistHint = byMatch[1].trim();
    }

    if (isCorrectionPrefix || spelledWord || languageHint || artistHint) {
      // Determine corrected title candidate:
      let candidateTitle = spelledWord || null;

      if (!candidateTitle) {
        // Strip prefixes: "No,", "I meant", "Not that"
        const cleanContent = trimmed
          .replace(/^(?:no|nope|not\s+that|i\s+meant|actually)[,.\s]*/i, '')
          .replace(/\b(?:it's\s+a\s+)?(hindi|punjabi|bengali|tamil|telugu|hinglish|english|spanish)\s+(?:song|version|track)?\b/gi, '')
          .replace(/\b(?:the\s+one\s+)?by\s+[A-Za-z0-9\s]+/gi, '')
          .replace(/[.,!?;]/g, '')
          .trim();

        if (cleanContent && cleanContent.length > 1) {
          candidateTitle = cleanContent;
        }
      }

      return {
        isCorrection: true,
        action: prevAction,
        previousQuery: prevQuery,
        candidateTitle: candidateTitle || prevQuery,
        artistHint,
        languageHint,
        spelledWord,
      };
    }

    return null;
  }

  /**
   * Confirmed Title Alias Storage:
   * Maps a phonetic / spoken mis-transcription to a verified Favorite ID.
   */
  getLearnedAlias(spokenTitle, storage = null) {
    if (!spokenTitle) return null;
    try {
      const store = storage || (typeof window !== 'undefined' ? window.localStorage : null);
      if (!store) return null;
      const raw = store.getItem(ALIASES_STORAGE_KEY);
      if (!raw) return null;
      const map = JSON.parse(raw);
      const key = normalizeText(spokenTitle);
      return map[key] || null;
    } catch {
      return null;
    }
  }

  learnAlias(spokenTitle, verifiedFavoriteId, storage = null) {
    if (!spokenTitle || !verifiedFavoriteId) return;
    try {
      const store = storage || (typeof window !== 'undefined' ? window.localStorage : null);
      if (!store) return;
      const raw = store.getItem(ALIASES_STORAGE_KEY);
      const map = raw ? JSON.parse(raw) : {};
      const key = normalizeText(spokenTitle);
      map[key] = verifiedFavoriteId;
      store.setItem(ALIASES_STORAGE_KEY, JSON.stringify(map));
    } catch {}
  }
}

export const musicContext = new MusicConversationContext();
export default musicContext;
