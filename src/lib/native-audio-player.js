/**
 * src/lib/native-audio-player.js
 * Shared, hardware-verified WebAudio player for native PCM WAV Base64 audio.
 * Ensures 100% identical, hardware-tested audio playback between
 * VoiceOutputDiagnostic and useRealtimeVoice.
 */

function base64ToArrayBuffer(base64) {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

let playbackAudioCtx = null;
let playbackAnalyser = null;
let currentSourceNode = null;

/**
 * Returns a dedicated playback AudioContext running at the user's
 * native Windows hardware sample rate (e.g. 48kHz or 44.1kHz).
 * Never constrains sampleRate to 16kHz, which causes WASAPI silent output.
 */
export function getPlaybackAudioContext() {
  if (typeof window === 'undefined') return null;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;

  if (!playbackAudioCtx || playbackAudioCtx.state === 'closed') {
    playbackAudioCtx = new AudioCtx();
    playbackAnalyser = null;
  }
  return playbackAudioCtx;
}

/**
 * Returns a dedicated AnalyserNode belonging to the playback AudioContext
 * so voice visualizers can react to speaker output without cross-context errors.
 */
export function getPlaybackAnalyser() {
  const ctx = getPlaybackAudioContext();
  if (!ctx) return null;
  if (!playbackAnalyser) {
    playbackAnalyser = ctx.createAnalyser();
    playbackAnalyser.fftSize = 64;
    playbackAnalyser.smoothingTimeConstant = 0.75;
  }
  return playbackAnalyser;
}

/**
 * Stops any actively playing audio source immediately.
 */
export function stopActivePlayback() {
  if (currentSourceNode) {
    try {
      currentSourceNode.onended = null;
      currentSourceNode.stop();
      currentSourceNode.disconnect();
    } catch {}
    currentSourceNode = null;
  }
}

/**
 * Decodes and plays native PCM WAV Base64 directly through Windows audio hardware.
 */
export async function playNativeWavBase64(audioBase64, { onStart, onEnded, onError, analyserNode } = {}) {
  if (!audioBase64 || typeof audioBase64 !== 'string') {
    return { ok: false, error: 'No audio data provided' };
  }

  const ctx = getPlaybackAudioContext();
  if (!ctx) {
    return { ok: false, error: 'WebAudio AudioContext not available' };
  }

  try {
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const arrayBuffer = base64ToArrayBuffer(audioBase64);
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

    // Stop any existing playback before starting new one
    stopActivePlayback();

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;

    const analyser = analyserNode || getPlaybackAnalyser();
    if (analyser) {
      try {
        source.connect(analyser);
        analyser.connect(ctx.destination);
      } catch {
        source.connect(ctx.destination);
      }
    } else {
      source.connect(ctx.destination);
    }

    currentSourceNode = source;

    return new Promise((resolve) => {
      source.onended = () => {
        if (currentSourceNode === source) {
          currentSourceNode = null;
        }
        if (onEnded) onEnded();
        resolve({
          ok: true,
          durationSec: audioBuffer.duration,
          sampleRate: audioBuffer.sampleRate,
        });
      };

      if (onStart) onStart();
      source.start(0);
    });
  } catch (err) {
    if (onError) onError(err);
    return { ok: false, error: err.message || 'Error playing native audio buffer' };
  }
}
