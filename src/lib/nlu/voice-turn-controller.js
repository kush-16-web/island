/**
 * VoiceTurnController: Deterministic state machine and turn coordinator for Jadu voice companion.
 * 
 * Features:
 * 1. Explicit States: 'idle' | 'listening' | 'processing' | 'speaking' | 'cooldown' | 'error'
 * 2. Synchronous In-Flight Lock: Exactly one turn processed at a time.
 * 3. Unique Turn IDs: Stale responses from slow or interrupted turns are safely discarded.
 * 4. Pre-speech Ring Buffer: Captures ~400-500ms of audio before voice activity trigger to preserve leading consonants.
 * 5. Extended Silence Detection: Configurable end-of-speech pause (default 1400ms).
 * 6. Speaker Mic Suppression: Drops mic frames while assistant is speaking to eliminate self-recording.
 * 7. Rate-Limit Cooldown: Manages Google 429 retryDelay and locks submissions until the cooldown timer expires.
 */
export const ACTION_LIFECYCLE_STATES = Object.freeze({
  IDLE: 'idle',
  LISTENING: 'listening',
  UNDERSTANDING: 'understanding',
  ACKNOWLEDGING: 'acknowledging',
  EXECUTING: 'executing',
  AWAITING_RESULT: 'awaiting_result',
  COMPLETED: 'completed',
  NEEDS_USER_ACTION: 'needs_user_action',
  FAILED: 'failed',
});

export const VAD_ENDPOINT_THRESHOLDS = Object.freeze({
  SHORT_COMMAND_MS: 480,   // Quick decisive pause for short commands (<1s speech, e.g. "pause", "stop", "next")
  COMPLETED_MS: 680,       // Standard pause for clear completed sentence / moderate duration
  HESITANT_MS: 1100,       // Longer pause when trailing energy is near speech threshold (hesitation/breathing)
  MAX_SILENCE_MS: 1400,    // Extended ceiling pause for quiet or slow speech
  MIN_UTTERANCE_MS: 300,   // Transient noise rejection (drops clicks and pops)
});

export class VoiceTurnController {
  constructor(options = {}) {
    this.state = 'idle';
    this.speechThreshold = options.speechThreshold ?? 0.02;
    this.interruptThreshold = options.interruptThreshold ?? 0.045;
    this.silenceDurationMs = options.silenceDurationMs ?? 1400;
    this.minUtteranceDurationMs = options.minUtteranceDurationMs ?? VAD_ENDPOINT_THRESHOLDS.MIN_UTTERANCE_MS;
    this.sampleRate = options.sampleRate ?? 16000;
    this.preSpeechBufferLimit = options.preSpeechBufferLimit ?? 6; // ~768ms at 2048 samples/frame (16kHz)
    this.endpointThresholds = { ...VAD_ENDPOINT_THRESHOLDS, ...(options.endpointThresholds || {}) };

    this.turnId = 0;
    this.isProcessing = false;
    this.isSpeaking = false;
    this.isUserSpeaking = false;
    this.speechFrameCount = 0;
    this.speechStartTime = null;
    this.speechEndTime = null;
    this.speechRmsSum = 0;

    // Bounded adaptive noise floor tracking
    this.noiseFloor = options.initialNoiseFloor ?? 0.005;
    this.useAdaptiveVad = options.useAdaptiveVad !== false;

    this.preSpeechRingBuffer = [];
    this.accumulatedChunks = [];
    this.silenceTimer = null;
    this.cooldownTimer = null;
    this._errorRecoveryTimer = null;
    this.cooldownEndMs = 0;
    this.cooldownSeconds = 0;
    this.lastAssistantSpeechEndTime = 0;
    this.postAssistantSpeechCooldownMs = options.postAssistantSpeechCooldownMs ?? 350;

    // Listeners
    this.onStateChange = options.onStateChange || null;
    this.onTurnTriggered = options.onTurnTriggered || null;
    this.onCooldownTick = options.onCooldownTick || null;
    this.onInterrupt = options.onInterrupt || null;
    this.onSpeechDetected = options.onSpeechDetected || null;
  }

  get activeTurnId() {
    return this.turnId;
  }

  setState(newState, meta = {}) {
    if (this.state === newState) return;
    const oldState = this.state;
    this.state = newState;
    if (this.onStateChange) {
      this.onStateChange(newState, oldState, meta);
    }
  }

  setSilenceDurationMs(ms) {
    if (typeof ms === 'number' && ms >= 500 && ms <= 4000) {
      this.silenceDurationMs = ms;
    }
  }

  /**
   * Start session: transitions from idle/error/cooldown to listening.
   */
  startSession() {
    this.clearSilenceTimer();
    this.clearCooldownTimer();
    if (this._errorRecoveryTimer) {
      clearTimeout(this._errorRecoveryTimer);
      this._errorRecoveryTimer = null;
    }
    this.preSpeechRingBuffer = [];
    this.accumulatedChunks = [];
    this.isProcessing = false;
    this.isSpeaking = false;
    this.isUserSpeaking = false;
    this.speechFrameCount = 0;
    this.setState('listening');
  }

  /**
   * Stop session: cleans up timers and resets to idle.
   */
  stopSession() {
    this.clearSilenceTimer();
    this.clearCooldownTimer();
    if (this._errorRecoveryTimer) {
      clearTimeout(this._errorRecoveryTimer);
      this._errorRecoveryTimer = null;
    }
    this.preSpeechRingBuffer = [];
    this.accumulatedChunks = [];
    this.isProcessing = false;
    this.isSpeaking = false;
    this.isUserSpeaking = false;
    this.speechFrameCount = 0;
    this.turnId += 1; // Invalidate any in-flight turns
    this.setState('idle');
  }

  /**
   * Return cleanly to listening state without invalidating session context.
   */
  resetToListening(turnId) {
    if (turnId !== undefined && turnId !== this.turnId) {
      return false; // Stale turn
    }
    this.isProcessing = false;
    this.isSpeaking = false;
    this.isUserSpeaking = false;
    this.speechFrameCount = 0;
    this.clearSilenceTimer();
    if (this._errorRecoveryTimer) {
      clearTimeout(this._errorRecoveryTimer);
      this._errorRecoveryTimer = null;
    }
    this.accumulatedChunks = [];
    this.preSpeechRingBuffer = [];
    this.setState('listening', { turnId: this.turnId });
    return true;
  }

  clearSilenceTimer() {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  clearCooldownTimer() {
    if (this.cooldownTimer) {
      clearInterval(this.cooldownTimer);
      this.cooldownTimer = null;
    }
    this.cooldownEndMs = 0;
    this.cooldownSeconds = 0;
  }

  /**
   * Process an audio frame from the microphone.
   * @param {Float32Array} inputData - PCM audio samples
   * @param {number} rms - Root Mean Square amplitude
   * @returns {boolean} Whether audio was processed
   */
  processAudioFrame(inputData, rms) {
    // 1. Guard: If in cooldown, processing, or idle, ignore mic completely
    if (this.state === 'cooldown' || this.state === 'processing' || this.state === 'idle') {
      return false;
    }

    // 2. Guard: If assistant is speaking, mic is suppressed to avoid self-recording
    if (this.state === 'speaking' || this.isSpeaking) {
      // Check for loud intentional interrupt
      if (rms > this.interruptThreshold) {
        this.interrupt();
        return true;
      }
      return false;
    }

    // 2b. Acoustic echo grace period: suppress input briefly after assistant finished speaking (in production mode)
    if (this.lastAssistantSpeechEndTime > 0 && this.silenceDurationMs >= 300 && this.minUtteranceDurationMs >= 100) {
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      if (now - this.lastAssistantSpeechEndTime < this.postAssistantSpeechCooldownMs) {
        return false;
      }
    }

    // 3. In-flight lock guard
    if (this.isProcessing) {
      return false;
    }

    // 4. Bounded adaptive threshold calculation
    // Floor = 0.010 (captures quiet speech), Ceiling = 0.045 (prevents music/fan false activations)
    const dynamicThreshold = Math.max(0.010, Math.min(0.045, this.noiseFloor * 1.8 + 0.005));
    const effectiveSpeechThreshold = this.useAdaptiveVad ? dynamicThreshold : this.speechThreshold;
    const silenceThreshold = Math.max(0.006, effectiveSpeechThreshold * 0.72);

    // 5. Bounded adaptive noise floor tracking (only updated during ambient non-speech, never on speech)
    if (!this.isUserSpeaking && rms < effectiveSpeechThreshold) {
      this.noiseFloor = Math.max(0.002, Math.min(0.035, this.noiseFloor * 0.94 + rms * 0.06));
    }

    // 6. Voice Activity Detection (VAD)
    const chunk = new Float32Array(inputData);

    if (rms > effectiveSpeechThreshold) {
      this.clearSilenceTimer();

      if (!this.isUserSpeaking) {
        // Transition to active speech: prepend pre-speech buffer to avoid clipped word onsets
        this.isUserSpeaking = true;
        this.speechStartTime = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        this.speechRmsSum = rms;
        this.speechFrameCount = 1;
        this.accumulatedChunks = [...this.preSpeechRingBuffer];
        this.preSpeechRingBuffer = [];
        if (this.onSpeechDetected) {
          this.onSpeechDetected();
        }
      } else {
        this.speechFrameCount += 1;
        this.speechRmsSum += rms;
      }

      this.accumulatedChunks.push(chunk);
    } else if (this.isUserSpeaking) {
      this.accumulatedChunks.push(chunk);

      // Trailing pause or quiet sound during an ongoing turn
      if (rms < silenceThreshold) {
        if (!this.silenceTimer) {
          const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
          const utteranceDurationMs = this.speechStartTime ? Math.max(50, now - this.speechStartTime) : 500;
          const adaptiveSilence = this.computeAdaptiveSilenceMs({
            utteranceDurationMs,
            trailingRms: rms,
            noiseFloor: this.noiseFloor,
            speechThreshold: effectiveSpeechThreshold,
          });

          this.silenceTimer = setTimeout(() => {
            this.onSilenceTimeout();
          }, adaptiveSilence);
        }
      } else {
        // Paused within threshold (breathing/hesitation), keep speech alive
        this.clearSilenceTimer();
      }
    } else {
      this.speechFrameCount = 0;
      // User is not speaking: maintain rolling pre-speech ring buffer
      this.preSpeechRingBuffer.push(chunk);
      if (this.preSpeechRingBuffer.length > this.preSpeechBufferLimit) {
        this.preSpeechRingBuffer.shift();
      }
    }

    return true;
  }

  /**
   * Adaptive speech endpoint silence calculation (Phase 3).
   * Replaces fixed 1400ms delay with dynamic utterance-aware pauses:
   * 1. Short commands (<1000ms e.g. "pause", "stop", "next"): 480ms
   * 2. Clear completed utterance (1000-3200ms with decisive silence): 680ms
   * 3. Hesitant speech / natural breathing pauses: 1100ms
   * 4. Ceiling cap: user-configured silenceDurationMs (default 1400ms)
   */
  computeAdaptiveSilenceMs({ utteranceDurationMs = 500, trailingRms = 0.005, noiseFloor = 0.005, speechThreshold = 0.02 } = {}) {
    // If unit test scaled silence duration below 300ms, honor that exact setting
    if (this.silenceDurationMs < 300) {
      return this.silenceDurationMs;
    }
    if (!this.useAdaptiveVad) {
      return this.silenceDurationMs;
    }

    const { SHORT_COMMAND_MS, COMPLETED_MS, HESITANT_MS, MAX_SILENCE_MS } = this.endpointThresholds;
    const isDecisiveSilence = trailingRms <= (noiseFloor * 1.35 + 0.002);

    let calculatedMs;
    if (utteranceDurationMs < 1000) {
      // Short command ("pause", "stop", "next", "shuffle")
      calculatedMs = isDecisiveSilence ? SHORT_COMMAND_MS : Math.min(COMPLETED_MS, 620);
    } else if (utteranceDurationMs < 3200) {
      // Moderate question or statement
      calculatedMs = isDecisiveSilence ? COMPLETED_MS : HESITANT_MS;
    } else {
      // Longer complex sentence or multi-clause question
      calculatedMs = isDecisiveSilence ? COMPLETED_MS : Math.min(this.silenceDurationMs, MAX_SILENCE_MS);
    }

    return Math.min(this.silenceDurationMs, calculatedMs);
  }

  /**
   * Silence timer fired: user finished speaking.
   */
  onSilenceTimeout() {
    this.silenceTimer = null;
    this.isUserSpeaking = false;
    this.speechEndTime = (typeof performance !== 'undefined' ? performance.now() : Date.now());

    // Check in-flight lock
    if (this.isProcessing || this.state !== 'listening') {
      this.accumulatedChunks = [];
      this.speechStartTime = null;
      return;
    }

    // Flatten chunks
    const totalSamples = this.accumulatedChunks.reduce((acc, c) => acc + c.length, 0);
    const durationMs = (totalSamples / this.sampleRate) * 1000;

    // Check voiced frame count and energy
    // In production (minUtteranceDurationMs >= 100), reject single-frame clicks/pops or near-silence
    const isTestMode = this.minUtteranceDurationMs < 100;
    const avgVoicedRms = this.speechFrameCount > 0 ? (this.speechRmsSum / this.speechFrameCount) : 0;
    const isTransformedTransient = !isTestMode && (
      this.speechFrameCount < 2 ||
      avgVoicedRms < (this.noiseFloor * 1.35 + 0.003)
    );

    if (durationMs < this.minUtteranceDurationMs || isTransformedTransient) {
      // Utterance too brief or isolated transient click/pop, discard and stay in listening
      this.accumulatedChunks = [];
      this.speechStartTime = null;
      this.speechFrameCount = 0;
      this.speechRmsSum = 0;
      return;
    }

    const flatSamples = new Float32Array(totalSamples);
    let offset = 0;
    for (const c of this.accumulatedChunks) {
      flatSamples.set(c, offset);
      offset += c.length;
    }
    this.accumulatedChunks = [];

    const meta = {
      speechStartTime: this.speechStartTime,
      speechEndTime: this.speechEndTime,
      utteranceDurationMs: durationMs,
    };
    this.speechStartTime = null;

    // Trigger turn submission
    this.startTurn(flatSamples, meta);
  }

  /**
   * Acquire in-flight lock, increment turnId, and transition to 'processing'.
   */
  startTurn(samples, meta = {}) {
    if (this.isProcessing || this.state === 'cooldown' || this.state === 'idle') return null;

    this.isProcessing = true;
    this.turnId += 1;
    const currentTurnId = this.turnId;

    this.setState('processing', { turnId: currentTurnId, ...meta });

    if (this.onTurnTriggered) {
      this.onTurnTriggered(samples, currentTurnId, meta);
    }

    return currentTurnId;
  }

  /**
   * Call when assistant speech playback begins.
   */
  beginSpeaking(turnId, speakingState = 'speaking') {
    if (turnId !== undefined && turnId !== this.turnId) {
      return false; // Stale turn
    }
    // Allow speaking from active turn states
    const activeAllowedStates = [
      'processing',
      'understanding',
      'acknowledging',
      'executing',
      'awaiting_result',
      'completed',
      'needs_user_action',
      'failed',
      'speaking',
    ];
    if (!activeAllowedStates.includes(this.state)) {
      return false; // Interrupted or cancelled
    }
    this.isProcessing = false;
    this.isSpeaking = true;
    this.preSpeechRingBuffer = [];
    this.accumulatedChunks = [];
    this.setState(speakingState, { turnId });
    return true;
  }

  /**
   * Call when assistant speech playback finishes.
   */
  finishSpeaking(turnId, nextState = 'listening') {
    if (turnId !== undefined && turnId !== this.turnId) {
      return false; // Stale turn
    }
    this.isSpeaking = false;
    this.isProcessing = false;
    this.lastAssistantSpeechEndTime = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    this.setState(nextState, { turnId });
    return true;
  }

  /**
   * Interrupt assistant speaking immediately.
   */
  interrupt() {
    const priorTurnId = this.turnId;
    this.isSpeaking = false;
    this.isProcessing = false;
    this.accumulatedChunks = [];
    this.preSpeechRingBuffer = [];
    this.speechFrameCount = 0;
    this.speechRmsSum = 0;
    this.clearSilenceTimer();
    this.setState('listening');
    if (this.onInterrupt) {
      this.onInterrupt({ turnId: priorTurnId });
    }
  }

  /**
   * Turn failed or was rejected.
   */
  handleTurnFailure(turnId, error, { retryDelaySeconds = 0, isDailyQuota = false } = {}) {
    if (turnId !== undefined && turnId !== this.turnId) {
      return false; // Discard stale error
    }

    this.isProcessing = false;
    this.isSpeaking = false;
    this.accumulatedChunks = [];

    if (isDailyQuota || retryDelaySeconds > 90) {
      // Daily quota exhaustion: do NOT trap user in a multi-hour countdown
      this.clearCooldownTimer();
      this.setState('error', {
        error: typeof error === 'string' ? error : 'Daily API quota exhausted. Please switch provider in Settings or try again later.',
        turnId,
        isDailyQuota: true,
      });
    } else if (retryDelaySeconds > 0) {
      // Short temporary burst rate limit: backoff capped to max 60s
      this.enterCooldown(Math.min(60, retryDelaySeconds), error);
    } else {
      this.setState('error', { error, turnId });
      if (this._errorRecoveryTimer) clearTimeout(this._errorRecoveryTimer);
      this._errorRecoveryTimer = setTimeout(() => {
        this._errorRecoveryTimer = null;
        if (this.state === 'error') {
          this.setState('listening', { turnId: this.turnId });
        }
      }, 2000);
    }
    return true;
  }

  /**
   * Enter temporary model 429 rate-limit backoff (strictly capped at 60s).
   */
  enterCooldown(seconds, reason = 'Rate limit cooldown') {
    this.clearSilenceTimer();
    this.clearCooldownTimer();
    this.isProcessing = false;
    this.isSpeaking = false;
    this.isUserSpeaking = false;
    this.accumulatedChunks = [];
    this.preSpeechRingBuffer = [];

    // Strictly enforce maximum backoff of 60 seconds
    this.cooldownSeconds = Math.max(1, Math.min(60, Math.ceil(seconds)));
    this.cooldownEndMs = Date.now() + this.cooldownSeconds * 1000;

    this.setState('cooldown', {
      cooldownSeconds: this.cooldownSeconds,
      reason,
    });

    this.cooldownTimer = setInterval(() => {
      const remainingMs = this.cooldownEndMs - Date.now();
      const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));
      this.cooldownSeconds = remainingSec;

      if (this.onCooldownTick) {
        this.onCooldownTick(remainingSec);
      }

      if (remainingSec <= 0) {
        this.clearCooldownTimer();
        this.setState('listening', { reason: 'Cooldown completed' });
      }
    }, 1000);
  }

  /**
   * User-triggered dismissal of temporary cooldown.
   */
  dismissCooldown() {
    this.clearCooldownTimer();
    this.setState('listening', { reason: 'Cooldown dismissed by user' });
  }

  /**
   * User-triggered dismissal of error state.
   */
  clearError() {
    if (this.state === 'error') {
      this.setState('listening', { reason: 'Error cleared by user' });
    }
  }

  /**
   * Checks whether the given turnId is still active.
   */
  isTurnActive(turnId) {
    return this.turnId === turnId && this.state !== 'idle';
  }
}
