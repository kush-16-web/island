import { useCallback, useEffect, useRef, useState } from 'react';
import { VoiceTurnController } from '../lib/voice-turn-controller';
import { processTurnIntent } from '../lib/voice-intent';
import { getAssistantName } from '../lib/assistant';

/**
 * Helper to encode float32 PCM samples into standard 16-bit mono WAV ArrayBuffer
 */
function encodeWav(samples, sampleRate = 16000) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeString = (offset, str) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // Mono channel
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // Byte rate
  view.setUint16(32, 2, true); // Block align
  view.setUint16(34, 16, true); // 16-bit samples
  writeString(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }

  return buffer;
}

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * useRealtimeVoice: Provider-based real-time voice companion engine.
 * Hardened with VoiceTurnController:
 * - Synchronous in-flight lock preventing overlapping API requests
 * - Explicit State Machine: idle, connecting, listening, processing, speaking, cooldown, error
 * - Monotonically increasing Turn IDs discarding stale or interrupted responses
 * - 1400ms configurable end-of-speech silence detection
 * - Pre-speech ring buffer ensuring leading word consonants are never clipped
 * - Automatic microphone gating while assistant is speaking (zero self-recording)
 * - Model 429 rate-limit cooldown with live countdown timer
 */
export function useRealtimeVoice(options = {}) {
  const [provider, setProvider] = useState(() => localStorage.getItem('island_voice_provider') || 'gemini');
  const [status, setStatus] = useState('idle'); // 'idle' | 'connecting' | 'listening' | 'processing' | 'speaking' | 'cooldown' | 'error'
  const [errorMessage, setErrorMessage] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [transcript, setTranscript] = useState([]);
  const [audioLevel, setAudioLevel] = useState(0);
  const [waveformData, setWaveformData] = useState(() => new Float32Array(16).fill(0.1));
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [vadSilenceMs, setVadSilenceMsState] = useState(() => {
    try {
      const saved = localStorage.getItem('island_vad_silence_ms');
      return saved ? Number(saved) : 1400;
    } catch {
      return 1400;
    }
  });

  // Keep live references to active media state & control actions for safe music command execution
  const mediaRef = useRef(options.media);
  const onControlRef = useRef(options.onControl);
  useEffect(() => {
    mediaRef.current = options.media;
    onControlRef.current = options.onControl;
  }, [options.media, options.onControl]);

  // Audio nodes and references
  const micStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const micAnalyserRef = useRef(null);
  const speakerAnalyserRef = useRef(null);
  const scriptProcessorRef = useRef(null);
  const currentSourceRef = useRef(null);
  const animFrameRef = useRef(null);
  const historyRef = useRef([]);

  // Deterministic Turn Controller
  const controllerRef = useRef(null);
  if (!controllerRef.current) {
    controllerRef.current = new VoiceTurnController({
      silenceDurationMs: vadSilenceMs,
      sampleRate: 16000,
      speechThreshold: 0.02,
      interruptThreshold: 0.045,
      minUtteranceDurationMs: 400,
      onStateChange: (newState, _oldState, meta) => {
        if (newState === 'cooldown') {
          setStatus('cooldown');
          setCooldownSeconds(meta.cooldownSeconds || 0);
          setErrorMessage(meta.reason || 'Rate limit cooldown active.');
          window.island?.setVoiceMood?.('idle');
        } else if (newState === 'processing') {
          setStatus('processing');
          window.island?.setVoiceMood?.('listening');
        } else if (newState === 'speaking') {
          setStatus('speaking');
          window.island?.setVoiceMood?.('speaking');
        } else if (newState === 'listening') {
          setStatus('listening');
          setErrorMessage(null);
          setCooldownSeconds(0);
          window.island?.setVoiceMood?.('listening');
        } else if (newState === 'error') {
          setStatus('error');
          setErrorMessage(meta.error || 'Voice error occurred.');
          window.island?.setVoiceMood?.('idle');
        } else if (newState === 'idle') {
          setStatus('idle');
          window.island?.setVoiceMood?.('idle');
        }
      },
      onCooldownTick: (remaining) => {
        setCooldownSeconds(remaining);
      },
    });
  }
  const controller = controllerRef.current;

  // Sync configurable silence duration
  const setVadSilenceMs = useCallback((ms) => {
    setVadSilenceMsState(ms);
    try {
      localStorage.setItem('island_vad_silence_ms', String(ms));
    } catch {}
    controller.setSilenceDurationMs(ms);
  }, [controller]);

  // Clean up all audio contexts, tracks, and timers
  const cleanup = useCallback(() => {
    controller.stopSession();

    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop();
        currentSourceRef.current.disconnect();
      } catch {}
      currentSourceRef.current = null;
    }

    if (scriptProcessorRef.current) {
      try {
        scriptProcessorRef.current.disconnect();
      } catch {}
      scriptProcessorRef.current = null;
    }

    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }

    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch {}
      audioContextRef.current = null;
    }

    micAnalyserRef.current = null;
    speakerAnalyserRef.current = null;

    setAudioLevel(0);
    setWaveformData(new Float32Array(16).fill(0.1));
    window.island?.setVoiceMood?.('idle');
  }, [controller]);

  // Stop active session
  const stopSession = useCallback(() => {
    cleanup();
    setStatus('idle');
    setErrorMessage(null);
    setCooldownSeconds(0);
  }, [cleanup]);

  // Interrupt assistant immediately
  const interrupt = useCallback(() => {
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop();
        currentSourceRef.current.disconnect();
      } catch {}
      currentSourceRef.current = null;
    }
    controller.interrupt();
    setStatus('listening');
    window.island?.setVoiceMood?.('listening');
  }, [controller]);

  // Toggle microphone mute
  const toggleMute = useCallback(() => {
    if (!micStreamRef.current) return;
    const audioTrack = micStreamRef.current.getAudioTracks()[0];
    if (audioTrack) {
      const nextMuted = audioTrack.enabled;
      audioTrack.enabled = !nextMuted;
      setIsMuted(nextMuted);
    }
  }, []);

  // Play audio buffer received from Gemini TTS with real-time waveform connection
  const playAssistantSpeech = useCallback(async (audioBase64, text, turnId) => {
    const audioCtx = audioContextRef.current;
    if (!audioCtx) return;

    try {
      const arrayBuffer = base64ToArrayBuffer(audioBase64);
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

      // Verify turn is still active before starting playback
      if (!controller.isTurnActive(turnId)) {
        return;
      }

      // Stop any existing playback
      if (currentSourceRef.current) {
        try {
          currentSourceRef.current.stop();
          currentSourceRef.current.disconnect();
        } catch {}
      }

      const source = audioCtx.createBufferSource();
      source.buffer = audioBuffer;

      // Connect source to speaker analyser -> destination for actual output-driven waveform
      let speakerAnalyser = speakerAnalyserRef.current;
      if (!speakerAnalyser) {
        speakerAnalyser = audioCtx.createAnalyser();
        speakerAnalyser.fftSize = 64;
        speakerAnalyser.smoothingTimeConstant = 0.75;
        speakerAnalyserRef.current = speakerAnalyser;
      }

      source.connect(speakerAnalyser);
      speakerAnalyser.connect(audioCtx.destination);
      currentSourceRef.current = source;

      controller.beginSpeaking(turnId);
      setStatus('speaking');
      window.island?.setVoiceMood?.('speaking');

      // Update transcript with assistant reply
      setTranscript((prev) => [
        ...prev,
        { role: 'assistant', text, isLive: false },
      ]);
      historyRef.current.push({ role: 'model', text });

      source.onended = () => {
        if (currentSourceRef.current === source) {
          currentSourceRef.current = null;
          controller.finishSpeaking(turnId);
        }
      };

      source.start(0);
    } catch (err) {
      console.warn('[Audio Playback Error]', err);
      controller.finishSpeaking(turnId);
    }
  }, [controller]);

  // Submit recorded user utterance to Gemini
  const submitUserSpeech = useCallback(async (samples, sampleRate, turnId) => {
    try {
      const assistantName = getAssistantName();
      const userName = localStorage.getItem('island_user_name') || 'Friend';

      // Encode samples into standard 16-bit mono WAV
      const wavBuffer = encodeWav(samples, sampleRate);
      const audioData = arrayBufferToBase64(wavBuffer);

      if (!window.island?.gemini?.processSpeech) {
        throw new Error('Gemini voice service is not available in Electron.');
      }

      const res = await window.island.gemini.processSpeech({
        audioData,
        history: historyRef.current,
        assistantName,
        userName,
      });

      // Discard stale response if turn was interrupted or session stopped
      if (!controller.isTurnActive(turnId)) {
        return;
      }

      if (!res.ok) {
        const retryDelaySec = res.retryDelaySeconds || (res.error?.includes('rate limit') ? 30 : 0);
        controller.handleTurnFailure(turnId, res.error || 'Failed to get response from Gemini.', {
          retryDelaySeconds: retryDelaySec,
        });
        return;
      }

      // Add user speech entry to transcript
      setTranscript((prev) => [
        ...prev,
        { role: 'user', text: `Voice message to ${assistantName}` },
      ]);
      historyRef.current.push({ role: 'user', text: `Voice message to ${assistantName}` });

      // Execute allowlisted music actions embedded in LLM response
      const turnResult = processTurnIntent(res.text, {
        media: mediaRef.current || { active: false },
        onControl: onControlRef.current || ((act) => window.island?.media?.control?.(act)),
      });

      const finalSpokenText = turnResult.spokenText;
      const finalTranscriptText = turnResult.transcriptText;

      if (turnResult.executed) {
        // Truth-grounded action execution: add verified result to transcript
        setTranscript((prev) => [
          ...prev,
          { role: 'assistant', text: finalTranscriptText },
        ]);
        historyRef.current.push({ role: 'assistant', text: finalTranscriptText });

        // Synthesize spoken confirmation for the verified outcome
        const engine = localStorage.getItem('island_voice_engine') || 'gemini';
        const kokoroVoice = localStorage.getItem('island_kokoro_voice') || 'af_heart';
        const allowCloudFallback = localStorage.getItem('island_voice_cloud_fallback') === 'true';

        let spokenAudioBase64 = null;
        if (engine === 'kokoro') {
          if (window.island?.kokoro?.synthesize) {
            try {
              const kRes = await window.island.kokoro.synthesize({
                text: finalSpokenText,
                voice: kokoroVoice,
                speed: 1.0,
              });
              if (kRes?.ok && kRes.audioBase64) {
                spokenAudioBase64 = kRes.audioBase64;
              } else if (!allowCloudFallback) {
                console.warn('[Kokoro synthesis unavailable, cloud fallback disallowed]:', kRes?.error);
              }
            } catch (kErr) {
              console.warn('[Kokoro synthesis error]:', kErr);
            }
          }
          if (!spokenAudioBase64 && allowCloudFallback && window.island?.gemini?.synthesizeSpeech) {
            try {
              const synthRes = await window.island.gemini.synthesizeSpeech({
                text: finalSpokenText,
                voice: 'Despina',
              });
              if (synthRes?.ok && synthRes.audioBase64) {
                spokenAudioBase64 = synthRes.audioBase64;
              }
            } catch (e) {
              console.warn('[Cloud fallback synthesis failed]:', e);
            }
          }
        } else if (engine === 'gemini') {
          if (window.island?.gemini?.synthesizeSpeech) {
            try {
              const synthRes = await window.island.gemini.synthesizeSpeech({
                text: finalSpokenText,
                voice: 'Despina',
              });
              if (synthRes?.ok && synthRes.audioBase64) {
                spokenAudioBase64 = synthRes.audioBase64;
              }
            } catch (e) {
              console.warn('[Synthesize spoken action failed]:', e);
            }
          }
        }

        if (spokenAudioBase64 && controller.isTurnActive(turnId)) {
          await playAssistantSpeech(spokenAudioBase64, finalSpokenText, turnId);
        } else {
          controller.finishSpeaking(turnId);
        }
      } else {
        // Normal conversational turn
        const engine = localStorage.getItem('island_voice_engine') || 'gemini';
        const kokoroVoice = localStorage.getItem('island_kokoro_voice') || 'af_heart';
        const allowCloudFallback = localStorage.getItem('island_voice_cloud_fallback') === 'true';

        let turnAudioBase64 = null;
        if (engine === 'kokoro') {
          if (window.island?.kokoro?.synthesize) {
            try {
              const kRes = await window.island.kokoro.synthesize({
                text: finalSpokenText,
                voice: kokoroVoice,
                speed: 1.0,
              });
              if (kRes?.ok && kRes.audioBase64) {
                turnAudioBase64 = kRes.audioBase64;
              }
            } catch (err) {
              console.warn('[Kokoro synthesis error in turn]:', err);
            }
          }
          // Only fall back to Gemini audio if explicitly enabled by user
          if (!turnAudioBase64 && allowCloudFallback && res.audioBase64) {
            turnAudioBase64 = res.audioBase64;
          }
        } else if (engine === 'gemini') {
          turnAudioBase64 = res.audioBase64;
        }

        if (turnAudioBase64 && controller.isTurnActive(turnId)) {
          await playAssistantSpeech(turnAudioBase64, finalSpokenText, turnId);
        } else {
          setTranscript((prev) => [
            ...prev,
            { role: 'assistant', text: finalTranscriptText },
          ]);
          historyRef.current.push({ role: 'assistant', text: finalTranscriptText });
          controller.finishSpeaking(turnId);
        }
      }
    } catch (err) {
      console.warn('[Gemini voice submit error]', err);
      controller.handleTurnFailure(turnId, err.message || 'Error processing speech with Gemini.');
    }
  }, [controller, playAssistantSpeech]);

  // Wire turn submission handler to controller
  useEffect(() => {
    controller.onTurnTriggered = (samples, turnId) => {
      submitUserSpeech(samples, 16000, turnId);
    };
  }, [controller, submitUserSpeech]);

  // Start real-time voice session
  const startSession = useCallback(async () => {
    cleanup();
    setStatus('connecting');
    setErrorMessage(null);
    setIsMuted(false);

    try {
      // 1. Verify Gemini status from main process
      if (window.island?.gemini?.getStatus) {
        const geminiStatus = await window.island.gemini.getStatus();
        if (!geminiStatus?.hasKey) {
          throw new Error('GEMINI_API_KEY is not configured in .env. Please add your key to enable voice.');
        }
      }

      // 2. Acquire microphone stream
      let micStream;
      try {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        micStreamRef.current = micStream;
      } catch (err) {
        throw new Error(
          err.name === 'NotAllowedError'
            ? 'Microphone access was denied. Please allow microphone permissions in Windows settings.'
            : 'Could not access microphone.'
        );
      }

      // 3. Set up AudioContext & Analysers
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioCtx({ sampleRate: 16000 });
      audioContextRef.current = audioCtx;

      const micSource = audioCtx.createMediaStreamSource(micStream);
      const micAnalyser = audioCtx.createAnalyser();
      micAnalyser.fftSize = 64;
      micAnalyser.smoothingTimeConstant = 0.75;
      micSource.connect(micAnalyser);
      micAnalyserRef.current = micAnalyser;

      const speakerAnalyser = audioCtx.createAnalyser();
      speakerAnalyser.fftSize = 64;
      speakerAnalyser.smoothingTimeConstant = 0.75;
      speakerAnalyserRef.current = speakerAnalyser;

      // 4. Hardened VAD via ScriptProcessor & VoiceTurnController
      const bufferSize = 2048;
      const processor = audioCtx.createScriptProcessor(bufferSize, 1, 1);
      scriptProcessorRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (!micStreamRef.current || !micStreamRef.current.getAudioTracks()[0]?.enabled) {
          return;
        }

        const inputData = e.inputBuffer.getChannelData(0);

        // Compute Root Mean Square (RMS) volume
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
          sum += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sum / inputData.length);

        // Feed to VoiceTurnController: enforces in-flight lock, silence timers, ring buffer, mic gating
        controller.processAudioFrame(inputData, rms);
      };

      micSource.connect(processor);
      const nullGain = audioCtx.createGain();
      nullGain.gain.value = 0;
      processor.connect(nullGain);
      nullGain.connect(audioCtx.destination);

      // 5. Audio-reactive animation loop (drives visualizer)
      const micData = new Uint8Array(32);
      const speakerData = new Uint8Array(32);
      const bars = new Float32Array(16);

      const updateAudioVisuals = () => {
        let currentLevel = 0;

        if (controller.state === 'speaking' && speakerAnalyserRef.current) {
          speakerAnalyserRef.current.getByteFrequencyData(speakerData);
          let sum = 0;
          for (let i = 0; i < 16; i++) {
            const val = speakerData[i] / 255;
            bars[i] = bars[i] * 0.35 + val * 0.65;
            sum += val;
          }
          currentLevel = sum / 16;
        } else if (micAnalyserRef.current && controller.state === 'listening') {
          micAnalyserRef.current.getByteFrequencyData(micData);
          let sum = 0;
          for (let i = 0; i < 16; i++) {
            const val = micData[i] / 255;
            bars[i] = bars[i] * 0.35 + val * 0.65;
            sum += val;
          }
          currentLevel = sum / 16;
        }

        setAudioLevel(currentLevel);
        setWaveformData(new Float32Array(bars));

        animFrameRef.current = requestAnimationFrame(updateAudioVisuals);
      };

      animFrameRef.current = requestAnimationFrame(updateAudioVisuals);

      controller.startSession();
    } catch (err) {
      cleanup();
      setStatus('error');
      setErrorMessage(err.message || 'Failed to start Gemini voice companion.');
    }
  }, [cleanup, controller]);

  // Listen to global shortcut 'voice:toggle' from Electron (Ctrl+Shift+Space)
  useEffect(() => {
    if (!window.island?.on) return undefined;
    return window.island.on('voice:toggle', () => {
      setStatus((current) => {
        if (current === 'idle' || current === 'error') {
          startSession();
        } else {
          stopSession();
        }
        return current;
      });
    });
  }, [startSession, stopSession]);

  // Clean up on unmount
  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  return {
    provider,
    setProvider,
    status,
    errorMessage,
    isMuted,
    transcript,
    audioLevel,
    waveformData,
    cooldownSeconds,
    vadSilenceMs,
    setVadSilenceMs,
    startSession,
    stopSession,
    interrupt,
    toggleMute,
  };
}
