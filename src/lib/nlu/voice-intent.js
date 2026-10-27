/**
 * voice-intent.js: Structured, allowlisted intent parser and action dispatcher for Jadu voice turns.
 *
 * Requirements:
 * 1. Single LLM call architecture: intent is embedded via [[ACTION:{"action":"...","query":"..."}]] in natural response.
 * 2. Strict schema validation against allowlisted music actions.
 * 3. Malformed, unknown, or fabricated commands are rejected cleanly.
 * 4. Grounded confirmations: When an action executes, the spoken output is strictly replaced with the confirmed result.
 * 5. Single execution per turn guard: Prevents duplicate execution.
 */

import { ALLOWED_ACTIONS, executeMusicAction } from '../music/music-actions.js';

const ACTION_REGEX = /\[\[ACTION:\s*(\{[\s\S]*?\})\s*\]\]/i;

/**
 * Validate and sanitize an incoming intent object against strict schema.
 * @param {any} raw
 * @returns {{ valid: boolean, intent?: { action: string, query?: string }, error?: string }}
 */
export function validateIntentSchema(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { valid: false, error: 'Intent must be a valid JSON object' };
  }

  const { action, query } = raw;

  if (typeof action !== 'string' || !action.trim()) {
    return { valid: false, error: 'Missing or invalid "action" field' };
  }

  const sanitizedAction = action.trim().toLowerCase();
  if (!ALLOWED_ACTIONS.includes(sanitizedAction)) {
    return { valid: false, error: `Action "${action}" is not allowlisted` };
  }

  let sanitizedQuery = '';
  if (typeof query === 'string') {
    // Sanitize query: max 120 chars, preserve Unicode letters (e.g. São Paulo, Hindi, etc.)
    sanitizedQuery = query
      .replace(/[\r\n\t]/g, ' ')
      .replace(/[^\p{L}\p{N}\s\-'&.,?()]/gu, '')
      .slice(0, 120)
      .trim();
  }

  return {
    valid: true,
    intent: {
      action: sanitizedAction,
      query: sanitizedQuery || undefined,
      durationMs: Number.isFinite(raw.durationMs) ? raw.durationMs : undefined,
      minutes: Number.isFinite(raw.minutes) ? raw.minutes : undefined,
      seconds: Number.isFinite(raw.seconds) ? raw.seconds : undefined,
      time: typeof raw.time === 'string' ? raw.time.trim() : undefined,
      label: typeof raw.label === 'string' ? raw.label.trim() : undefined,
      target: typeof raw.target === 'string' ? raw.target.trim() : undefined,
    },
  };
}

/**
 * Parse a raw LLM response text for an embedded [[ACTION:...]] tag.
 * Returns parsed intent and cleaned conversational text without tags.
 *
 * @param {string} rawText
 * @returns {{ hasIntent: boolean, intent: { action: string, query?: string } | null, cleanedText: string, error?: string }}
 */
export function parseActionIntent(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return { hasIntent: false, intent: null, cleanedText: '' };
  }

  const match = rawText.match(ACTION_REGEX);
  if (!match) {
    return { hasIntent: false, intent: null, cleanedText: rawText.trim() };
  }

  const rawJson = match[1];
  const cleanedText = rawText.replace(match[0], '').trim();

  try {
    const parsed = JSON.parse(rawJson);
    const validation = validateIntentSchema(parsed);

    if (!validation.valid) {
      return {
        hasIntent: false,
        intent: null,
        cleanedText,
        error: validation.error,
      };
    }

    return {
      hasIntent: true,
      intent: validation.intent,
      cleanedText,
    };
  } catch (err) {
    return {
      hasIntent: false,
      intent: null,
      cleanedText,
      error: `JSON parse error in action tag: ${err.message}`,
    };
  }
}

/**
 * Authorize an action intent against user input and conversational safety policies.
 * Guarantees that conversational questions, opinion queries, or isolated 'favourite' mentions
 * never trigger rogue playback or tool actions.
 *
 * @param {object} intent - Validated intent object
 * @param {string} userText - Original user utterance
 * @param {object} env - Execution environment
 * @returns {{ authorized: boolean, reason?: string, error?: string }}
 */
export function isActionAuthorized(intent, userText = '', env = {}) {
  if (!intent || !intent.action) {
    return { authorized: false, reason: 'missing_intent' };
  }

  // 1. Allowlist check
  if (!ALLOWED_ACTIONS.includes(intent.action)) {
    return { authorized: false, reason: 'unauthorized_action' };
  }

  // 2. Conversational Intent vs Action Separation (Fix 1, Fix 2, Fix 3)
  if (userText && typeof userText === 'string') {
    const cleanUser = userText.trim().toLowerCase();

    // Check if the utterance is a conversational question
    const isConversationalQuestion =
      /^(?:what(?:'s|\s+is|\s+are)?|who(?:'s|\s+is|\s+are)?|why\s+|how\s+|when\s+|where\s+|tell\s+me(?:\s+about)?|do\s+you\s+(?:like|think|have|know)|can\s+you\s+explain|what\s+do\s+you\s+think|describe)\b/i.test(cleanUser);

    const hasExplicitMusicWord =
      /\b(?:songs?|tracks?|music|audio|tune|playlist|album|artist|singer|band|spotify|youtube|apple\s+music)\b/i.test(cleanUser);

    const hasExplicitPlaybackVerb =
      /\b(?:play|pause|resume|skip|stop|shuffle|next|previous)\b/i.test(cleanUser);

    const hasExplicitSchedulerWord =
      /\b(?:timer|alarm|stopwatch|remind|countdown)\b/i.test(cleanUser);

    const isSchedulerAction =
      intent.action === 'set_timer' ||
      intent.action === 'set_alarm' ||
      intent.action === 'cancel_timer' ||
      intent.action === 'cancel_alarm' ||
      intent.action === 'get_schedule_status';

    // If it's a scheduler action, ensure scheduler intent is present
    if (isSchedulerAction && !hasExplicitSchedulerWord) {
      return {
        authorized: false,
        reason: 'scheduler_intent_missing',
        error: `Scheduler action "${intent.action}" rejected because userText has no scheduler intent.`,
      };
    }

    // If it's a conversational question with no explicit playback verb or music topic:
    // (e.g. "What's your favourite Marvel character?", "Who is Iron Man?", "Tell me about your favourite superhero")
    if (isConversationalQuestion && !hasExplicitPlaybackVerb && !hasExplicitMusicWord && !isSchedulerAction) {
      return {
        authorized: false,
        reason: 'conversational_question_mismatch',
        error: `Action "${intent.action}" is not authorized for conversational question: "${userText}"`,
      };
    }

    // "favourite" / "fav" alone without music keywords must NOT authorize random music playback
    if (
      (intent.action === 'play_random_favorite' || intent.action === 'play_favorite') &&
      /\b(?:favou?rites?|favs?)\b/i.test(cleanUser) &&
      !hasExplicitMusicWord &&
      !hasExplicitPlaybackVerb
    ) {
      return {
        authorized: false,
        reason: 'favourite_keyword_alone_insufficient',
        error: 'The word "favourite" alone without music context cannot trigger playback.',
      };
    }
  }

  // 3. Required arguments validation
  if (intent.action === 'play_track' && (!intent.query || !intent.query.trim())) {
    if (!env.media?.active) {
      return { authorized: false, reason: 'missing_required_query' };
    }
  }

  return { authorized: true };
}

/**
 * Process a voice turn: checks for intent, executes real music action if authorized,
 * and returns truth-grounded spoken and transcript text.
 *
 * @param {string} rawLlmResponse - Raw text response from LLM
 * @param {object} env - Execution environment { media, onControl, customStorage }
 * @param {string} originalUserText - Original spoken user text for action authorization
 * @returns {object} { executed: boolean, actionResult: object|null, spokenText: string, transcriptText: string }
 */
export function processTurnIntent(rawLlmResponse, env = {}, originalUserText = '') {
  const { hasIntent, intent, cleanedText, error } = parseActionIntent(rawLlmResponse);

  if (error) {
    console.warn('[Jadu Voice Intent] Rejected malformed action tag:', error);
  }

  if (!hasIntent || !intent) {
    // Normal conversation turn: speak cleaned conversational text
    const text = cleanedText || rawLlmResponse || '';
    return {
      executed: false,
      intent: null,
      actionResult: null,
      spokenText: text,
      transcriptText: text,
    };
  }

  // Fix 3: Action Authorization Guard
  const auth = isActionAuthorized(intent, originalUserText, env);
  if (!auth.authorized) {
    console.warn('[Jadu Voice Intent] Action denied by authorization policy:', auth.reason, auth.error);
    const text = cleanedText || rawLlmResponse || '';
    return {
      executed: false,
      intent: null,
      unauthorizedAction: intent,
      rejectionReason: auth.reason,
      actionResult: null,
      spokenText: text,
      transcriptText: text,
    };
  }

  // Execute the allowlisted action against real music state
  const actionResult = executeMusicAction(intent, env);

  // Requirement: Spoken confirmations must strictly reflect actual action result, not model assumptions
  const spokenConfirmation = actionResult.spokenConfirmation || deriveSpecificActionConfirmation(actionResult);

  return {
    executed: true,
    intent,
    actionResult,
    spokenText: spokenConfirmation,
    transcriptText: spokenConfirmation,
  };
}

/**
 * Derive specific natural language confirmation from tool outcome data.
 * Eliminates generic "Action completed" messages across all execution paths.
 */
export function deriveSpecificActionConfirmation(actionResult) {
  if (!actionResult) return "I couldn't complete that request.";
  if (actionResult.spokenConfirmation) return actionResult.spokenConfirmation;
  if (actionResult.ok === false) {
    return actionResult.error || "I couldn't complete that action.";
  }

  const act = actionResult.action || '';
  if (act === 'play_track' || act === 'play_favorite' || act === 'play_random_favorite') {
    return actionResult.track?.title ? `Playing ${actionResult.track.title}.` : 'Playing music.';
  }
  if (act === 'pause') return 'Paused music playback.';
  if (act === 'resume') return 'Resumed music playback.';
  if (act === 'next_track') return 'Skipped to the next track.';
  if (act === 'previous_track') return 'Skipped to the previous track.';
  if (act === 'set_volume') return actionResult.level ? `Set music volume to ${actionResult.level}%.` : 'Adjusted volume.';
  if (act === 'set_timer') {
    const label = actionResult.item?.label || actionResult.label;
    return label && label !== 'Timer' ? `Your ${label} timer is running.` : 'Your timer is running.';
  }
  if (act === 'set_alarm') {
    const label = actionResult.item?.label || actionResult.label;
    return label && label !== 'Alarm' ? `Your ${label} alarm is set.` : 'Your alarm is set.';
  }
  if (act === 'cancel_timer' || act === 'cancel_alarm') {
    return 'Cancelled.';
  }
  if (act === 'session_dismiss') {
    return 'Have a great day.';
  }

  return 'Ready.';
}
