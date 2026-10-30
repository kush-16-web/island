/**
 * audio-coordinator.js: Centralized audio coordinator for Island.
 *
 * Scope & Capabilities:
 * 1. Application-Level Volume & WebAudio Gain:
 *    - Controls Island's internal Web Audio gain nodes (voice responses, local sound effects).
 *    - Never modifies global Windows master volume (IAudioEndpointVolume).
 * 2. Volume Ownership:
 *    - Never overwrites user's base volume to perform ducking.
 *    - baseVolume: User-selected preferred volume [0.0 - 1.0] (default 0.70).
 *    - duckingMultiplier: Temporary assistant multiplier [0.0 - 1.0] (default 1.0).
 *    - effectiveVolume: baseVolume * duckingMultiplier.
 * 3. Dynamic Adjustment:
 *    - If user changes volume while assistant speaks, base volume updates immediately
 *      and ducked volume reflects the new base volume.
 *    - When speech ends, restored volume returns to the NEW user volume.
 * 4. Transitions:
 *    - Duck down: ~250ms smooth transition to ~22% (0.22).
 *    - Fade up after speech: ~1100ms smooth transition back to 100% (1.0).
 * 5. Interruption & Cancellation:
 *    - Sequence-tagged transitions discard stale timer callbacks.
 *    - Cancelling or aborting immediately restores 100% multiplier.
 * 6. External Windows Process Boundary:
 *    - Island does not alter third-party Windows processes (Spotify, YouTube Music in Chrome, Apple Music)
 *      via fragile high-frequency PowerShell WASAPI polling, which takes 2-4 seconds to spin up,
 *      violates the 250ms timing requirement, and risks freezing or leaving third-party apps quiet.
 */

const STORAGE_KEY = 'island_user_volume';
const DEFAULT_USER_VOLUME = 0.70;
const DEFAULT_DUCK_LEVEL = 0.10; // Strong ducking (~10%) for clear voice capture
const DEFAULT_FADE_DOWN_MS = 250;
const DEFAULT_FADE_UP_MS = 1100;

class AudioCoordinator {
  constructor() {
    this.baseVolume = this._loadBaseVolume();
    this.duckingMultiplier = 1.0;
    this.duckState = 'idle'; // 'idle' | 'ducking' | 'ducked' | 'restoring'
    this.transitionSeq = 0;
    this.activeAnimFrame = null;
    this.listeners = new Set();
    this.connectedGainNode = null;
    this.connectedAudioCtx = null;

    // External browser companion & media tracking
    this.isExternalDucked = false;
    this.pausedForDucking = false;
    this.explicitPauseDuringDuck = false;
    this.preDuckMediaState = null;
  }

  _loadBaseVolume() {
    if (typeof window === 'undefined' || !window.localStorage) {
      return DEFAULT_USER_VOLUME;
    }
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved !== null) {
        const val = parseFloat(saved);
        if (Number.isFinite(val) && val >= 0 && val <= 1) {
          return val;
        }
      }
    } catch {}
    return DEFAULT_USER_VOLUME;
  }

  get effectiveVolume() {
    return Math.max(0, Math.min(1, this.baseVolume * this.duckingMultiplier));
  }

  getState() {
    return {
      baseVolume: this.baseVolume,
      duckingMultiplier: this.duckingMultiplier,
      effectiveVolume: this.effectiveVolume,
      duckState: this.duckState,
      isExternalDucked: this.isExternalDucked,
      pausedForDucking: this.pausedForDucking,
    };
  }

  /**
   * Set user preferred base volume.
   * Persists to storage and recalculates effective volume with current ducking multiplier.
   */
  setBaseVolume(volume) {
    const clamped = Math.max(0, Math.min(1, Number(volume)));
    if (!Number.isFinite(clamped)) return;

    this.baseVolume = clamped;
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem(STORAGE_KEY, String(clamped));
      } catch {}
    }

    // Inform browser companion of explicit user volume setting if connected
    if (typeof window !== 'undefined' && window.island?.companion?.dispatchCommand) {
      window.island.companion.dispatchCommand({ action: 'set_volume', level: clamped, volume: clamped }).catch(() => {});
    }

    this._applyGain();
    this._notify();
  }

  setUserVolume(volume) {
    this.setBaseVolume(volume);
  }

  getUserVolume() {
    return this.baseVolume;
  }

  /**
   * Mark that the user explicitly issued a pause/stop command during this turn,
   * so restoreVolume will NEVER accidentally resume music.
   */
  markExplicitPause() {
    this.explicitPauseDuringDuck = true;
  }

  /**
   * Start ducking the volume down smoothly when assistant begins listening or speaking.
   * Controls internal gain nodes and dispatches audible volume ducking to the YouTube Music tab.
   * If companion is unavailable, falls back to a safe temporary pause.
   */
  startDucking({ duckLevel = DEFAULT_DUCK_LEVEL, durationMs = DEFAULT_FADE_DOWN_MS, media = null } = {}) {
    // If already ducked or actively ducking to the same level, do not re-trigger
    if (this.duckState === 'ducked' || (this.duckState === 'ducking' && Math.abs(this.duckingMultiplier - duckLevel) < 0.02)) {
      return;
    }

    this._cancelActiveAnimation();
    const seq = ++this.transitionSeq;
    this.duckState = 'ducking';
    this.explicitPauseDuringDuck = false;

    if (media) {
      this.preDuckMediaState = media;
    } else if (typeof window !== 'undefined' && window.__islandMediaState) {
      this.preDuckMediaState = window.__islandMediaState;
    }

    const startMultiplier = this.duckingMultiplier;
    const targetMultiplier = Math.max(0, Math.min(1, duckLevel));
    const startTime = (typeof performance !== 'undefined' ? performance.now() : Date.now());

    // 1. Dispatch real audible ducking to YouTube Music Chrome extension
    if (typeof window !== 'undefined' && window.island?.companion?.dispatchCommand) {
      this.isExternalDucked = true;
      window.island.companion
        .dispatchCommand({
          action: 'duck',
          level: targetMultiplier,
        })
        .then((res) => {
          if (res && res.ok === false && res.status === 'no_player') {
            this.isExternalDucked = false;
          }
        })
        .catch(() => {
          this.isExternalDucked = false;
        });
    }

    // 2. Safe fallback when companion is not connected but external media is currently playing
    const activeMedia = this.preDuckMediaState;
    if (activeMedia && activeMedia.active && activeMedia.status === 'playing' && !this.isExternalDucked && !this.pausedForDucking) {
      this.pausedForDucking = true;
      if (typeof window !== 'undefined' && window.island?.media?.control) {
        window.island.media.control('pause');
      }
    }

    // 3. Hardware/WebAudio gain automation for internal Island audio
    if (this.connectedGainNode && this.connectedAudioCtx) {
      try {
        const now = this.connectedAudioCtx.currentTime;
        this.connectedGainNode.gain.cancelScheduledValues(now);
        this.connectedGainNode.gain.setValueAtTime(this.effectiveVolume, now);
        this.connectedGainNode.gain.linearRampToValueAtTime(
          this.baseVolume * targetMultiplier,
          now + durationMs / 1000
        );
      } catch {}
    }

    const step = (timestamp) => {
      if (this.transitionSeq !== seq) return; // Stale callback guard

      const elapsed = timestamp - startTime;
      const progress = Math.min(1, Math.max(0, elapsed / durationMs));
      // Ease-out curve for fast yet smooth initial volume reduction
      const eased = 1 - Math.pow(1 - progress, 2);

      this.duckingMultiplier = startMultiplier + (targetMultiplier - startMultiplier) * eased;
      this._applyGain();
      this._notify();

      if (progress < 1) {
        if (typeof requestAnimationFrame === 'function') {
          this.activeAnimFrame = requestAnimationFrame(step);
        }
      } else {
        this.duckingMultiplier = targetMultiplier;
        this.duckState = 'ducked';
        this.activeAnimFrame = null;
        this._applyGain();
        this._notify();
      }
    };

    if (durationMs <= 0 || typeof requestAnimationFrame !== 'function') {
      this.duckingMultiplier = targetMultiplier;
      this.duckState = 'ducked';
      this._applyGain();
      this._notify();
    } else {
      this.activeAnimFrame = requestAnimationFrame(step);
    }
  }

  /**
   * Restore volume smoothly back to 100% user volume after interaction finishes.
   * Restores YouTube Music tab volume and safely resumes temporary pause if appropriate.
   */
  restoreVolume({ durationMs = DEFAULT_FADE_UP_MS } = {}) {
    if (this.duckState === 'idle' && this.duckingMultiplier >= 0.99 && !this.isExternalDucked && !this.pausedForDucking) {
      return;
    }

    this._cancelActiveAnimation();
    const seq = ++this.transitionSeq;
    this.duckState = 'restoring';

    const startMultiplier = this.duckingMultiplier;
    const targetMultiplier = 1.0;
    const startTime = (typeof performance !== 'undefined' ? performance.now() : Date.now());

    // 1. Dispatch volume restoration to YouTube Music Chrome extension
    if (typeof window !== 'undefined' && window.island?.companion?.dispatchCommand) {
      window.island.companion.dispatchCommand({ action: 'restore_volume' }).catch(() => {});
    }
    this.isExternalDucked = false;

    // 2. Safe resume of temporary pause (ONLY if not explicitly paused by user during turn!)
    if (this.pausedForDucking) {
      if (!this.explicitPauseDuringDuck) {
        if (typeof window !== 'undefined' && window.island?.media?.control) {
          window.island.media.control('play');
        }
      }
      this.pausedForDucking = false;
      this.explicitPauseDuringDuck = false;
    }

    // 3. Hardware/WebAudio gain automation for internal Island audio
    if (this.connectedGainNode && this.connectedAudioCtx) {
      try {
        const now = this.connectedAudioCtx.currentTime;
        this.connectedGainNode.gain.cancelScheduledValues(now);
        this.connectedGainNode.gain.setValueAtTime(this.effectiveVolume, now);
        this.connectedGainNode.gain.linearRampToValueAtTime(
          this.baseVolume * targetMultiplier,
          now + durationMs / 1000
        );
      } catch {}
    }

    const step = (timestamp) => {
      if (this.transitionSeq !== seq) return; // Stale callback guard

      const elapsed = timestamp - startTime;
      const progress = Math.min(1, Math.max(0, elapsed / durationMs));
      // Smooth sinusoidal / ease-in-out curve for gradual volume rise
      const eased = 0.5 - Math.cos(progress * Math.PI) / 2;

      this.duckingMultiplier = startMultiplier + (targetMultiplier - startMultiplier) * eased;
      this._applyGain();
      this._notify();

      if (progress < 1) {
        if (typeof requestAnimationFrame === 'function') {
          this.activeAnimFrame = requestAnimationFrame(step);
        }
      } else {
        this.duckingMultiplier = 1.0;
        this.duckState = 'idle';
        this.activeAnimFrame = null;
        this._applyGain();
        this._notify();
      }
    };

    if (durationMs <= 0 || typeof requestAnimationFrame !== 'function') {
      this.duckingMultiplier = 1.0;
      this.duckState = 'idle';
      this._applyGain();
      this._notify();
    } else {
      this.activeAnimFrame = requestAnimationFrame(step);
    }
  }

  /**
   * Immediately abort any ducking in progress and restore 100% multiplier.
   * Called on session termination, voice interrupt, or playback failure.
   */
  cancelDucking() {
    this._cancelActiveAnimation();
    this.transitionSeq++;
    this.duckingMultiplier = 1.0;
    this.duckState = 'idle';

    if (typeof window !== 'undefined' && window.island?.companion?.dispatchCommand) {
      window.island.companion.dispatchCommand({ action: 'restore_volume' }).catch(() => {});
    }
    this.isExternalDucked = false;

    if (this.pausedForDucking) {
      if (!this.explicitPauseDuringDuck) {
        if (typeof window !== 'undefined' && window.island?.media?.control) {
          window.island.media.control('play');
        }
      }
      this.pausedForDucking = false;
      this.explicitPauseDuringDuck = false;
    }

    this._applyGain();
    this._notify();
  }


  _cancelActiveAnimation() {
    if (this.activeAnimFrame && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.activeAnimFrame);
      this.activeAnimFrame = null;
    }
  }

  connectGainNode(gainNode, audioCtx) {
    this.connectedGainNode = gainNode;
    this.connectedAudioCtx = audioCtx;
    this._applyGain();
  }

  disconnectGainNode() {
    this.connectedGainNode = null;
    this.connectedAudioCtx = null;
  }

  _applyGain() {
    if (this.connectedGainNode && this.connectedAudioCtx) {
      try {
        this.connectedGainNode.gain.setValueAtTime(
          this.effectiveVolume,
          this.connectedAudioCtx.currentTime
        );
      } catch {}
    }
  }

  subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  _notify() {
    const state = this.getState();
    this.listeners.forEach((listener) => {
      try {
        listener(state);
      } catch {}
    });

    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      try {
        window.dispatchEvent(new CustomEvent('island:volume-change', { detail: state }));
      } catch {}
    }
  }
}

export const audioCoordinator = new AudioCoordinator();
export { AudioCoordinator };
export default audioCoordinator;
