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

export function extractCleanTitleFromQuery(q) {
  if (!q || typeof q !== 'string') return null;
  return q
    .replace(/^(?:play|listen\s+to|put\s+on)\s+/i, '')
    .replace(/\s+(?:from|in)\s+my\s+(?:list|favorites|favs)\b/gi, '')
    .replace(/[.,!?;]/g, '')
    .trim();
}

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
    this.displayedFavorites = []; // Currently displayed favorites list in Agent chat
    this.lastReferencedCollection = null; // { type, tracks: [], filter, timestamp }
  }

  getContext() {
    return {
      pendingIntent: this.pendingIntent,
      lastFailedAction: this.lastFailedAction,
      lastSuccessfulAction: this.lastSuccessfulAction,
      previousCandidates: this.previousCandidates,
      recentRequests: this.recentRequests,
      activePlayerState: this.activePlayerState,
      displayedFavorites: this.displayedFavorites,
      lastReferencedCollection: this.lastReferencedCollection,
    };
  }

  setLastReferencedCollection(type, tracks = [], filter = 'all') {
    const list = Array.isArray(tracks) ? tracks.map((t) => ({ ...t })) : [];
    this.lastReferencedCollection = {
      type: type || 'favorites',
      tracks: list,
      filter: filter || 'all',
      timestamp: Date.now(),
    };
    this.displayedFavorites = list;
  }

  getLastReferencedCollection() {
    return this.lastReferencedCollection;
  }

  setDisplayedFavorites(tracks = [], filter = 'all') {
    const list = Array.isArray(tracks) ? tracks.map((t) => ({ ...t })) : [];
    this.displayedFavorites = list;
    this.lastReferencedCollection = {
      type: 'favorites',
      tracks: list,
      filter: filter || 'all',
      timestamp: Date.now(),
    };
  }

  getDisplayedFavorites() {
    return this.displayedFavorites || [];
  }

  getDisplayedFavoriteByIndex(index) {
    if (!Array.isArray(this.displayedFavorites)) return null;
    return this.displayedFavorites[index] || null;
  }

  getRandomTrackFromCollection(filter = 'all') {
    const collection = this.lastReferencedCollection?.tracks || this.displayedFavorites || [];
    if (!Array.isArray(collection) || collection.length === 0) return null;
    let eligible = collection;
    if (filter && filter !== 'all') {
      const f = filter.toLowerCase();
      eligible = collection.filter((t) => {
        const p = (t.provider || '').toLowerCase();
        if (f === 'spotify') return p === 'spotify';
        if (f === 'youtube') return p === 'youtube' || p === 'youtube_music';
        return p === f;
      });
    }
    if (eligible.length === 0) return null;
    const idx = Math.floor(Math.random() * eligible.length);
    return eligible[idx];
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

    const hasPendingCandidates = Boolean(this.previousCandidates && this.previousCandidates.length > 0);
    const hasPendingContext = Boolean(
      this.pendingIntent ||
      this.lastFailedAction ||
      hasPendingCandidates ||
      (this.displayedFavorites && this.displayedFavorites.length > 0)
    );

    const cleanConfirmedQuery = extractCleanTitleFromQuery(this.pendingIntent?.query) || this.pendingIntent?.query || null;

    // 0. Affirmative clarification confirmation: "Yes, that one", "Yes", "Yeah", "That one", "Play it", "Sure"
    const isAffirmative = /^(?:yes|yeah|yep|yup|sure|correct|exactly|that(?:'s|\s+is)\s+(?:the\s+one|right|it)|(?:play\s+)?that\s+one|play\s+it|please)\b/i.test(lower);
    if (isAffirmative && hasPendingCandidates) {
      return {
        isCorrection: true,
        action: 'play_favorite',
        selectedTrack: this.previousCandidates[0],
        confirmedAliasQuery: cleanConfirmedQuery,
        reason: 'confirmed_candidate',
      };
    }

    // Check ordinal and numbered selection: "Play the third one", "Play the 2nd one", "Play number 3", "The second one", etc.
    const ordinalMatch =
      lower.match(/\b(?:play\s+)?(?:the\s+)?(first|1st|second|2nd|third|3rd|fourth|4th|fifth|5th|sixth|6th|seventh|7th|eighth|8th|ninth|9th|tenth|10th)\s*(?:one|track|song|candidate)?\b/i) ||
      lower.match(/\b(?:play\s+)?number\s+(\d+)\b/i);

    if (ordinalMatch) {
      let index = -1;
      const word = (ordinalMatch[1] || '').toLowerCase();
      if (word === 'first' || word === '1st') index = 0;
      else if (word === 'second' || word === '2nd') index = 1;
      else if (word === 'third' || word === '3rd') index = 2;
      else if (word === 'fourth' || word === '4th') index = 3;
      else if (word === 'fifth' || word === '5th') index = 4;
      else if (word === 'sixth' || word === '6th') index = 5;
      else if (word === 'seventh' || word === '7th') index = 6;
      else if (word === 'eighth' || word === '8th') index = 7;
      else if (word === 'ninth' || word === '9th') index = 8;
      else if (word === 'tenth' || word === '10th') index = 9;
      else if (/^\d+$/.test(word)) index = parseInt(word, 10) - 1;

      // Pending clarification candidates take priority when user is answering a clarification
      if (hasPendingCandidates && this.previousCandidates.length > index && index >= 0) {
        return {
          isCorrection: true,
          action: 'play_favorite',
          selectedTrack: this.previousCandidates[index],
          confirmedAliasQuery: cleanConfirmedQuery,
          reason: 'chose_candidate_by_ordinal',
        };
      }

      // Check displayed favorites list
      if (this.displayedFavorites && this.displayedFavorites.length > index && index >= 0) {
        return {
          isCorrection: true,
          action: 'play_favorite',
          selectedTrack: this.displayedFavorites[index],
          reason: 'chose_displayed_favorite',
        };
      }
    }

    if (!hasPendingContext && !isCorrectionPrefix && !spelledWord && !langMatch) return null;

    const prevAction = this.pendingIntent?.action || this.lastFailedAction?.action || 'play_favorite';
    const prevQuery = this.pendingIntent?.query || this.lastFailedAction?.query || '';

    // 1. Check for candidate selection: "No, the other one" / "The other one"
    if (/\b(?:no[,.\s]+)?(?:the\s+)?other\s+one\b/i.test(lower)) {
      if (this.previousCandidates.length >= 2) {
        return {
          isCorrection: true,
          action: prevAction,
          selectedTrack: this.previousCandidates[1],
          confirmedAliasQuery: cleanConfirmedQuery,
          reason: 'chose_second_candidate',
        };
      }
      if (this.previousCandidates.length === 1) {
        return {
          isCorrection: true,
          action: prevAction,
          selectedTrack: this.previousCandidates[0],
          reason: 'chose_single_candidate',
        };
      }
    }

    // 2. Extract language clues: Hindi, Punjabi, Bengali, Tamil, Telugu, Hinglish, Spanish, etc.
    let languageHint = null;
    if (langMatch) {
      languageHint = langMatch[1].toLowerCase();
    }

    // 3. Extract artist hints: "The one by [artist]", "By [artist]"
    let artistHint = null;
    const byMatch = trimmed.match(/\b(?:the\s+one\s+)?by\s+([A-Za-z0-9\s]+?)(?:[.,!?;]|$)/i);
    if (byMatch) {
      artistHint = byMatch[1].trim();
    }

    // 4. Candidate disambiguation by artist or language hint when candidates are pending
    if (hasPendingCandidates && (artistHint || languageHint)) {
      if (artistHint) {
        const normArtist = normalizeText(artistHint);
        const match = this.previousCandidates.find((c) => {
          const ca = normalizeText(c.artist || '');
          return ca.includes(normArtist) || normArtist.includes(ca);
        });
        if (match) {
          return {
            isCorrection: true,
            action: 'play_favorite',
            selectedTrack: match,
            confirmedAliasQuery: cleanConfirmedQuery,
            reason: 'chose_candidate_by_artist',
          };
        }
      }

      if (languageHint && (languageHint === 'hindi' || languageHint === 'hinglish' || languageHint === 'punjabi')) {
        const match = this.previousCandidates.find((c) => {
          const ca = normalizeText(c.artist || '');
          return /arijit|pritam|atif|shreya|ar\s+rahman|diljit|badshah|honey|neha|jubin|sidhu|vishal|shekhar|amit|trivedi|salim|sulaiman/i.test(ca);
        });
        if (match) {
          return {
            isCorrection: true,
            action: 'play_favorite',
            selectedTrack: match,
            confirmedAliasQuery: this.pendingIntent?.query || null,
            reason: 'chose_candidate_by_language',
          };
        }
      }
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
      const cleanKey = extractCleanTitleFromQuery(spokenTitle) || spokenTitle;
      const key = normalizeText(cleanKey);
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
      const cleanKey = extractCleanTitleFromQuery(spokenTitle) || spokenTitle;
      const key = normalizeText(cleanKey);
      map[key] = verifiedFavoriteId;
      store.setItem(ALIASES_STORAGE_KEY, JSON.stringify(map));
    } catch {}
  }
}

export const musicContext = new MusicConversationContext();
export default musicContext;
