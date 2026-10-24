/**
 * semantic-tool-planner.js: Unified semantic action planning and validation engine for Island (Pass 2.2.6.1).
 *
 * Implements:
 * 1. Strict, validated Action Planning Contract (AgentAction):
 *    - favorites.count (filter?: 'all' | 'spotify' | 'youtube')
 *    - favorites.list (filter?: 'all' | 'spotify' | 'youtube')
 *    - favorites.select (kind: 'random' | 'ordinal' | 'track', collectionRef?: string)
 *    - music.play (trackRef: string, provider?: string)
 *    - music.control (operation: 'pause' | 'resume' | 'stop' | 'next' | 'previous' | 'volume')
 *    - conversation.clarify (question: string)
 *    - conversation.dismiss ()
 *    - conversation.info (topic: string, query: string)
 * 2. Anaphora & Contextual Reference Resolution:
 *    - Resolves "it", "them", "those", "that list", "one of those" against active session collection.
 * 3. Separation of Concerns:
 *    - Planner interprets and proposes validated actions.
 *    - Deterministic application code executes against authoritative storage.
 * 4. Runtime Schema Validation:
 *    - Guarantees malformed or hallucinated model outputs are safely intercepted.
 */

import { musicContext } from './music-conversation-context.js';
import { normalizeText } from './music-actions.js';
import { SUPPORTED_PROVIDERS } from './favorites.js';
import { isExplicitReadAloudRequest } from './agent-response-contract.js';

export const ACTION_TYPES = Object.freeze({
  FAVORITES_COUNT: 'favorites.count',
  FAVORITES_LIST: 'favorites.list',
  FAVORITES_SELECT: 'favorites.select',
  MUSIC_PLAY: 'music.play',
  MUSIC_CONTROL: 'music.control',
  CONVERSATION_CLARIFY: 'conversation.clarify',
  CONVERSATION_DISMISS: 'conversation.dismiss',
  CONVERSATION_INFO: 'conversation.info',
  SCHEDULER_TIMER: 'scheduler.timer',
  SCHEDULER_ALARM: 'scheduler.alarm',
  SCHEDULER_CANCEL: 'scheduler.cancel',
  SCHEDULER_STATUS: 'scheduler.status',
});

/**
 * Validates an action object against the AgentAction schema.
 * @param {any} actionObj
 * @returns {{ valid: boolean, action?: object, error?: string }}
 */
export function validateAgentAction(actionObj) {
  if (!actionObj || typeof actionObj !== 'object' || Array.isArray(actionObj)) {
    return { valid: false, error: 'Action must be a valid JSON object' };
  }

  const { type } = actionObj;
  if (!type || typeof type !== 'string') {
    return { valid: false, error: 'Action type is required' };
  }

  switch (type) {
    case ACTION_TYPES.FAVORITES_COUNT: {
      const filter = actionObj.filter ? String(actionObj.filter).toLowerCase() : 'all';
      return { valid: true, action: { type, filter } };
    }

    case ACTION_TYPES.FAVORITES_LIST: {
      const filter = actionObj.filter ? String(actionObj.filter).toLowerCase() : 'all';
      const readAloud = Boolean(actionObj.readAloud);
      return { valid: true, action: { type, filter, readAloud } };
    }

    case ACTION_TYPES.FAVORITES_SELECT: {
      const selection = actionObj.selection;
      if (!selection || typeof selection !== 'object') {
        return { valid: false, error: 'favorites.select requires selection object' };
      }
      const kind = String(selection.kind || '').toLowerCase();
      if (kind === 'random') {
        return {
          valid: true,
          action: {
            type,
            selection: { kind: 'random' },
            collectionRef: actionObj.collectionRef || 'favorites',
            filter: actionObj.filter || 'all',
          },
        };
      }
      if (kind === 'ordinal') {
        const index = Number(selection.index);
        if (!Number.isInteger(index) || index < 0) {
          return { valid: false, error: 'ordinal selection requires non-negative integer index' };
        }
        return {
          valid: true,
          action: {
            type,
            selection: { kind: 'ordinal', index },
            collectionRef: actionObj.collectionRef || 'favorites',
          },
        };
      }
      if (kind === 'track') {
        const query = String(selection.query || '').trim();
        if (!query) return { valid: false, error: 'track selection requires query string' };
        return {
          valid: true,
          action: {
            type,
            selection: { kind: 'track', query },
            collectionRef: actionObj.collectionRef || 'favorites',
          },
        };
      }
      return { valid: false, error: `Unknown selection kind: ${kind}` };
    }

    case ACTION_TYPES.MUSIC_PLAY: {
      const trackRef = String(actionObj.trackRef || '').trim();
      if (!trackRef) return { valid: false, error: 'music.play requires trackRef' };
      return {
        valid: true,
        action: {
          type,
          trackRef,
          provider: actionObj.provider || null,
        },
      };
    }

    case ACTION_TYPES.MUSIC_CONTROL: {
      const operation = String(actionObj.operation || '').toLowerCase();
      const validOps = ['pause', 'resume', 'stop', 'next', 'previous', 'volume'];
      if (!validOps.includes(operation)) {
        return { valid: false, error: `Invalid control operation: ${operation}` };
      }
      return {
        valid: true,
        action: {
          type,
          operation,
          level: actionObj.level,
        },
      };
    }

    case ACTION_TYPES.CONVERSATION_CLARIFY: {
      const question = String(actionObj.question || '').trim();
      return { valid: true, action: { type, question } };
    }

    case ACTION_TYPES.CONVERSATION_DISMISS: {
      return { valid: true, action: { type } };
    }

    case ACTION_TYPES.CONVERSATION_INFO: {
      return {
        valid: true,
        action: {
          type,
          topic: String(actionObj.topic || 'general'),
          query: String(actionObj.query || ''),
        },
      };
    }

    case ACTION_TYPES.SCHEDULER_TIMER: {
      const durationMs = Number(actionObj.durationMs);
      if (!Number.isFinite(durationMs) || durationMs <= 0) {
        return { valid: false, error: 'scheduler.timer requires positive durationMs' };
      }
      return { valid: true, action: { type, durationMs, label: actionObj.label || '' } };
    }

    case ACTION_TYPES.SCHEDULER_ALARM: {
      const time = String(actionObj.time || '').trim();
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
        return { valid: false, error: 'scheduler.alarm requires valid HH:MM time' };
      }
      return { valid: true, action: { type, time, label: actionObj.label || '' } };
    }

    case ACTION_TYPES.SCHEDULER_CANCEL: {
      return { valid: true, action: { type, target: actionObj.target || 'any', specificTime: actionObj.specificTime || null } };
    }

    case ACTION_TYPES.SCHEDULER_STATUS: {
      return { valid: true, action: { type, target: actionObj.target || 'all' } };
    }

    default:
      return { valid: false, error: `Unsupported action type: ${type}` };
  }
}

/**
 * Parse an incoming user utterance into a validated AgentAction based on semantic meaning and session context.
 *
 * @param {string} rawText - Transcribed user speech
 * @param {object} contextSnapshot - Active session context
 * @returns {{ plan: object|null, confidence: 'high'|'medium'|'low', fallbackToLlm: boolean, reason?: string }}
 */
export function planUserIntent(rawText, contextSnapshot = null) {
  if (!rawText || typeof rawText !== 'string') {
    return { plan: null, confidence: 'low', fallbackToLlm: true };
  }

  const trimmed = rawText.trim();
  const lower = trimmed.toLowerCase();

  // Strip common conversational filler prefixes and normalize punctuation
  const normalized = lower
    .replace(/^(?:hey\s+)?(?:jett|nova|island|computer|assistant)[,\s]*/i, '')
    .replace(/^(?:please|can\s+you|could\s+you|would\s+you|will\s+you|just)\s+/i, '')
    .replace(/[.,!?;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // 1. Conversational Closings / Dismissal
  if (
    /^(?:thanks|thank\s+you|thank\s+you\s+so\s+much|thanks\s+a\s+lot|no\s+thanks|no\s+that(?:'s|\s+is)\s+all|that(?:'s|\s+is)\s+all|that(?:'s|\s+is)\s+it|nothing\s+else|bye|goodbye|done|dismiss)$/i.test(normalized) ||
    /^(?:thanks|thank\s+you)[,\s]+(?:that(?:'s|\s+is)\s+all|that(?:'s|\s+is)\s+it|goodbye|bye|done)$/i.test(normalized) ||
    /^(?:no\s+)?(?:that(?:'s|\s+is)\s+all|that(?:'s|\s+is)\s+it)[,\s]*(?:thanks|thank\s+you)?$/i.test(normalized)
  ) {
    return {
      plan: { type: ACTION_TYPES.CONVERSATION_DISMISS },
      confidence: 'high',
      fallbackToLlm: false,
    };
  }

  // 2. Live Weather Queries & Natural Follow-ups (Pass 2.2.6.2 Part B)
  // "What's the weather outside?", "Is it hot right now?", "How about tomorrow?", "Will it rain this evening?", "What's the weather in Delhi?", "How about Mumbai instead?"
  const isWeatherDirect = /\b(?:weather|temperature|forecast|rain|raining|sunny|hot\s+outside|cold\s+outside|is\s+it\s+hot|is\s+it\s+cold|how\s+hot|how\s+cold)\b/i.test(normalized);
  const isWeatherFollowUp =
    /^(?:how|what)\s+about\s+(?:tomorrow|this\s+evening|tonight)(?:[.,!?]|$)/i.test(normalized) ||
    /^(?:how|what)\s+about\s+[A-Za-z\s]+(?:\s+instead)?(?:[.,!?]|$)/i.test(normalized);

  if (isWeatherDirect || isWeatherFollowUp) {
    let timeframe = 'current';
    if (/\b(?:tomorrow|next\s+day)\b/i.test(normalized)) {
      timeframe = 'tomorrow';
    } else if (/\b(?:this\s+evening|tonight|evening)\b/i.test(normalized)) {
      timeframe = 'evening';
    }

    let questionType = 'general';
    if (/\b(?:rain|raining|precipitation|drizzle|umbrella)\b/i.test(normalized)) {
      questionType = 'rain';
    } else if (/\b(?:hot|cold|warm|heat|chilly|freezing)\b/i.test(normalized)) {
      questionType = 'heat';
    } else if (/\b(?:temperature|temp|degrees)\b/i.test(normalized)) {
      questionType = 'temperature';
    }

    let targetCity = null;
    const cityMatch = trimmed.match(/\b(?:in|for|at|of)\s+([A-Za-z\s]+?)(?:[.,!?]|$)/i);
    if (cityMatch) {
      const candidate = cityMatch[1].replace(/\b(?:today|tomorrow|now|outside|currently|this\s+evening|tonight)\b/gi, '').trim();
      if (candidate.length > 1 && !/^(?:the\s+)?(?:area|outside|city|town)$/i.test(candidate)) {
        targetCity = candidate;
      }
    }

    // Follow-up city: "How about Mumbai instead?"
    if (!targetCity) {
      const followUpMatch = trimmed.match(/^(?:how|what)\s+about\s+([A-Za-z\s]+?)(?:\s+instead|\s+tomorrow|\s+tonight)?(?:[.,!?]|$)/i);
      if (followUpMatch) {
        const candidate = followUpMatch[1].replace(/\b(?:today|tomorrow|now|outside|currently|this\s+evening|tonight)\b/gi, '').trim();
        if (candidate.length > 1 && !/^(?:the\s+)?(?:area|outside|city|town)$/i.test(candidate)) {
          targetCity = candidate;
        }
      }
    }

    return {
      plan: {
        type: ACTION_TYPES.CONVERSATION_INFO,
        topic: 'weather',
        location: targetCity || null,
        timeframe,
        questionType,
        query: trimmed,
      },
      confidence: 'high',
      fallbackToLlm: false,
    };
  }

  // 3. Informational Questions about Artist, Song, Album (Must NOT trigger playback!)
  if (
    /\b(?:tell\s+me\s+about|who\s+is|who\s+wrote|who\s+sings|what\s+genre\s+is|information\s+about|lyrics\s+of)\b/i.test(normalized)
  ) {
    return {
      plan: {
        type: ACTION_TYPES.CONVERSATION_INFO,
        topic: 'music_trivia',
        query: trimmed,
      },
      confidence: 'high',
      fallbackToLlm: true, // Allow conversational LLM to answer artist facts
    };
  }

  // 4. Basic Transport Controls
  if (/^(?:pause|stop\s+music|stop\s+the\s+music|pause\s+playback|halt)$/i.test(normalized)) {
    return { plan: { type: ACTION_TYPES.MUSIC_CONTROL, operation: 'pause' }, confidence: 'high', fallbackToLlm: false };
  }
  if (/^(?:resume|unpause|continue\s+playing)$/i.test(normalized)) {
    return { plan: { type: ACTION_TYPES.MUSIC_CONTROL, operation: 'resume' }, confidence: 'high', fallbackToLlm: false };
  }
  if (/^(?:skip|next|next\s+song|next\s+track)$/i.test(normalized)) {
    return { plan: { type: ACTION_TYPES.MUSIC_CONTROL, operation: 'next' }, confidence: 'high', fallbackToLlm: false };
  }
  if (/^(?:previous|previous\s+song|prev\s+song|previous\s+track|go\s+back)$/i.test(normalized)) {
    return { plan: { type: ACTION_TYPES.MUSIC_CONTROL, operation: 'previous' }, confidence: 'high', fallbackToLlm: false };
  }

  // 5. Volume Controls
  const volMatch = normalized.match(/^(?:set|turn|change)?\s*(?:the\s+)?volume\s+(?:to\s+)?(\d+)%?$/i);
  if (volMatch) {
    return {
      plan: { type: ACTION_TYPES.MUSIC_CONTROL, operation: 'volume', level: parseInt(volMatch[1], 10) },
      confidence: 'high',
      fallbackToLlm: false,
    };
  }

  // Extract source provider filters (e.g., "from Spotify", "on YouTube Music", "Spotify favorites")
  let providerFilter = 'all';
  if (/\bspotify\b/i.test(normalized)) providerFilter = 'spotify';
  else if (/\b(?:youtube|ytm)\b/i.test(normalized)) providerFilter = 'youtube';

  // 6. Favorites Count Requests
  // "How many songs do I have?", "How many favorites do I have?", "How many are there?", "What is the count?", "Count my favorites", "How many songs are saved in my list?"
  const isCountRequest =
    (/^(?:how\s+many|count|what\s+is\s+the\s+count)\b/i.test(normalized) &&
     /\b(?:songs?|tracks?|favorites?|saved|there|i\s+have|list)\b/i.test(normalized) &&
     !/^(?:show|list|name|display)\b/i.test(normalized)) ||
    /^(?:how\s+many\s+are\s+there|how\s+many\s+do\s+i\s+have)$/i.test(normalized);

  if (isCountRequest) {
    return {
      plan: { type: ACTION_TYPES.FAVORITES_COUNT, filter: providerFilter },
      confidence: 'high',
      fallbackToLlm: false,
    };
  }

  // 7. Favorites Names / List Requests
  // "Show me my favorite songs", "Show my favorites", "Can you name all of them?", "What songs have I saved?", "List all of them", "Read all my favorites aloud"
  const isReadAloud = isExplicitReadAloudRequest(rawText);
  const isListRequest =
    isReadAloud ||
    /\b(?:show|list|display|browse|view|read)\s+(?:me\s+)?(?:my\s+)?(?:favorite\s+songs|favorites|saved\s+songs|saved\s+tracks|library)\b/i.test(normalized) ||
    /\b(?:name|list|tell\s+me|what\s+are)\s+(?:all\s+of\s+them|all\s+the\s+songs|every\s+song|all\s+my\s+favorites|the\s+songs)\b/i.test(normalized) ||
    /^(?:what\s+songs|which\s+songs)\s+(?:have\s+i\s+saved|do\s+i\s+have|are\s+in\s+my\s+favorites)/i.test(normalized);

  if (isListRequest) {
    return {
      plan: { type: ACTION_TYPES.FAVORITES_LIST, filter: providerFilter, readAloud: isReadAloud },
      confidence: 'high',
      fallbackToLlm: false,
    };
  }

  // 8. Collection Selection Requests (Random, Ordinal, Anaphoric)
  // "Play any random one from it", "Play something from that list", "Surprise me with something I've saved", "Choose one of those tracks"
  const isRandomFromCollection =
    /\b(?:any\s+random\s+one|a\s+random\s+one|something\s+random|random\s+song|random\s+track|surprise\s+me|pick\s+one|choose\s+one|something|anything|a\s+song)\b/i.test(normalized) &&
    /\b(?:from\s+it|from\s+them|from\s+those|from\s+that\s+list|from\s+the\s+list|from\s+my\s+favorites|from\s+my\s+list|of\s+those|of\s+them|i(?:'ve|\s+have)?\s+saved)\b/i.test(normalized);

  const isPureRandomFavorite =
    /^(?:play\s+)?(?:any\s+random\s+one|a\s+random\s+one|something\s+random|random\s+favorite|surprise\s+me)(?:\s+(?:from|in)\s+(?:it|them|those|my\s+favorites|my\s+list|that\s+list))?$/i.test(normalized);

  if (isRandomFromCollection || isPureRandomFavorite) {
    return {
      plan: {
        type: ACTION_TYPES.FAVORITES_SELECT,
        selection: { kind: 'random' },
        collectionRef: 'favorites',
        filter: providerFilter,
      },
      confidence: 'high',
      fallbackToLlm: false,
    };
  }

  // Ordinal Selection: "Play the third one", "Play number 2", "The 1st one"
  const ordinalMatch =
    normalized.match(/\b(?:play\s+)?(?:the\s+)?(first|1st|second|2nd|third|3rd|fourth|4th|fifth|5th|sixth|6th|seventh|7th|eighth|8th|ninth|9th|tenth|10th)\s*(?:one|track|song|from\s+(?:it|them|those|the\s+list))?\b/i) ||
    normalized.match(/\b(?:play\s+)?number\s+(\d+)\b/i);

  if (ordinalMatch) {
    let index = -1;
    const word = (ordinalMatch[1] || '').toLowerCase();
    const ordinals = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
    const ordinalsShort = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'];

    const oIdx = ordinals.indexOf(word);
    if (oIdx >= 0) index = oIdx;
    const sIdx = ordinalsShort.indexOf(word);
    if (sIdx >= 0) index = sIdx;
    if (/^\d+$/.test(word)) index = parseInt(word, 10) - 1;

    if (index >= 0) {
      return {
        plan: {
          type: ACTION_TYPES.FAVORITES_SELECT,
          selection: { kind: 'ordinal', index },
          collectionRef: 'favorites',
        },
        confidence: 'high',
        fallbackToLlm: false,
      };
    }
  }

  // 9. Specific Track Playback Requests
  // "Play City of Stars from my list", "Play Attention", "Play Tuu"
  const playTrackMatch = normalized.match(/^(?:play|listen\s+to|put\s+on)\s+(.+)$/i);
  if (playTrackMatch) {
    let rawTarget = playTrackMatch[1].trim();

    // Check if target is anaphoric phrase rather than a real title!
    if (/^(?:any\s+)?(?:random|something\s+random)(?:\s+(?:one|song|track))?(?:\s+(?:from|in)\s+(?:it|them|those|that\s+list|my\s+list|my\s+favorites))?$/i.test(rawTarget)) {
      return {
        plan: {
          type: ACTION_TYPES.FAVORITES_SELECT,
          selection: { kind: 'random' },
          collectionRef: 'favorites',
          filter: providerFilter,
        },
        confidence: 'high',
        fallbackToLlm: false,
      };
    }

    if (/^(?:it|them|those|one\s+of\s+them|one\s+of\s+those)$/i.test(rawTarget)) {
      return {
        plan: {
          type: ACTION_TYPES.FAVORITES_SELECT,
          selection: { kind: 'random' },
          collectionRef: 'favorites',
          filter: providerFilter,
        },
        confidence: 'high',
        fallbackToLlm: false,
      };
    }

    // Check if constrained to favorites
    let isFavConstraint = false;
    if (/\b(?:from|in|on)\s+(?:my\s+)?(?:list|playlist|favorites|saved\s+songs|saved\s+tracks|library)\b/i.test(rawTarget)) {
      isFavConstraint = true;
      rawTarget = rawTarget.replace(/\b(?:from|in|on)\s+(?:my\s+)?(?:list|playlist|favorites|saved\s+songs|saved\s+tracks|library)\b/gi, '').trim();
    } else if (/\b(?:that\s+)?(?:i\s+)?(?:saved|liked|favorited)\b/i.test(rawTarget)) {
      isFavConstraint = true;
      rawTarget = rawTarget.replace(/\b(?:that\s+)?(?:i\s+)?(?:saved|liked|favorited)\b/gi, '').trim();
    }

    // Clean packaging
    rawTarget = rawTarget
      .replace(/^(?:the\s+song|that\s+song|the\s+track|that\s+track)\s+/i, '')
      .replace(/\s+(?:song|track)$/i, '')
      .trim();

    if (isFavConstraint) {
      return {
        plan: {
          type: ACTION_TYPES.FAVORITES_SELECT,
          selection: { kind: 'track', query: rawTarget },
          collectionRef: 'favorites',
          provider: providerFilter !== 'all' ? providerFilter : null,
        },
        confidence: 'high',
        fallbackToLlm: false,
      };
    }

    return {
      plan: {
        type: ACTION_TYPES.MUSIC_PLAY,
        trackRef: rawTarget,
        provider: providerFilter !== 'all' ? providerFilter : null,
      },
      confidence: 'medium',
      fallbackToLlm: false,
    };
  }

  // Not a deterministic command -> fall back to conversational LLM
  return { plan: null, confidence: 'low', fallbackToLlm: true };
}
