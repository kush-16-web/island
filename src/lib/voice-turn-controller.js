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
export class VoiceTurnController {
  constructor(options = {}) {
    this.state = 'idle';
    this.speechThreshold = options.speechThreshold ?? 0.02;
    this.interruptThreshold = options.interruptThreshold ?? 0.045;
    this.silenceDurationMs = options.silenceDurationMs ?? 1400;
    this.minUtteranceDurationMs = options.minUtteranceDurationMs ?? 400;
    this.sampleRate = options.sampleRate ?? 16000;
    this.preSpeechBufferLimit = options.preSpeechBufferLimit ?? 4; // ~512ms at 2048 samples/frame

    this.turnId = 0;
    this.isProcessing = false;
    this.isSpeaking = false;
    this.isUserSpeaking = false;

    this.preSpeechRingBuffer = [];
    this.accumulatedChunks = [];
    this.silenceTimer = null;
    this.cooldownTimer = null;
    this.cooldownEndMs = 0;
    this.cooldownSeconds = 0;

    // Listeners
    this.onStateChange = options.onStateChange || null;
    this.onTurnTriggered = options.onTurnTriggered || null;
    this.onCooldownTick = options.onCooldownTick || null;
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
    this.preSpeechRingBuffer = [];
    this.accumulatedChunks = [];
    this.isProcessing = false;
    this.isSpeaking = false;
    this.isUserSpeaking = false;
    this.setState('listening');
  }

  /**
   * Stop session: cleans up timers and resets to idle.
   */
  stopSession() {
    this.clearSilenceTimer();
    this.clearCooldownTimer();
    this.preSpeechRingBuffer = [];
    this.accumulatedChunks = [];
    this.isProcessing = false;
    this.isSpeaking = false;
    this.isUserSpeaking = false;
    this.turnId += 1; // Invalidate any in-flight turns
    this.setState('idle');
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

    // 3. In-flight lock guard
    if (this.isProcessing) {
      return false;
    }

    // 4. Voice Activity Detection (VAD)
    const chunk = new Float32Array(inputData);

    if (rms > this.speechThreshold) {
      // User is actively speaking
      this.clearSilenceTimer();

      if (!this.isUserSpeaking) {
        // Transition to active speech: prepend pre-speech buffer to avoid clipped word onsets
        this.isUserSpeaking = true;
        this.accumulatedChunks = [...this.preSpeechRingBuffer];
        this.preSpeechRingBuffer = [];
      }

      this.accumulatedChunks.push(chunk);
    } else if (this.isUserSpeaking) {
      // Trailing pause or quiet sound during a turn
      this.accumulatedChunks.push(chunk);

      // Start silence timer if not already ticking
      if (!this.silenceTimer) {
        this.silenceTimer = setTimeout(() => {
          this.onSilenceTimeout();
        }, this.silenceDurationMs);
      }
    } else {
      // User is not speaking: maintain rolling pre-speech ring buffer
      this.preSpeechRingBuffer.push(chunk);
      if (this.preSpeechRingBuffer.length > this.preSpeechBufferLimit) {
        this.preSpeechRingBuffer.shift();
      }
    }

    return true;
  }

  /**
   * Silence timer fired: user finished speaking.
   */
  onSilenceTimeout() {
    this.silenceTimer = null;
    this.isUserSpeaking = false;

    // Check in-flight lock
    if (this.isProcessing || this.state !== 'listening') {
      this.accumulatedChunks = [];
      return;
    }

    // Flatten chunks
    const totalSamples = this.accumulatedChunks.reduce((acc, c) => acc + c.length, 0);
    const durationMs = (totalSamples / this.sampleRate) * 1000;

    if (durationMs < this.minUtteranceDurationMs) {
      // Utterance too brief (e.g. ambient mic pop), discard and stay in listening
      this.accumulatedChunks = [];
      return;
    }

    const flatSamples = new Float32Array(totalSamples);
    let offset = 0;
    for (const c of this.accumulatedChunks) {
      flatSamples.set(c, offset);
      offset += c.length;
    }
    this.accumulatedChunks = [];

    // Trigger turn submission
    this.startTurn(flatSamples);
  }

  /**
   * Acquire in-flight lock, increment turnId, and transition to 'processing'.
   */
  startTurn(samples) {
    if (this.isProcessing || this.state === 'cooldown' || this.state === 'idle') return null;

    this.isProcessing = true;
    this.turnId += 1;
    const currentTurnId = this.turnId;

    this.setState('processing', { turnId: currentTurnId });

    if (this.onTurnTriggered) {
      this.onTurnTriggered(samples, currentTurnId);
    }

    return currentTurnId;
  }

  /**
   * Call when assistant speech playback begins.
   */
  beginSpeaking(turnId) {
    if (turnId !== undefined && turnId !== this.turnId) {
      return false; // Stale turn
    }
    this.isProcessing = false;
    this.isSpeaking = true;
    this.preSpeechRingBuffer = [];
    this.accumulatedChunks = [];
    this.setState('speaking', { turnId });
    return true;
  }

  /**
   * Call when assistant speech playback finishes.
   */
  finishSpeaking(turnId) {
    if (turnId !== undefined && turnId !== this.turnId) {
      return false; // Stale turn
    }
    this.isSpeaking = false;
    if (this.state === 'speaking') {
      this.setState('listening');
    }
    return true;
  }

  /**
   * Interrupt assistant speaking immediately.
   */
  interrupt() {
    this.isSpeaking = false;
    this.isProcessing = false;
    this.accumulatedChunks = [];
    this.preSpeechRingBuffer = [];
    this.clearSilenceTimer();
    this.setState('listening');
  }

  /**
   * Turn failed or was rejected.
   */
  handleTurnFailure(turnId, error, { retryDelaySeconds = 0 } = {}) {
    if (turnId !== undefined && turnId !== this.turnId) {
      return false; // Discard stale error
    }

    this.isProcessing = false;
    this.isSpeaking = false;
    this.accumulatedChunks = [];

    if (retryDelaySeconds > 0) {
      this.enterCooldown(retryDelaySeconds, error);
    } else {
      this.setState('error', { error, turnId });
    }
    return true;
  }

  /**
   * Enter model 429 rate-limit cooldown.
   */
  enterCooldown(seconds, reason = 'Rate limit cooldown') {
    this.clearSilenceTimer();
    this.clearCooldownTimer();
    this.isProcessing = false;
    this.isSpeaking = false;
    this.isUserSpeaking = false;
    this.accumulatedChunks = [];
    this.preSpeechRingBuffer = [];

    this.cooldownSeconds = Math.max(1, Math.ceil(seconds));
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
   * Checks whether the given turnId is still active.
   */
  isTurnActive(turnId) {
    return this.turnId === turnId && this.state !== 'idle';
  }
}
