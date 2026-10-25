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

import { ALLOWED_ACTIONS, executeMusicAction } from './music-actions.js';

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
 * Process a voice turn: checks for intent, executes real music action if present,
 * and returns truth-grounded spoken and transcript text.
 *
 * @param {string} rawLlmResponse - Raw text response from LLM
 * @param {object} env - Execution environment { media, onControl, customStorage }
 * @returns {object} { executed: boolean, actionResult: object|null, spokenText: string, transcriptText: string }
 */
export function processTurnIntent(rawLlmResponse, env = {}) {
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
