/**
 * latency-tracker.js: Full Voice Pipeline Latency Instrumentation (Pass 2.2.6.3).
 *
 * Instruments the 8 critical pipeline phases:
 * 1. speech_end: End of user speech / VAD silence trip
 * 2. stt: Whisper speech-to-text start and completion
 * 3. intent: Semantic intent & grammar resolution
 * 4. tool: Tool execution (favorites, weather, transport)
 * 5. llm: Conversational LLM generation completion
 * 6. tts: TTS speech synthesis request start & completion
 * 7. audio_first_chunk: Exact moment of first audible playback (onStart)
 * 8. speech_completed: End of speech audio output (onEnded)
 *
 * Exposes real latency metrics across multiple turns via window.__islandLatencyMetrics.
 */

class LatencyTracker {
  constructor() {
    this.turns = new Map();
    this.history = []; // Ring buffer capped at 30 turns
  }

  /**
   * Start tracking a new voice turn.
   * @param {string|number} turnId
   * @param {object} metadata { userText, provider, engine }
   */
  startTurn(turnId, metadata = {}) {
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    this.turns.set(String(turnId), {
      turnId: String(turnId),
      startTime: now,
      stages: {
        speech_end: now,
      },
      metadata: { ...metadata },
    });
  }

  /**
   * Record a milestone stage in the turn.
   * @param {string|number} turnId
   * @param {string} stageName - 'stt_start'|'stt_end'|'intent_start'|'intent_end'|'tool_start'|'tool_end'|'llm_start'|'llm_end'|'tts_start'|'tts_end'|'audio_first_chunk'|'speech_completed'
   * @param {object} extra - Optional stage metadata
   */
  recordStage(turnId, stageName, extra = {}) {
    const id = String(turnId);
    let turn = this.turns.get(id);
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

    if (!turn) {
      turn = {
        turnId: id,
        startTime: now,
        stages: {},
        metadata: {},
      };
      this.turns.set(id, turn);
    }

    turn.stages[stageName] = now;
    if (extra && Object.keys(extra).length > 0) {
      turn.metadata = { ...turn.metadata, ...extra };
    }
  }

  /**
   * Finalize and compute turn metrics.
   * @param {string|number} turnId
   * @param {string} status - 'completed' | 'interrupted' | 'failed'
   * @returns {object} Calculated TurnMetrics
   */
  completeTurn(turnId, status = 'completed') {
    const id = String(turnId);
    const turn = this.turns.get(id);
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

    if (!turn) return null;

    const s = turn.stages;
    const speechEnd = s.speech_end || turn.startTime;

    const sttMs = (s.stt_end && s.stt_start) ? Math.max(0, Math.round(s.stt_end - s.stt_start)) : 0;
    const intentMs = (s.intent_end && s.intent_start) ? Math.max(0, Math.round(s.intent_end - s.intent_start)) : 0;
    const toolMs = (s.tool_end && s.tool_start) ? Math.max(0, Math.round(s.tool_end - s.tool_start)) : 0;
    const llmMs = (s.llm_end && s.llm_start) ? Math.max(0, Math.round(s.llm_end - s.llm_start)) : 0;
    const ttsMs = (s.tts_end && s.tts_start) ? Math.max(0, Math.round(s.tts_end - s.tts_start)) : 0;

    const firstAudioTime = s.audio_first_chunk || s.tts_end || now;
    const firstAudioLatencyMs = Math.max(0, Math.round(firstAudioTime - speechEnd));

    const speechCompleted = s.speech_completed || now;
    const playbackDurationMs = s.audio_first_chunk ? Math.max(0, Math.round(speechCompleted - s.audio_first_chunk)) : 0;
    const totalTurnMs = Math.max(0, Math.round(speechCompleted - speechEnd));

    const metrics = {
      turnId: id,
      status,
      timestamp: Date.now(),
      sttMs,
      intentMs,
      toolMs,
      llmMs,
      ttsMs,
      firstAudioLatencyMs,
      playbackDurationMs,
      totalTurnMs,
      metadata: turn.metadata,
    };

    this.history.unshift(metrics);
    if (this.history.length > 30) {
      this.history.pop();
    }
    this.turns.delete(id);

    if (typeof window !== 'undefined') {
      window.__islandLatencyMetrics = this.history;
    }

    if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'test') {
      console.log(
        `[Island Latency Report] Turn #${id} (${status}): FirstAudio=${firstAudioLatencyMs}ms [STT:${sttMs}ms, Intent:${intentMs}ms, Tool:${toolMs}ms, LLM:${llmMs}ms, TTS:${ttsMs}ms] Total=${totalTurnMs}ms`
      );
    }

    return metrics;
  }

  /**
   * Get history of turn metrics.
   * @returns {Array<object>}
   */
  getRecentMetrics() {
    return [...this.history];
  }

  /**
   * Get average first-audio latency across recorded turns.
   * @returns {number}
   */
  getAverageFirstAudioLatency() {
    if (this.history.length === 0) return 0;
    const sum = this.history.reduce((acc, m) => acc + (m.firstAudioLatencyMs || 0), 0);
    return Math.round(sum / this.history.length);
  }

  reset() {
    this.turns.clear();
    this.history = [];
    if (typeof window !== 'undefined') {
      window.__islandLatencyMetrics = [];
    }
  }
}

export const latencyTracker = new LatencyTracker();
export default latencyTracker;
