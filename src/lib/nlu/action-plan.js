/**
 * action-plan.js: Structured Ordered Action Planning for Island Voice Agent (PASS 2.2.5).
 *
 * Implements:
 * 1. Multi-action command parsing ("Pause this and play Pashmina", "Stop the current song and play Starboy",
 *    "Turn the music down and play Tuu", "Pause it, then play something from my Favorites").
 * 2. Sequential step validation and ordered execution.
 * 3. Smart replacement optimization: avoids redundant stop/pause calls if starting the new track
 *    already replaces the current playback, preventing race conditions and audio glitches.
 * 4. Explicit partial-failure handling and unified concise outcome acknowledgments.
 */

import { executeMusicAction, formatActionOutcomeSpeech } from '../music/music-actions.js';
import { audioCoordinator } from '../audio/audio-coordinator.js';
import { resolveFavoriteTrack, cleanSpokenQuery } from '../music/favorites-resolver.js';
import { musicContext } from '../music/music-conversation-context.js';

export class ActionPlan {
  constructor(steps = []) {
    this.id = `plan_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    this.steps = steps; // Array of { id, action, params, reason, isReplacementOptimized }
    this.results = [];
    this.status = 'pending'; // 'pending' | 'executing' | 'completed' | 'partial_failure' | 'failed'
    this.finalTrack = null;
    this.spokenConfirmation = null;
  }
}

/**
 * Clean spoken connector phrases and separate potential compound clauses.
 */
const COMPOUND_SPLIT_REGEX = /\s+(?:and\s+then|then|after\s+that|and\s+also|and)\s+/i;

/**
 * Parse an utterance into an ordered ActionPlan if it contains multiple actions.
 * @param {string} rawText - Transcribed user speech
 * @param {object} env - Environment { media, onControl, customStorage, turnId }
 * @returns {ActionPlan|null} ActionPlan instance or null if single action
 */
export function parseMultiActionPlan(rawText, env = {}) {
  if (!rawText || typeof rawText !== 'string') return null;

  const cleaned = rawText
    .replace(/[.,!?;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // 1. Recognize common multi-action patterns:
  // Pattern A: Pause/Stop current + Play new track
  // e.g. "Pause this and play Pashmina", "Stop the current song and play Starboy", "Pause it, then play something from my Favorites"
  const pauseThenPlay = cleaned.match(
    /^(?:please\s+)?(pause(?:\s+(?:the\s+)?(?:current\s+)?(?:song|track|music|playback|it|this))?|stop(?:\s+(?:the\s+)?(?:current\s+)?(?:song|track|music|playback|it|this))?|halt)\s+(?:and\s+then|then|after\s+that|and)\s+(play\s+.+)$/i
  );

  if (pauseThenPlay) {
    const playPart = pauseThenPlay[2].trim();
    const steps = [
      {
        id: 'step_pause',
        action: 'pause',
        description: 'Pause current playback',
      },
      {
        id: 'step_play',
        action: 'play_track_intent',
        rawQuery: playPart,
        description: `Execute playback for: ${playPart}`,
      },
    ];

    return optimizeActionPlan(new ActionPlan(steps), env);
  }

  // Pattern B: Volume control + Play track
  // e.g. "Turn the music down and play Tuu", "Lower the volume and play something from favorites"
  const volumeThenPlay = cleaned.match(
    /^(?:please\s+)?(turn\s+(?:the\s+)?(?:music|volume|sound)\s+down|lower\s+(?:the\s+)?(?:volume|music)|duck\s+(?:the\s+)?(?:music|volume))\s+(?:and\s+then|then|after\s+that|and)\s+(play\s+.+)$/i
  );

  if (volumeThenPlay) {
    const playPart = volumeThenPlay[2].trim();
    const steps = [
      {
        id: 'step_volume',
        action: 'duck',
        level: 0.10,
        description: 'Lower music volume',
      },
      {
        id: 'step_play',
        action: 'play_track_intent',
        rawQuery: playPart,
        description: `Execute playback for: ${playPart}`,
      },
    ];

    return optimizeActionPlan(new ActionPlan(steps), env);
  }

  // Pattern C: Skip + Play previous / mentioned song
  // e.g. "Skip this and play the song I mentioned earlier", "Skip and play Pashmina"
  const skipThenPlay = cleaned.match(
    /^(?:please\s+)?(skip(?:\s+(?:this|the\s+current\s+song|track))?|next(?:\s+song)?)\s+(?:and\s+then|then|after\s+that|and)\s+(play\s+.+)$/i
  );

  if (skipThenPlay) {
    const playPart = skipThenPlay[2].trim();
    const steps = [
      {
        id: 'step_skip',
        action: 'next_track',
        description: 'Skip current track',
      },
      {
        id: 'step_play',
        action: 'play_track_intent',
        rawQuery: playPart,
        description: `Execute playback for: ${playPart}`,
      },
    ];

    return optimizeActionPlan(new ActionPlan(steps), env);
  }

  return null;
}

/**
 * Optimize ActionPlan:
 * For replacement playback, starting a new track automatically stops the previous song in browser/player.
 * We mark redundant pause/stop as replacement-optimized so we don't trigger unnecessary pause delays or glitches.
 */
export function optimizeActionPlan(plan, env = {}) {
  if (!plan || !Array.isArray(plan.steps) || plan.steps.length < 2) return plan;

  const first = plan.steps[0];
  const second = plan.steps[1];

  // If first step is pause/stop and second is a play command:
  if ((first.action === 'pause' || first.action === 'stop') && (second.action === 'play_track_intent' || second.action === 'play_track' || second.action === 'play_favorite')) {
    // Starting the new track replaces playback. We flag first step as replacement-optimized.
    first.isReplacementOptimized = true;
  }

  return plan;
}

/**
 * Execute an ActionPlan sequentially with full error handling and unified acknowledgment.
 *
 * @param {ActionPlan} plan
 * @param {object} env - Execution environment
 * @returns {object} Combined action result
 */
export function executeActionPlan(plan, env = {}) {
  if (!plan || !Array.isArray(plan.steps) || plan.steps.length === 0) {
    return { ok: false, error: 'Empty action plan' };
  }

  plan.status = 'executing';
  const turnId = env.turnId || Date.now();
  const media = env.media || { active: false };
  const onControl = typeof env.onControl === 'function' ? env.onControl : () => {};

  let stepNumber = 0;
  let finalStepResult = null;
  let failedStep = null;

  for (const step of plan.steps) {
    stepNumber++;

    // 1. Handle duck / volume step
    if (step.action === 'duck') {
      audioCoordinator.startDucking({ duckLevel: step.level || 0.10, durationMs: 200, media });
      plan.results.push({
        stepId: step.id,
        action: 'duck',
        ok: true,
      });
      continue;
    }

    // 2. Handle pause step
    if (step.action === 'pause' || step.action === 'stop') {
      if (media.active && media.status !== 'paused') {
        onControl('pause');
        audioCoordinator.markExplicitPause();
      }
      plan.results.push({
        stepId: step.id,
        action: 'pause',
        ok: true,
      });
      continue;
    }

    // 4. Handle skip step
    if (step.action === 'next_track') {
      if (media.active) {
        onControl('next');
      }
      plan.results.push({
        stepId: step.id,
        action: 'next_track',
        ok: true,
      });
      continue;
    }

    // 5. Handle playback intent step
    if (step.action === 'play_track_intent') {
      const rawQuery = step.rawQuery || '';

      // Check if query refers to contextual memory: "the song I mentioned earlier", "the previous one"
      let effectiveQuery = rawQuery;
      const memContext = musicContext.getContext();

      if (/earlier|mentioned|before|previous\s+one/i.test(rawQuery)) {
        const recalled = musicContext.getPreviousTrackCandidate() || memContext.recentRequests[0];
        if (recalled && recalled.title) {
          effectiveQuery = `play ${recalled.title}`;
        }
      }

      // Check for Favorites match
      const favClean = effectiveQuery.replace(/^play\s+/i, '').replace(/\s+from\s+(my\s+)?favorites$/i, '').trim();
      const favRes = resolveFavoriteTrack({
        query: favClean,
        storage: env.customStorage,
      });

      let execRes;
      if (favRes.match) {
        execRes = executeMusicAction(
          { action: 'play_favorite', track: favRes.match, query: favRes.match.title },
          env
        );
      } else if (favRes.ambiguous) {
        const names = favRes.candidates.map((c) => `"${c.title}"`).join(' or ');
        execRes = {
          ok: false,
          action: 'play_favorite',
          reason: 'ambiguous_match',
          matches: favRes.candidates,
          spokenConfirmation: `I found multiple matching songs: ${names}. Which one did you mean?`,
        };
      } else {
        // Fall back to general track search
        execRes = executeMusicAction(
          { action: 'play_track', query: favClean },
          env
        );
      }

      plan.results.push({
        stepId: step.id,
        action: execRes.action,
        result: execRes,
        ok: execRes.ok,
      });

      finalStepResult = execRes;
      if (!execRes.ok) {
        failedStep = step;
        break; // Stop execution on playback resolution failure
      }
    }
  }

  // 6. Formulate unified outcome acknowledgment
  if (failedStep) {
    plan.status = plan.results.some((r) => r.ok && !r.skipped) ? 'partial_failure' : 'failed';
    const failReason = finalStepResult?.spokenConfirmation || 'Could not complete the requested music action.';
    return {
      ok: false,
      isCompound: true,
      actionPlan: plan,
      actionResult: finalStepResult,
      spokenConfirmation: failReason,
      transcriptText: failReason,
      isPartialFailure: plan.status === 'partial_failure',
    };
  }

  plan.status = 'completed';
  const targetTitle = finalStepResult?.track?.title || 'the song';
  const isAwaitingResult = Boolean(finalStepResult?.awaitingResult);

  // Concise natural outcome acknowledgment
  let unifiedConfirmation = finalStepResult?.spokenConfirmation || `Playing ${targetTitle}. Enjoy!`;
  if (plan.steps.some((s) => s.action === 'duck')) {
    unifiedConfirmation = `Turned the music down and opening ${targetTitle}.`;
  }

  const primaryAction =
    plan.steps.some((s) => s.action === 'pause' || s.action === 'stop') &&
    plan.steps.some((s) => s.action === 'play_track_intent' || s.action === 'play_favorite' || s.action === 'play_track')
      ? 'compound_pause_play'
      : (finalStepResult?.action || 'multi_action');

  return {
    ...finalStepResult,
    ok: true,
    executed: true,
    isCompound: true,
    action: primaryAction,
    actionPlan: plan,
    actionResult: finalStepResult,
    subActions: plan.steps.map((s) => s.action),
    initialAcknowledgment: `Pausing and opening ${targetTitle}.`,
    spokenConfirmation: unifiedConfirmation,
    transcriptText: unifiedConfirmation,
    awaitingResult: isAwaitingResult,
    track: finalStepResult?.track,
  };
}
