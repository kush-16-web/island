/**
 * src/lib/audio/sentence-chunk-player.js
 * High-performance, ordered Sentence/Phrase Chunk Audio Player for Island (Phase 3).
 *
 * Capabilities:
 * 1. Ordered Playback: Guarantees chunk N plays before chunk N+1 regardless of synthesis arrival time.
 * 2. Low Startup Latency: Begins synthesizing and playing chunk 0 while subsequent chunks are still streaming.
 * 3. Zero-Overlap & Seamless Handoff: Next chunk plays immediately when previous chunk finishes.
 * 4. Safe Interruption: Aborts pending audio and discards all remaining chunks on user barge-in.
 * 5. Memory-Conscious: Holds only active turn chunks and releases decoded audio buffers upon playback completion.
 */

import { playNativeWavBase64, stopActivePlayback } from './native-audio-player.js';

export class SentenceChunkPlayer {
  constructor() {
    this.activeTurnId = null;
    this.chunks = []; // Ordered list: { index, text, isFinal, audioBase64, state: 'pending'|'ready'|'playing'|'done' }
    this.nextPlayIndex = 0;
    this.isPlaying = false;
    this.isCancelled = false;
    this.synthesizeFn = null;
    this.onFirstAudioCallback = null;
    this.onEndedCallback = null;
    this.onErrorCallback = null;
    this.firstAudioReported = false;
    this.sessionTimeoutId = null;
  }

  /**
   * Start a new chunked audio session for the specified turn.
   */
  startSession(turnId, { synthesizeChunk, onFirstAudio, onEnded, onError } = {}) {
    this.cancel(); // Stop any existing playback and flush queue

    this.activeTurnId = String(turnId);
    this.chunks = [];
    this.nextPlayIndex = 0;
    this.isPlaying = false;
    this.isCancelled = false;
    this.firstAudioReported = false;
    this.synthesizeFn = synthesizeChunk || null;
    this.onFirstAudioCallback = onFirstAudio || null;
    this.onEndedCallback = onEnded || null;
    this.onErrorCallback = onError || null;

    // Phase 3.5 Bounded Session Watchdog:
    // Guarantees onEndedCallback is resolved within 25 seconds even if synthesis or playback stalls
    if (this.sessionTimeoutId) {
      clearTimeout(this.sessionTimeoutId);
    }
    this.sessionTimeoutId = setTimeout(() => {
      if (!this.isCancelled && (this.isPlaying || this.nextPlayIndex < this.chunks.length)) {
        console.warn(`[SentenceChunkPlayer] Session timeout reached for turn ${this.activeTurnId}, forcing completion.`);
        this._notifyEnded();
      }
    }, 25000);
  }

  /**
   * Enqueue a newly arrived sentence or clause chunk.
   * Immediately triggers parallel synthesis in the background.
   */
  async enqueueChunk({ index, text, isFinal = false }) {
    if (this.isCancelled || !text || !text.trim()) {
      if (isFinal && !this.isPlaying && this.nextPlayIndex >= this.chunks.length) {
        this._notifyEnded();
      }
      return;
    }

    const chunkObj = {
      index,
      text: text.trim(),
      isFinal: Boolean(isFinal),
      audioBase64: null,
      state: 'pending',
    };

    // Keep chunks array sorted by chunk index
    this.chunks.push(chunkObj);
    this.chunks.sort((a, b) => a.index - b.index);

    // Proactively synthesize this chunk immediately
    if (this.synthesizeFn) {
      try {
        const audioBase64 = await this.synthesizeFn(chunkObj.text, chunkObj.index);
        if (this.isCancelled) return;

        if (audioBase64) {
          chunkObj.audioBase64 = audioBase64;
          chunkObj.state = 'ready';
          this._tryPlayNext();
        } else {
          // Synthesis produced no audio (e.g. punctuation-only or silence)
          chunkObj.state = 'done';
          this._tryPlayNext();
        }
      } catch (err) {
        if (this.isCancelled) return;
        chunkObj.state = 'error';
        if (this.onErrorCallback) {
          this.onErrorCallback(err, chunkObj);
        }
        this._tryPlayNext();
      }
    }
  }

  /**
   * Check if the next in-order chunk is ready and begin playback.
   */
  async _tryPlayNext() {
    if (this.isPlaying || this.isCancelled) return;

    // Find the next chunk by sequential index
    const nextChunk = this.chunks.find((c) => c.index === this.nextPlayIndex);
    if (!nextChunk) {
      // Check if all chunks are done
      const allDone = this.chunks.length > 0 &&
        this.chunks.every((c) => c.state === 'done' || c.state === 'error');
      const hasFinal = this.chunks.some((c) => c.isFinal);
      if (allDone && hasFinal) {
        this._notifyEnded();
      }
      return;
    }

    if (nextChunk.state === 'pending') {
      // Next chunk is still synthesizing; wait for it
      return;
    }

    if (nextChunk.state === 'done' || nextChunk.state === 'error') {
      // Skip empty or failed chunk and proceed
      this.nextPlayIndex++;
      this._tryPlayNext();
      return;
    }

    if (nextChunk.state === 'ready' && nextChunk.audioBase64) {
      this.isPlaying = true;
      nextChunk.state = 'playing';

      const isFirst = !this.firstAudioReported;

      try {
        // Safe playback with 12s per-chunk timeout so audio driver hang does not freeze session
        await Promise.race([
          playNativeWavBase64(nextChunk.audioBase64, {
            onStart: () => {
              if (this.isCancelled) {
                stopActivePlayback();
                return;
              }
              if (isFirst) {
                this.firstAudioReported = true;
                if (this.onFirstAudioCallback) {
                  this.onFirstAudioCallback(nextChunk);
                }
              }
            },
            onEnded: () => {
              // Audio finished playing
            },
          }),
          new Promise((resolve) => setTimeout(resolve, 12000)),
        ]);
      } catch (playErr) {
        console.warn('[SentenceChunkPlayer] Playback chunk error:', playErr);
      } finally {
        // Release audio buffer from memory
        nextChunk.audioBase64 = null;
        nextChunk.state = 'done';
        this.isPlaying = false;
      }

      if (this.isCancelled) return;

      this.nextPlayIndex++;

      // Check if this was the final chunk
      const hasMore = this.chunks.some((c) => c.index >= this.nextPlayIndex);
      const hasFinal = this.chunks.some((c) => c.isFinal && c.index < this.nextPlayIndex);

      if (!hasMore && hasFinal) {
        this._notifyEnded();
      } else {
        this._tryPlayNext();
      }
    }
  }

  _notifyEnded() {
    if (this.sessionTimeoutId) {
      clearTimeout(this.sessionTimeoutId);
      this.sessionTimeoutId = null;
    }
    if (this.onEndedCallback && !this.isCancelled) {
      const cb = this.onEndedCallback;
      this.onEndedCallback = null;
      cb();
    }
  }

  /**
   * Cancel all pending chunks and active audio immediately.
   */
  cancel() {
    if (this.sessionTimeoutId) {
      clearTimeout(this.sessionTimeoutId);
      this.sessionTimeoutId = null;
    }
    this.isCancelled = true;
    this.isPlaying = false;
    stopActivePlayback();
    for (const c of this.chunks) {
      c.audioBase64 = null;
      c.state = 'done';
    }
    this.chunks = [];
    this.activeTurnId = null;
    this.onFirstAudioCallback = null;
    this.onEndedCallback = null;
    this.onErrorCallback = null;
  }

  getQueueState() {
    return {
      activeTurnId: this.activeTurnId,
      isPlaying: this.isPlaying,
      isCancelled: this.isCancelled,
      nextPlayIndex: this.nextPlayIndex,
      chunkCount: this.chunks.length,
      chunks: this.chunks.map((c) => ({ index: c.index, state: c.state, isFinal: c.isFinal })),
    };
  }
}

export const sentenceChunkPlayer = new SentenceChunkPlayer();
export default sentenceChunkPlayer;
