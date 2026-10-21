'use strict';
// electron/kokoro-tts.js: Isolated Kokoro Local TTS Service for Island.
// Runs off the UI thread in the Electron process.
// STRICT CONSTRAINTS:
// 1. NEVER automatically downloads model weights without explicit user action.
// 2. Keeps inference off the main UI thread.
// 3. Captures benchmark metrics: cold-start, warm-start, synthesis duration, memory usage, audio duration.
// 4. Provides explicit Stop/Cancel and clean disposal.
// 5. Preserves offline isolation and never falls back silently to cloud AI.

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

class KokoroLocalService {
  constructor() {
    this.model = null;
    this.isLoading = false;
    this.isCancelling = false;
    this.dtype = 'q8'; // Lightweight 8-bit quantized model for CPU testing
    this.currentVoice = 'af_heart';

    // Benchmark performance metrics
    this.metrics = {
      coldStartMs: null,
      warmStartMs: null,
      synthesisMs: null,
      audioDurationSec: null,
      memoryUsedMb: null,
    };

    // Dedicated local cache directory for Kokoro ONNX weights
    let basePath = process.cwd();
    try {
      if (app && typeof app.getPath === 'function') {
        basePath = app.getPath('userData');
      }
    } catch {}
    this.modelDir = path.join(basePath, 'models', 'kokoro');
  }

  /**
   * Check whether local Kokoro model files are present.
   */
  isModelInstalled() {
    try {
      if (!fs.existsSync(this.modelDir)) return false;
      const files = fs.readdirSync(this.modelDir);
      // Check for any onnx files or transformers cache folders
      return files.some((f) => f.endsWith('.onnx') || f.includes('Kokoro') || f === 'onnx-community');
    } catch {
      return false;
    }
  }

  /**
   * Return current service status and benchmark metrics.
   */
  getStatus() {
    const installed = this.isModelInstalled();
    return {
      installed,
      isLoaded: Boolean(this.model),
      isLoading: this.isLoading,
      currentVoice: this.currentVoice,
      modelDir: this.modelDir,
      metrics: { ...this.metrics },
      availableFemaleVoices: [
        { id: 'af_heart', name: 'Heart (Warm & Expressive)', lang: 'en-us' },
        { id: 'af_bella', name: 'Bella (Clear & Cheerful)', lang: 'en-us' },
        { id: 'af_nicole', name: 'Nicole (Calm & Natural)', lang: 'en-us' },
        { id: 'af_sarah', name: 'Sarah (Crisp & Friendly)', lang: 'en-us' },
        { id: 'af_sky', name: 'Sky (Gentle & Smooth)', lang: 'en-us' },
      ],
    };
  }

  /**
   * Explicit user-triggered model installation.
   * Downloads the lightweight quantized ONNX weights to the local cache directory.
   */
  async installModel(progressCallback = () => {}) {
    if (this.isLoading) {
      return { ok: false, error: 'Installation or loading is already in progress' };
    }

    this.isLoading = true;
    try {
      fs.mkdirSync(this.modelDir, { recursive: true });

      const { env } = require('@huggingface/transformers');
      const { KokoroTTS } = require('kokoro-js');

      // Enable remote downloads strictly for this explicit setup call
      env.allowRemoteModels = true;
      env.localModelPath = this.modelDir;
      env.cacheDir = this.modelDir;

      progressCallback({ status: 'downloading', message: 'Downloading lightweight Kokoro ONNX model (q8)...' });

      const startTime = performance.now();
      const model = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-ONNX', {
        dtype: this.dtype,
        progress_callback: (progress) => {
          progressCallback({ status: 'progress', progress });
        },
      });

      this.model = model;
      this.metrics.coldStartMs = Math.round(performance.now() - startTime);
      this.isLoading = false;

      return {
        ok: true,
        installed: true,
        coldStartMs: this.metrics.coldStartMs,
        message: 'Kokoro ONNX model successfully installed and cached locally.',
      };
    } catch (err) {
      this.isLoading = false;
      return {
        ok: false,
        error: `Failed to install Kokoro model: ${err.message}`,
      };
    } finally {
      // Re-lock remote downloads for safety
      try {
        const { env } = require('@huggingface/transformers');
        env.allowRemoteModels = false;
      } catch {}
    }
  }

  /**
   * Load local model into memory with cold-start timing.
   * Does NOT download weights if not installed.
   */
  async loadModel() {
    if (this.model) {
      return { ok: true, alreadyLoaded: true };
    }

    if (!this.isModelInstalled()) {
      return {
        ok: false,
        error: 'Kokoro model weights are not installed yet. Please run the setup step to install.',
      };
    }

    this.isLoading = true;
    const startTime = performance.now();

    try {
      const { env } = require('@huggingface/transformers');
      const { KokoroTTS } = require('kokoro-js');

      // Strict restriction: no automatic remote downloads
      env.allowRemoteModels = false;
      env.localModelPath = this.modelDir;
      env.cacheDir = this.modelDir;

      this.model = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-ONNX', {
        dtype: this.dtype,
        local_files_only: true,
      });

      this.metrics.coldStartMs = Math.round(performance.now() - startTime);
      this.isLoading = false;
      return {
        ok: true,
        coldStartMs: this.metrics.coldStartMs,
      };
    } catch (err) {
      this.isLoading = false;
      this.model = null;
      return {
        ok: false,
        error: `Could not load local Kokoro model: ${err.message}`,
      };
    }
  }

  /**
   * Synthesize text to speech with comprehensive benchmark measurement.
   */
  async synthesize({ text, voice = 'af_heart', speed = 1.0 }) {
    if (!text || !text.trim()) {
      return { ok: false, error: 'No text provided for synthesis' };
    }

    this.isCancelling = false;
    const isCold = !this.model;
    const memBefore = process.memoryUsage().heapUsed;

    // Ensure model is loaded
    if (!this.model) {
      const loadRes = await this.loadModel();
      if (!loadRes.ok) {
        return loadRes;
      }
    }

    if (this.isCancelling) {
      this.isCancelling = false;
      return { ok: false, error: 'Synthesis cancelled by user' };
    }

    const synthStartTime = performance.now();

    try {
      this.currentVoice = voice;
      const result = await this.model.generate(text.trim(), {
        voice,
        speed: Math.max(0.5, Math.min(2.0, Number(speed) || 1.0)),
      });

      if (this.isCancelling) {
        this.isCancelling = false;
        return { ok: false, error: 'Synthesis cancelled by user' };
      }

      const synthEndTime = performance.now();
      const synthDurationMs = Math.round(synthEndTime - synthStartTime);

      if (isCold) {
        this.metrics.synthesisMs = synthDurationMs;
      } else {
        this.metrics.warmStartMs = synthDurationMs;
        this.metrics.synthesisMs = synthDurationMs;
      }

      const memAfter = process.memoryUsage().heapUsed;
      const memDiffMb = Math.round(((memAfter - memBefore) / (1024 * 1024)) * 100) / 100;
      this.metrics.memoryUsedMb = Math.max(0, memDiffMb);

      // Extract raw audio data
      const rawAudio = result.audio; // Float32Array
      const sampleRate = result.sampling_rate || 24000;
      const durationSec = Math.round((rawAudio.length / sampleRate) * 100) / 100;
      this.metrics.audioDurationSec = durationSec;

      // Encode to 16-bit PCM WAV base64
      const wavBuffer = this._encodeWav(rawAudio, sampleRate);
      const audioBase64 = wavBuffer.toString('base64');

      return {
        ok: true,
        audioBase64,
        sampleRate,
        voice,
        metrics: {
          coldStartMs: this.metrics.coldStartMs,
          warmStartMs: this.metrics.warmStartMs,
          synthesisMs: synthDurationMs,
          audioDurationSec: durationSec,
          memoryUsedMb: this.metrics.memoryUsedMb,
        },
      };
    } catch (err) {
      return {
        ok: false,
        error: `Kokoro synthesis error: ${err.message}`,
      };
    }
  }

  /**
   * Stop / cancel in-progress synthesis.
   */
  cancel() {
    this.isCancelling = true;
    return { ok: true, cancelled: true };
  }

  /**
   * Cleanly dispose of the loaded ONNX model to free system RAM.
   */
  dispose() {
    this.model = null;
    this.isLoading = false;
    this.isCancelling = false;

    // Hint garbage collection if node was run with --expose-gc
    if (typeof global.gc === 'function') {
      try {
        global.gc();
      } catch {}
    }

    return {
      ok: true,
      disposed: true,
      message: 'Kokoro model resources released successfully.',
    };
  }

  /**
   * Helper to convert Float32Array audio samples into standard 16-bit mono WAV Buffer.
   */
  _encodeWav(samples, sampleRate = 24000) {
    const buffer = Buffer.alloc(44 + samples.length * 2);

    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + samples.length * 2, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20); // PCM
    buffer.writeUInt16LE(1, 22); // Mono
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * 2, 28);
    buffer.writeUInt16LE(2, 32); // Block align
    buffer.writeUInt16LE(16, 34); // 16-bit
    buffer.write('data', 36);
    buffer.writeUInt32LE(samples.length * 2, 40);

    let offset = 44;
    for (let i = 0; i < samples.length; i++, offset += 2) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      buffer.writeInt16LE(s < 0 ? s * 0x8000 : s * 0x7fff, offset);
    }

    return buffer;
  }
}

module.exports = { KokoroLocalService };
