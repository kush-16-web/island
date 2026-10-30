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
        speech_start: now,
        speech_end: now,
        speech_endpoint: now,
      },
      metadata: { ...metadata },
    });
  }

  /**
   * Record a milestone stage in the turn.
   * Supported stages:
   * - 'speech_start': Speech start detected
   * - 'speech_endpoint': Speech endpoint detected / silence trip
   * - 'stt_start' | 'stt_end': Whisper STT start & completion
   * - 'intent_start' | 'intent_end': NLU intent resolution
   * - 'tool_start' | 'tool_end': Tool execution
   * - 'llm_start' | 'llm_first_token' | 'llm_end': LLM generation
   * - 'tts_start' | 'tts_first_audio' | 'tts_end': TTS synthesis
   * - 'audio_first_chunk': Exact moment of first audible playback (onStart)
   * - 'speech_completed': End of speech audio output (onEnded)
   *
   * @param {string|number} turnId
   * @param {string} stageName
   * @param {object} extra - Stage metadata (never private text/keys)
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
    if (stageName === 'speech_endpoint' && !turn.stages.speech_end) {
      turn.stages.speech_end = now;
    } else if (stageName === 'speech_end' && !turn.stages.speech_endpoint) {
      turn.stages.speech_endpoint = now;
    }

    if (extra && Object.keys(extra).length > 0) {
      turn.metadata = { ...turn.metadata, ...extra };
    }

    this.logDevTiming(id, stageName, extra);
  }

  /**
   * Safe development-only timing logger.
   * Strictly logs timestamps and delta latencies, NEVER private transcript text or API keys.
   */
  logDevTiming(turnId, stageName, extra = {}) {
    if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') {
      return;
    }
    const id = String(turnId);
    const turn = this.turns.get(id);
    if (!turn) return;

    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const elapsedSinceStart = Math.round(now - turn.startTime);
    const safeExtra = { ...extra };
    // Strip sensitive fields
    delete safeExtra.text;
    delete safeExtra.userText;
    delete safeExtra.transcript;
    delete safeExtra.apiKey;
    delete safeExtra.key;

    if (typeof console !== 'undefined' && console.debug) {
      console.debug(
        `[VoiceTiming] Turn #${id} [${stageName}] +${elapsedSinceStart}ms`,
        Object.keys(safeExtra).length > 0 ? safeExtra : ''
      );
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
    const speechEndpoint = s.speech_endpoint || s.speech_end || turn.startTime;
    const speechStart = s.speech_start || turn.startTime;

    const userSpeechDurationMs = Math.max(0, Math.round(speechEndpoint - speechStart));
    const sttMs = (s.stt_end && s.stt_start) ? Math.max(0, Math.round(s.stt_end - s.stt_start)) : 0;
    const intentMs = (s.intent_end && s.intent_start) ? Math.max(0, Math.round(s.intent_end - s.intent_start)) : 0;
    const toolMs = (s.tool_end && s.tool_start) ? Math.max(0, Math.round(s.tool_end - s.tool_start)) : 0;
    const llmFirstTokenMs = (s.llm_first_token && s.llm_start) ? Math.max(0, Math.round(s.llm_first_token - s.llm_start)) : null;
    const llmMs = (s.llm_end && s.llm_start) ? Math.max(0, Math.round(s.llm_end - s.llm_start)) : 0;
    const ttsFirstAudioMs = (s.tts_first_audio && s.tts_start) ? Math.max(0, Math.round(s.tts_first_audio - s.tts_start)) : null;
    const ttsMs = (s.tts_end && s.tts_start) ? Math.max(0, Math.round(s.tts_end - s.tts_start)) : 0;

    const firstAudioTime = s.audio_first_chunk || s.tts_first_audio || s.tts_end || now;
    const firstAudioLatencyMs = Math.max(0, Math.round(firstAudioTime - speechEndpoint));
    const userStopToAudioMs = firstAudioLatencyMs;

    const speechCompleted = s.speech_completed || now;
    const playbackDurationMs = s.audio_first_chunk ? Math.max(0, Math.round(speechCompleted - s.audio_first_chunk)) : 0;
    const totalTurnMs = Math.max(0, Math.round(speechCompleted - speechEndpoint));

    const metrics = {
      turnId: id,
      status,
      timestamp: Date.now(),
      userSpeechDurationMs,
      sttMs,
      intentMs,
      toolMs,
      llmFirstTokenMs,
      llmMs,
      ttsFirstAudioMs,
      ttsMs,
      firstAudioLatencyMs,
      userStopToAudioMs,
      playbackDurationMs,
      totalTurnMs,
      stages: { ...s },
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
        `[Island Latency Report] Turn #${id} (${status}): UserStopToAudio=${userStopToAudioMs}ms [STT:${sttMs}ms, LLMFirstToken:${llmFirstTokenMs ?? 'n/a'}ms, TTSFirstAudio:${ttsFirstAudioMs ?? 'n/a'}ms, TotalTTS:${ttsMs}ms] Total=${totalTurnMs}ms`
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

  /**
   * Sample event loop lag asynchronously.
   * Returns lag in milliseconds above the nominal 10ms timer delay.
   */
  async measureEventLoopLag() {
    const start = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    return new Promise((resolve) => {
      setTimeout(() => {
        const delta = ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - start;
        const lagMs = Math.max(0, Math.round(delta - 10));
        resolve(lagMs);
      }, 10);
    });
  }

  /**
   * Capture bounded runtime diagnostics snapshot (Ryzen 3 7320U, 8 GB RAM friendly).
   */
  async captureSystemSnapshot() {
    let mainSystem = null;
    if (typeof window !== 'undefined' && window.island?.getSystemDiagnostics) {
      try {
        mainSystem = await window.island.getSystemDiagnostics();
      } catch {}
    } else if (typeof process !== 'undefined' && process.memoryUsage) {
      const mem = process.memoryUsage();
      mainSystem = {
        ok: true,
        memory: {
          rssMb: Math.round((mem.rss || 0) / (1024 * 1024)),
          heapUsedMb: Math.round((mem.heapUsed || 0) / (1024 * 1024)),
        },
      };
    }

    let rendererHeapMb = null;
    if (typeof performance !== 'undefined' && performance.memory) {
      rendererHeapMb = Math.round(performance.memory.usedJSHeapSize / (1024 * 1024));
    }

    const eventLoopLagMs = await this.measureEventLoopLag();

    return {
      timestamp: Date.now(),
      mainProcess: mainSystem,
      rendererHeapMb,
      eventLoopLagMs,
    };
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
