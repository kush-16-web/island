import { useCallback, useEffect, useRef, useState } from 'react';
import { VoiceTurnController, ACTION_LIFECYCLE_STATES } from '../lib/voice-turn-controller';
import { processTurnIntent } from '../lib/voice-intent';
import { getAssistantName } from '../lib/assistant';
import { audioCoordinator } from '../lib/audio-coordinator';
import { interpretLocalMusicCommand } from '../lib/music-command-interpreter';
import { formatActionOutcomeSpeech } from '../lib/music-actions';
import { getCurrentWeather } from '../lib/weather';
import { playNativeWavBase64, stopActivePlayback, getPlaybackAnalyser } from '../lib/native-audio-player';
import {
  createAgentResponse,
  cleanTextForSpeech,
  formatFavoritesResponse,
  formatWeatherResponse,
  isExplicitReadAloudRequest,
} from '../lib/agent-response-contract';
import { latencyTracker } from '../lib/latency-tracker';
import { parseSchedulerIntent, executeSchedulerIntent } from '../lib/scheduler-commands';
const isDev = Boolean(import.meta.env?.DEV);

function logDevStage(stageNumber, stageDescription, extra = {}) {
  if (!isDev) return;
  console.log(`[VoiceDevStage] ${stageNumber}. ${stageDescription}`, extra);
}

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
  const [provider, setProvider] = useState(() => localStorage.getItem('island_chat_provider') || localStorage.getItem('island_voice_provider') || 'gemini');
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

  // Listen for dynamic provider changes from Settings
  useEffect(() => {
    const onProviderChanged = (e) => {
      const newProvider = e.detail?.chatProvider || localStorage.getItem('island_chat_provider') || 'gemini';
      setProvider(newProvider);
    };
    window.addEventListener('island:ai-provider-changed', onProviderChanged);
    return () => window.removeEventListener('island:ai-provider-changed', onProviderChanged);
  }, []);

  // Keep live references to active media state, controls, and schedule items
  const mediaRef = useRef(options.media);
  const onControlRef = useRef(options.onControl);
  const scheduleRef = useRef(options.schedule || []);
  useEffect(() => {
    mediaRef.current = options.media;
    onControlRef.current = options.onControl;
    scheduleRef.current = options.schedule || [];
  }, [options.media, options.onControl, options.schedule]);

  // Audio nodes and references
  const micStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const micAnalyserRef = useRef(null);
  const speakerAnalyserRef = useRef(null);
  const scriptProcessorRef = useRef(null);
  const currentSourceRef = useRef(null);
  const animFrameRef = useRef(null);
  const historyRef = useRef([]);
  const handledTurnsRef = useRef(new Set());
  const activeUtteranceRef = useRef(null);

  // Deterministic Turn Controller
  const controllerRef = useRef(null);
  if (!controllerRef.current) {
    controllerRef.current = new VoiceTurnController({
      silenceDurationMs: vadSilenceMs,
      sampleRate: 16000,
      speechThreshold: 0.02,
      interruptThreshold: 0.045,
      minUtteranceDurationMs: 400,
      onSpeechDetected: () => {
        logDevStage(2, 'Speech detected');
      },
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

    stopActivePlayback();
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.onended = null;
        currentSourceRef.current.stop();
        currentSourceRef.current.disconnect();
      } catch {}
      currentSourceRef.current = null;
    }

    if (activeUtteranceRef.current) {
      activeUtteranceRef.current.onend = null;
      activeUtteranceRef.current.onerror = null;
      activeUtteranceRef.current = null;
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try { window.speechSynthesis.cancel(); } catch {}
    }

    if (window.island?.windowsTts?.cancel) {
      try { window.island.windowsTts.cancel(); } catch {}
    }

    if (window.island?.kokoro?.cancel) {
      try { window.island.kokoro.cancel(); } catch {}
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
        if (audioContextRef.current.state !== 'closed') {
          audioContextRef.current.close();
        }
      } catch {}
      audioContextRef.current = null;
    }

    micAnalyserRef.current = null;
    speakerAnalyserRef.current = null;

    setAudioLevel(0);
    setWaveformData(new Float32Array(16).fill(0.1));
    window.island?.setVoiceMood?.('idle');
    audioCoordinator.cancelDucking();
  }, [controller]);

  // Stop active voice session without clearing conversation history
  const stopSession = useCallback(() => {
    cleanup();
    setStatus('idle');
    setErrorMessage(null);
    setCooldownSeconds(0);
  }, [cleanup]);

  // End active session completely, clearing conversation history (explicit user action)
  const endSession = useCallback(() => {
    cleanup();
    audioCoordinator.cancelDucking();
    setTranscript([]);
    historyRef.current = [];
    setStatus('idle');
    setErrorMessage(null);
    setCooldownSeconds(0);
    window.island?.logLifecycle?.('voice:session_ended_explicitly');
  }, [cleanup]);

  // Interrupt assistant immediately
  const interrupt = useCallback(() => {
    audioCoordinator.cancelDucking();
    stopActivePlayback();
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.onended = null;
        currentSourceRef.current.stop();
        currentSourceRef.current.disconnect();
      } catch {}
      currentSourceRef.current = null;
    }
    if (window.island?.windowsTts?.cancel) {
      try { window.island.windowsTts.cancel(); } catch {}
    }
    if (activeUtteranceRef.current) {
      activeUtteranceRef.current.onend = null;
      activeUtteranceRef.current.onerror = null;
      activeUtteranceRef.current = null;
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try { window.speechSynthesis.cancel(); } catch {}
    }
    if (window.island?.kokoro?.cancel) {
      try { window.island.kokoro.cancel(); } catch {}
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

  // Play audio buffer received from TTS using shared, hardware-verified native player
  const playAssistantSpeech = useCallback((audioBase64, text, turnId, isIntermediate = false) => {
    return new Promise(async (resolve) => {
      if (!controller.isTurnActive(turnId)) {
        logDevStage(9, 'Audio playback rejected', {
          reason: 'Turn superseded before audio start',
          turnId,
        });
        resolve({ ok: false, error: 'Turn superseded before audio start' });
        return;
      }

      const startTime = Date.now();
      const res = await playNativeWavBase64(audioBase64, {
        onStart: () => {
          if (!controller.isTurnActive(turnId)) {
            stopActivePlayback();
            resolve({ ok: false, error: 'Turn superseded at audio start' });
            return;
          }
          controller.beginSpeaking(turnId);
          setStatus('speaking');
          window.island?.setVoiceMood?.('speaking');
          latencyTracker.recordStage(turnId, 'audio_first_chunk');

          logDevStage(9, 'Audio playback started', {
            method: 'native_wav_buffer',
            effectiveVolume: audioCoordinator.effectiveVolume,
            controllerState: controller.state,
            turnId,
          });
        },
        onEnded: () => {
          latencyTracker.recordStage(turnId, 'speech_completed');
          if (!isIntermediate) {
            latencyTracker.completeTurn(turnId, 'completed');
          }
          logDevStage(9, 'Audio playback ended', {
            method: 'native_wav_buffer',
            durationMs: Date.now() - startTime,
            turnId,
          });
          resolve({ ok: true });
        },
        onError: (err) => {
          console.warn('[Audio Playback Error]', err);
          logDevStage(9, 'Audio playback rejected', {
            reason: err.message || 'Error playing native audio buffer',
            turnId,
          });
          resolve({ ok: false, error: err.message || 'Audio playback error' });
        },
      });

      if (!res.ok) {
        resolve(res);
      }
    });
  }, [controller]);

  // Fallback: Speak via local Web Speech API (window.speechSynthesis)
  const playWebSpeech = useCallback((text, turnId, isIntermediate = false) => {
    return new Promise((resolve) => {
      if (typeof window === 'undefined' || !window.speechSynthesis) {
        logDevStage(9, 'Audio playback rejected', {
          reason: 'window.speechSynthesis is not available',
          turnId,
        });
        resolve({ ok: false, error: 'Web Speech API unavailable' });
        return;
      }

      if (!controller.isTurnActive(turnId)) {
        resolve({ ok: false, error: 'Turn superseded before Web Speech playback' });
        return;
      }

      // Check for available voices. In Chromium inside Electron on Windows,
      // speech synthesis voices are typically not installed/exposed, which causes
      // speak() to complete silently via a fake timer without sending audio to speakers.
      let allVoices = window.speechSynthesis.getVoices?.() || [];
      const proceedWithVoice = (voices) => {
        if (!voices || voices.length === 0) {
          logDevStage(9, 'Audio playback rejected', {
            reason: 'window.speechSynthesis has 0 voices. Prevented silent mock timer playback.',
            turnId,
          });
          resolve({ ok: false, error: 'No Web Speech voices available' });
          return;
        }

        try {
          window.speechSynthesis.cancel();
          window.speechSynthesis.resume();
        } catch {}

        const cleanText = text.replace(/\[\[ACTION:[\s\S]*?\]\]/g, '').trim();
        if (!cleanText) {
          resolve({ ok: true });
          return;
        }

        const utterance = new SpeechSynthesisUtterance(cleanText);
        activeUtteranceRef.current = utterance; // Prevent garbage collection bug in Chromium

        const prefLang = localStorage.getItem('island_speech_language') || 'en';
        utterance.lang = prefLang === 'hi' ? 'hi-IN' : 'en-US';

        const savedVoiceURI = localStorage.getItem('island_windows_voice_uri');
        if (savedVoiceURI && voices.length > 0) {
          const matchingVoice = voices.find((v) => v.voiceURI === savedVoiceURI);
          if (matchingVoice) utterance.voice = matchingVoice;
        } else if (voices.length > 0 && prefLang === 'en') {
          const englishVoice = voices.find((v) => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('David') || v.name.includes('Zira') || v.name.includes('Mark')));
          if (englishVoice) utterance.voice = englishVoice;
        }

        utterance.rate = 1.0;
        utterance.pitch = 1.0;

        const startTime = Date.now();

        utterance.onstart = () => {
          if (!controller.isTurnActive(turnId)) {
            try { window.speechSynthesis.cancel(); } catch {}
            resolve({ ok: false, error: 'Turn superseded at onstart' });
            return;
          }
          controller.beginSpeaking(turnId);
          setStatus('speaking');
          window.island?.setVoiceMood?.('speaking');
          latencyTracker.recordStage(turnId, 'audio_first_chunk');

          logDevStage(9, 'Audio playback started', {
            method: 'web_speech',
            voice: utterance.voice?.name || 'default',
            lang: utterance.lang,
            effectiveVolume: audioCoordinator.effectiveVolume,
            controllerState: controller.state,
            turnId,
          });
        };

        utterance.onend = () => {
          activeUtteranceRef.current = null;
          latencyTracker.recordStage(turnId, 'speech_completed');
          if (!isIntermediate) {
            latencyTracker.completeTurn(turnId, 'completed');
          }
          logDevStage(9, 'Audio playback ended', {
            method: 'web_speech',
            durationMs: Date.now() - startTime,
            turnId,
          });
          resolve({ ok: true });
        };

        utterance.onerror = (e) => {
          activeUtteranceRef.current = null;
          logDevStage(9, 'Audio playback rejected', {
            reason: e?.error || 'SpeechSynthesisUtterance error',
            turnId,
          });
          resolve({ ok: false, error: e?.error || 'SpeechSynthesisUtterance error' });
        };

        // Small timeout avoids Chromium race condition between cancel() and speak()
        setTimeout(() => {
          if (typeof window !== 'undefined' && window.speechSynthesis) {
            window.speechSynthesis.speak(utterance);
          }
        }, 30);
      };

      if (allVoices.length === 0) {
        let fired = false;
        const timer = setTimeout(() => {
          if (!fired) {
            fired = true;
            proceedWithVoice(window.speechSynthesis.getVoices?.() || []);
          }
        }, 200);

        window.speechSynthesis.onvoiceschanged = () => {
          if (!fired) {
            fired = true;
            clearTimeout(timer);
            proceedWithVoice(window.speechSynthesis.getVoices?.() || []);
          }
        };
      } else {
        proceedWithVoice(allVoices);
      }
    });
  }, [controller]);

  // Unified Assistant Speech Coordinator:
  // Starts music ducking -> plays AudioBuffer or falls back to Web Speech -> awaits playback end -> restores music -> transitions to listening
  const speakAssistantResponse = useCallback(async ({ audioBase64, text, turnId, isIntermediate = false }) => {
    if (!text || typeof text !== 'string') return false;

    // 1. Protect music playback: duck background music smoothly (~10% level)
    audioCoordinator.startDucking({ duckLevel: 0.10, durationMs: 250, media: mediaRef.current });

    let played = false;

    // 2. Try AudioBuffer playback if synthesized audio is present
    if (audioBase64) {
      const res = await playAssistantSpeech(audioBase64, text, turnId, isIntermediate);
      if (res.ok) {
        played = true;
      } else {
        logDevStage(9, 'Audio buffer playback failed, falling back to Web Speech', {
          turnId,
          error: res.error,
        });
      }
    }

    // 3. Fall back to local Web Speech API (window.speechSynthesis)
    if (!played && typeof window !== 'undefined' && window.speechSynthesis) {
      const res = await playWebSpeech(text, turnId, isIntermediate);
      if (res.ok) {
        played = true;
      }
    }

    // 4. Lifecycle completion (only when this is the final speech in the turn)
    if (!isIntermediate) {
      audioCoordinator.restoreVolume({ durationMs: 1100 });
      controller.finishSpeaking(turnId, 'listening');
      setStatus('listening');
      window.island?.setVoiceMood?.('listening');
      logDevStage(10, 'Voice turn completion', { turnId, nextState: 'listening' });
    }

    if (!played) {
      setErrorMessage('Speech output was unavailable. Speaking was skipped.');
    }

    return played;
  }, [controller, playAssistantSpeech, playWebSpeech]);

  // Submit recorded user utterance or direct text through modular AI pipeline: STT -> Conversational LLM -> Island Action -> TTS
  const submitUserSpeech = useCallback(async (samplesOrText, sampleRate = 16000, turnId = Date.now()) => {
    try {
      const isDirectText = typeof samplesOrText === 'string';
      const assistantName = getAssistantName();
      const userName = localStorage.getItem('island_user_name') || 'Friend';

      // 0. Provider configuration resolution
      const chatProvider = localStorage.getItem('island_chat_provider') || localStorage.getItem('island_voice_provider') || 'gemini';
      let sttProvider = localStorage.getItem('island_stt_provider');
      if (!sttProvider || (chatProvider === 'groq' && sttProvider === 'gemini')) {
        sttProvider = chatProvider === 'groq' ? 'groq-whisper' : 'gemini';
      }
      const ttsEngine = localStorage.getItem('island_voice_engine') || 'gemini';
      const kokoroVoice = localStorage.getItem('island_kokoro_voice') || 'af_heart';
      const allowCloudFallback = localStorage.getItem('island_voice_cloud_fallback') === 'true';
      const groqChatModel = localStorage.getItem('island_groq_chat_model') || 'openai/gpt-oss-20b';
      const groqWhisperModel = localStorage.getItem('island_groq_whisper_model') || 'whisper-large-v3-turbo';
      const speechLanguage = localStorage.getItem('island_speech_language') || 'en';
      const whisperLanguage = speechLanguage === 'auto' ? undefined : speechLanguage;

      // Validate provider readiness before proceeding to avoid mysterious failures
      if (!isDirectText && (chatProvider === 'groq' || sttProvider === 'groq-whisper')) {
        const groqStatus = await window.island?.groq?.getStatus?.();
        if (!groqStatus?.hasKey) {
          controller.handleTurnFailure(turnId, 'Groq API Key is not configured. Please paste your key in Settings and click Save Key.', {
            retryDelaySeconds: 0,
            isDailyQuota: false,
          });
          return;
        }
      }

      let audioData = null;
      if (!isDirectText && samplesOrText) {
        // Encode samples into standard 16-bit mono WAV
        const wavBuffer = encodeWav(samplesOrText, sampleRate);
        audioData = arrayBufferToBase64(wavBuffer);
      }

      let userText = isDirectText ? samplesOrText.trim() : null;
      let turnResult = null;
      let geminiAudioBase64 = null;

      // 1. Stage 1: Speech-to-Text (STT) if not already provided as direct text
      if (!isDirectText) {
        latencyTracker.recordStage(turnId, 'stt_start');
        if (sttProvider === 'groq-whisper') {
          if (!window.island?.groq?.transcribe) {
            throw new Error('Groq Whisper speech recognition service is not available in Electron.');
          }

          const sttRes = await window.island.groq.transcribe({
            audioBase64: audioData,
            model: groqWhisperModel,
            language: whisperLanguage,
          });

          latencyTracker.recordStage(turnId, 'stt_end', { userText: sttRes?.text });

          if (!controller.isTurnActive(turnId)) return;

          if (!sttRes?.ok) {
            controller.handleTurnFailure(turnId, sttRes?.error || 'Failed to transcribe audio with Groq Whisper.', {
              retryDelaySeconds: sttRes?.retryDelaySeconds || 0,
              isDailyQuota: sttRes?.isDailyQuota || false,
            });
            return;
          }

          logDevStage(4, 'Raw transcription returned', {
            provider: 'groq-whisper',
            rawTextLength: sttRes.text?.length || 0,
            empty: Boolean(sttRes.empty),
          });
          logDevStage(5, 'Detected language and confidence', {
            languagePreference: speechLanguage,
            whisperLanguageHint: whisperLanguage || 'auto',
            provider: 'groq-whisper',
          });

          if (sttRes.empty || !sttRes.text?.trim()) {
            controller.resetToListening(turnId);
            return;
          }

          // Filter out obvious hallucination artifacts on silence or noise
          const rawLower = sttRes.text.trim().toLowerCase();
          const isHallucination = [
            'thank you for watching',
            'thanks for watching',
            'subtitles by',
            'amara.org',
            'subscribe to my channel',
          ].some((phrase) => rawLower.includes(phrase));

          if (isHallucination || /^[.\s?!,;:\-_–—…]+$/.test(sttRes.text.trim())) {
            controller.resetToListening(turnId);
            return;
          }

          userText = sttRes.text.trim();
        }
      }

      // Add user speech entry to transcript
      const displayedUserText = userText || `Voice message to ${assistantName}`;
      setTranscript((prev) => [
        ...prev,
        { role: 'user', text: displayedUserText },
      ]);
      historyRef.current.push({ role: 'user', text: displayedUserText });

      logDevStage(6, 'Normalized text sent to intent processing', {
        text: displayedUserText,
      });

      // 2. Direct Natural-Language Scheduler Commands (PASS 2.2.8)
      // Resolves countdowns, alarms, status, cancellations locally with 0ms delay and zero LLM quota
      let schedulerActionResult = null;
      if (userText) {
        const schedulerParsed = parseSchedulerIntent(userText, {
          schedule: scheduleRef.current || [],
          now: new Date(),
        });
        if (schedulerParsed.isScheduler) {
          latencyTracker.recordStage(turnId, 'intent_start');
          const schedRes = await executeSchedulerIntent(schedulerParsed, {
            scheduler: window.island?.scheduler,
            schedule: scheduleRef.current || [],
            now: Date.now(),
          });
          latencyTracker.recordStage(turnId, 'intent_end', { isLocal: true });
          schedulerActionResult = schedRes;
        }
      }

      // 3. Direct Local Music Command Interpretation (PASS 2 - PART B)
      let localMusicResult = null;
      if (!schedulerActionResult && userText) {
        latencyTracker.recordStage(turnId, 'intent_start');
        const localEval = interpretLocalMusicCommand(userText, {
          media: mediaRef.current || { active: false },
          onControl: onControlRef.current || ((act) => window.island?.media?.control?.(act)),
          turnId,
        });
        latencyTracker.recordStage(turnId, 'intent_end', { isLocal: localEval.handledLocally });
        if (localEval.handledLocally && localEval.actionResult) {
          localMusicResult = localEval.actionResult;
        }
      }

      logDevStage(7, 'Selected intent or AI tool', {
        intent: schedulerActionResult
          ? schedulerActionResult.action
          : localMusicResult
          ? localMusicResult.action
          : 'conversational_llm',
      });

      if (schedulerActionResult) {
        latencyTracker.recordStage(turnId, 'tool_start');
        const display = schedulerActionResult.displayText || schedulerActionResult.spokenConfirmation;
        const agentResponse = createAgentResponse({
          displayText: display,
          spokenText: schedulerActionResult.spokenConfirmation,
          toolResults: null,
          responseStatus: schedulerActionResult.clarificationNeeded
            ? 'clarification'
            : schedulerActionResult.ok === false
            ? 'failure'
            : 'success',
        });
        latencyTracker.recordStage(turnId, 'tool_end');

        turnResult = {
          executed: true,
          actionResult: schedulerActionResult,
          spokenText: agentResponse.spokenText,
          transcriptText: agentResponse.displayText,
          agentResponse,
        };
      } else if (localMusicResult) {
        latencyTracker.recordStage(turnId, 'tool_start');
        // Live Weather query: fetch real-time forecast asynchronously without paid API keys
        if (localMusicResult.isWeather) {
          setStatus('processing');
          const weatherRes = await getCurrentWeather(localMusicResult.location, {
            timeframe: localMusicResult.timeframe || 'current',
            questionType: localMusicResult.questionType || 'general',
          });
          if (weatherRes && weatherRes.ok) {
            localMusicResult.spokenConfirmation = weatherRes.speech;
            localMusicResult.weather = weatherRes;
          } else {
            localMusicResult.spokenConfirmation =
              weatherRes?.speech || "I couldn't retrieve the live weather right now. Please check your internet connection.";
          }
        }
        latencyTracker.recordStage(turnId, 'tool_end');

        let agentResponse;
        if (localMusicResult.isWeather) {
          agentResponse = formatWeatherResponse(localMusicResult.weather);
        } else if (localMusicResult.action === 'list_favorites') {
          agentResponse = formatFavoritesResponse(localMusicResult, {
            readAloud: Boolean(localMusicResult.readAloud),
          });
        } else {
          const display = localMusicResult.spokenConfirmation || 'Action completed.';
          agentResponse = createAgentResponse({
            displayText: localMusicResult.displayText || display,
            spokenText: display,
            toolResults: {
              tracks: localMusicResult.tracks || null,
              candidates: localMusicResult.candidates || null,
              weather: localMusicResult.weather || null,
            },
            responseStatus: localMusicResult.clarificationNeeded
              ? 'clarification'
              : localMusicResult.ok === false
              ? 'failure'
              : 'success',
          });
        }

        turnResult = {
          executed: true,
          actionResult: localMusicResult,
          spokenText: agentResponse.spokenText,
          transcriptText: agentResponse.displayText,
          agentResponse,
        };
      } else {
        // 3. Stage 2: Conversational LLM (if not handled by direct local action)
        latencyTracker.recordStage(turnId, 'llm_start');
        let llmReplyText = null;
        if (chatProvider === 'groq') {
          if (!window.island?.groq?.chat) {
            throw new Error('Groq conversational service is not available in Electron.');
          }

          const chatRes = await window.island.groq.chat({
            text: userText,
            history: historyRef.current,
            assistantName,
            userName,
            model: groqChatModel,
            language: speechLanguage,
          });

          if (!controller.isTurnActive(turnId)) return;

          if (!chatRes?.ok) {
            controller.handleTurnFailure(turnId, chatRes?.error || 'Failed to get response from Groq.', {
              retryDelaySeconds: chatRes?.retryDelaySeconds || 0,
              isDailyQuota: chatRes?.isDailyQuota || false,
            });
            return;
          }

          llmReplyText = chatRes.text;

          // If seamless fallback switched models, persist the active model and notify Settings
          if (chatRes.fallbackFrom && chatRes.model && chatRes.model !== groqChatModel) {
            localStorage.setItem('island_groq_chat_model', chatRes.model);
            window.dispatchEvent(new CustomEvent('island:groq-model-changed', {
              detail: { model: chatRes.model, fallbackFrom: chatRes.fallbackFrom },
            }));
          }
        } else {
          // Gemini provider
          if (!window.island?.gemini?.processSpeech) {
            throw new Error('Gemini voice service is not available in Electron.');
          }

          const chatRes = await window.island.gemini.processSpeech({
            audioData: sttProvider === 'gemini' ? audioData : null,
            text: userText || null,
            history: historyRef.current,
            assistantName,
            userName,
            skipTts: ttsEngine === 'kokoro',
            ttsEngine,
            language: speechLanguage,
          });

          if (!controller.isTurnActive(turnId)) return;

          if (!chatRes?.ok) {
            controller.handleTurnFailure(turnId, chatRes?.error || 'Failed to get response from Gemini.', {
              retryDelaySeconds: chatRes?.retryDelaySeconds || 0,
              isDailyQuota: chatRes?.isDailyQuota || false,
            });
            return;
          }

          llmReplyText = chatRes.text;
          geminiAudioBase64 = chatRes.audioBase64;
        }
        latencyTracker.recordStage(turnId, 'llm_end');

        logDevStage(8, 'AI response text', {
          replyLength: llmReplyText?.length || 0,
          sample: (llmReplyText || '').slice(0, 60),
        });

        // 4. Stage 3: Truth-grounded Island Action Execution
        latencyTracker.recordStage(turnId, 'tool_start');
        turnResult = processTurnIntent(llmReplyText, {
          media: mediaRef.current || { active: false },
          onControl: onControlRef.current || ((act) => window.island?.media?.control?.(act)),
        });
        latencyTracker.recordStage(turnId, 'tool_end');

        let agentResponse;
        if (turnResult.actionResult?.action === 'list_favorites') {
          agentResponse = formatFavoritesResponse(turnResult.actionResult, {
            readAloud: isExplicitReadAloudRequest(userText),
          });
        } else {
          agentResponse = createAgentResponse({
            displayText: turnResult.transcriptText || llmReplyText,
            spokenText: turnResult.spokenText || llmReplyText,
            toolResults: turnResult.actionResult ? {
              tracks: turnResult.actionResult.tracks || null,
              candidates: turnResult.actionResult.candidates || null,
              weather: turnResult.actionResult.weather || null,
            } : null,
            responseStatus: turnResult.actionResult?.ok === false ? 'failure' : 'success',
          });
        }

        turnResult.agentResponse = agentResponse;
        turnResult.spokenText = agentResponse.spokenText;
        turnResult.transcriptText = agentResponse.displayText;
      }

      // 5. Stage 4: Context-Aware Action Lifecycle & Outcome Speech (PASS 2.2.4)
      const isPlaybackAction = Boolean(
        turnResult.actionResult?.ok && (
          turnResult.actionResult.action === 'play_favorite' ||
          turnResult.actionResult.action === 'play_track' ||
          turnResult.actionResult.action === 'play_random_favorite' ||
          turnResult.actionResult.action === 'compound_pause_play'
        )
      );

      const isAwaitingBrowserOutcome = Boolean(
        isPlaybackAction && turnResult.actionResult?.awaitingResult
      );

      const synthesizeSpeechText = async (textToSynthesize) => {
        if (!textToSynthesize || typeof textToSynthesize !== 'string') return null;

        const startTime = Date.now();
        logDevStage(9, 'TTS synthesis started', {
          engine: ttsEngine,
          voice: ttsEngine === 'kokoro' ? kokoroVoice : (ttsEngine === 'gemini' ? 'Despina' : 'windows-default'),
          language: speechLanguage,
          textLength: textToSynthesize.length,
        });

        let audioBase64 = null;
        let ttsError = null;

        if (ttsEngine === 'kokoro') {
          if (window.island?.kokoro?.synthesize) {
            try {
              const kRes = await window.island.kokoro.synthesize({
                text: textToSynthesize,
                voice: kokoroVoice,
                speed: 1.0,
              });
              if (kRes?.ok && kRes.audioBase64) {
                audioBase64 = kRes.audioBase64;
              } else {
                ttsError = kRes?.error || 'Kokoro model weights not installed';
              }
            } catch (kErr) {
              ttsError = kErr.message;
            }
          }
          if (!audioBase64 && allowCloudFallback && window.island?.gemini?.synthesizeSpeech) {
            try {
              const synthRes = await window.island.gemini.synthesizeSpeech({
                text: textToSynthesize,
                voice: 'Despina',
              });
              if (synthRes?.ok && synthRes.audioBase64) {
                audioBase64 = synthRes.audioBase64;
                ttsError = null;
              } else if (synthRes?.error) {
                ttsError = synthRes.error;
              }
            } catch (e) {
              ttsError = e.message;
            }
          }
        } else if (ttsEngine === 'gemini') {
          if (geminiAudioBase64 && textToSynthesize === turnResult?.spokenText) {
            audioBase64 = geminiAudioBase64;
          } else if (window.island?.gemini?.synthesizeSpeech) {
            try {
              const synthRes = await window.island.gemini.synthesizeSpeech({
                text: textToSynthesize,
                voice: 'Despina',
              });
              if (synthRes?.ok && synthRes.audioBase64) {
                audioBase64 = synthRes.audioBase64;
              } else {
                ttsError = synthRes?.error || 'Gemini TTS synthesis failed';
                if (synthRes?.isDailyQuota || synthRes?.error?.includes('exceeded your current quota')) {
                  ttsError = 'Gemini TTS daily quota reached (10/10 requests)';
                }
              }
            } catch (e) {
              ttsError = e.message;
            }
          }
        } else if (ttsEngine === 'windows') {
          // Native Windows SAPI speech synthesis via electron/windows-tts service
          const savedWindowsVoice = localStorage.getItem('island_windows_voice_uri') || undefined;
          if (window.island?.windowsTts?.synthesizeSpeech) {
            try {
              const winRes = await window.island.windowsTts.synthesizeSpeech({
                text: textToSynthesize,
                voice: savedWindowsVoice,
              });
              if (winRes?.ok && winRes.audioBase64) {
                audioBase64 = winRes.audioBase64;
              } else {
                ttsError = winRes?.error || 'Windows speech synthesis failed';
              }
            } catch (wErr) {
              ttsError = wErr.message;
            }
          }
        }

        // Graceful Native Fallback: If primary TTS failed or was unavailable,
        // synthesize via native Windows SAPI TTS so speech is audibly delivered to speakers!
        if (!audioBase64 && window.island?.windowsTts?.synthesizeSpeech) {
          try {
            const savedWindowsVoice = localStorage.getItem('island_windows_voice_uri') || undefined;
            const winFallbackRes = await window.island.windowsTts.synthesizeSpeech({
              text: textToSynthesize,
              voice: savedWindowsVoice,
            });
            if (winFallbackRes?.ok && winFallbackRes.audioBase64) {
              audioBase64 = winFallbackRes.audioBase64;
              logDevStage(9, 'Fell back to Native Windows SAPI TTS', {
                originalEngine: ttsEngine,
                originalError: ttsError,
                bytes: winFallbackRes.audioBase64.length,
              });
            }
          } catch (fbErr) {
            console.warn('[Windows TTS Fallback Error]', fbErr);
          }
        }

        logDevStage(9, 'TTS synthesis result', {
          engine: ttsEngine,
          ok: Boolean(audioBase64),
          durationMs: Date.now() - startTime,
          error: ttsError,
        });

        if (ttsError && audioBase64) {
          setErrorMessage(`${ttsError}. Using Windows Voice fallback.`);
        } else if (ttsError && !audioBase64) {
          setErrorMessage(`${ttsError}. Speech output unavailable.`);
        }

        return audioBase64;
      };

      if (isAwaitingBrowserOutcome) {
        // Multi-phase flow: Acknowledge immediately -> Await browser result -> Speak concise outcome
        const initialText =
          turnResult.actionResult.initialAcknowledgment ||
          turnResult.actionResult.spokenConfirmation ||
          `Opening ${turnResult.actionResult.track?.title || 'the song'}.`;

        setTranscript((prev) => [
          ...prev,
          { role: 'assistant', text: initialText },
        ]);
        historyRef.current.push({ role: 'assistant', text: initialText });

        // Transition to acknowledging state
        controller.setState('acknowledging', { turnId, text: initialText });
        const initialAudio = await synthesizeSpeechText(initialText);

        if (controller.isTurnActive(turnId)) {
          await speakAssistantResponse({
            audioBase64: initialAudio,
            text: initialText,
            turnId,
            isIntermediate: true,
          });
        }

        // Check if turn was superseded during initial speech
        if (!controller.isTurnActive(turnId)) {
          audioCoordinator.restoreVolume({ durationMs: 500 });
          return;
        }

        // Transition to executing / awaiting_result
        controller.setState('awaiting_result', {
          turnId,
          track: turnResult.actionResult.track,
        });

        // Wait for actual browser outcome (max 7500ms timeout)
        const outcome = await new Promise((resolve) => {
          let settled = false;
          let unsub = null;

          const timer = setTimeout(() => {
            if (!settled) {
              settled = true;
              if (unsub) unsub();
              resolve({ status: 'timed_out' });
            }
          }, 7500);

          if (window.island?.on) {
            unsub = window.island.on('companion:playback-state', (payload) => {
              if (settled) return;
              if (payload?.status === 'playing' || payload?.event === 'playing') {
                settled = true;
                clearTimeout(timer);
                if (unsub) unsub();
                resolve({ status: 'confirmed_playing', ...payload });
              } else if (payload?.status === 'autoplay_blocked' || payload?.event === 'autoplay_blocked') {
                settled = true;
                clearTimeout(timer);
                if (unsub) unsub();
                resolve({ status: 'autoplay_blocked', ...payload });
              }
            });
          }

          if (turnResult.actionResult.dispatchPromise) {
            turnResult.actionResult.dispatchPromise
              .then((res) => {
                if (settled) return;
                if (res?.status === 'confirmed_playing') {
                  settled = true;
                  clearTimeout(timer);
                  if (unsub) unsub();
                  resolve({ status: 'confirmed_playing', ...res });
                } else if (res?.status === 'navigated' || res?.ack?.isUnresolved) {
                  settled = true;
                  clearTimeout(timer);
                  if (unsub) unsub();
                  resolve({ status: 'search_results_opened', ...res });
                } else if (res?.status === 'autoplay_blocked') {
                  settled = true;
                  clearTimeout(timer);
                  if (unsub) unsub();
                  resolve({ status: 'autoplay_blocked', ...res });
                } else if (res?.status === 'navigation_completed_but_not_playing') {
                  settled = true;
                  clearTimeout(timer);
                  if (unsub) unsub();
                  resolve({ status: 'playback_pending', ...res });
                }
              })
              .catch((err) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                if (unsub) unsub();
                resolve({ status: 'failed', error: err.message });
              });
          }
        });

        // Correlate with Turn ID: Discard obsolete completions if superseded
        if (!controller.isTurnActive(turnId)) {
          audioCoordinator.restoreVolume({ durationMs: 500 });
          return;
        }

        // Deduplication: Produce AT MOST ONE completion announcement per turn
        if (handledTurnsRef.current.has(turnId)) {
          return;
        }
        handledTurnsRef.current.add(turnId);

        let finalOutcomeStatus = outcome.status;
        if (
          turnResult.actionResult.isUnresolved &&
          (finalOutcomeStatus === 'navigated' || finalOutcomeStatus === 'search_results_opened' || finalOutcomeStatus === 'timed_out')
        ) {
          finalOutcomeStatus = 'search_results_opened';
        }

        let terminalState = 'completed';
        if (finalOutcomeStatus === 'autoplay_blocked' || finalOutcomeStatus === 'playback_pending') {
          terminalState = 'needs_user_action';
        } else if (finalOutcomeStatus === 'failed' || finalOutcomeStatus === 'timed_out') {
          terminalState = 'failed';
        }

        controller.setState(terminalState, { turnId, outcome: finalOutcomeStatus });

        const targetTitle = turnResult.actionResult.track?.title || 'the song';
        const completionText = formatActionOutcomeSpeech(finalOutcomeStatus, targetTitle, {
          isUnresolved: turnResult.actionResult.isUnresolved,
          isSearch: turnResult.actionResult.isUnresolved,
        });

        setTranscript((prev) => [
          ...prev,
          { role: 'assistant', text: completionText },
        ]);
        historyRef.current.push({ role: 'assistant', text: completionText });

        const completionAudio = await synthesizeSpeechText(completionText);

        if (controller.isTurnActive(turnId)) {
          await speakAssistantResponse({
            audioBase64: completionAudio,
            text: completionText,
            turnId,
            isIntermediate: false,
          });

          // Priority 2: Natural Music Handoff & Transient Dismissal
          if (finalOutcomeStatus === 'confirmed_playing' || finalOutcomeStatus === 'playing') {
            controller.stopSession();
            setStatus('idle');
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('island:dismiss-voice'));
            }
          }
        } else {
          audioCoordinator.restoreVolume({ durationMs: 1100 });
          controller.finishSpeaking(turnId, 'listening');
          logDevStage(10, 'Voice turn completion', { turnId, nextState: 'listening' });
        }
      } else {
        // Immediate deterministic or conversational response (pause, resume, info, or chat)
        const agentResponse = turnResult.agentResponse || createAgentResponse({
          displayText: turnResult.transcriptText || turnResult.spokenText,
          spokenText: turnResult.spokenText,
        });

        const finalSpokenText = agentResponse.spokenText;
        const finalDisplayText = agentResponse.displayText;
        const inlineTracks = agentResponse.toolResults?.tracks || turnResult.actionResult?.tracks || null;
        const inlineCandidates = agentResponse.toolResults?.candidates || turnResult.actionResult?.candidates || null;
        const inlineWeather = agentResponse.toolResults?.weather || turnResult.actionResult?.weather || null;

        setTranscript((prev) => [
          ...prev,
          {
            role: 'assistant',
            text: finalDisplayText,
            displayText: finalDisplayText,
            spokenText: finalSpokenText,
            tracks: inlineTracks,
            candidates: inlineCandidates,
            weather: inlineWeather,
            responseStatus: agentResponse.responseStatus,
          },
        ]);
        historyRef.current.push({ role: 'assistant', text: finalDisplayText });

        latencyTracker.recordStage(turnId, 'tts_start');
        const spokenAudioBase64 = await synthesizeSpeechText(finalSpokenText);
        latencyTracker.recordStage(turnId, 'tts_end');

        if (controller.isTurnActive(turnId)) {
          await speakAssistantResponse({
            audioBase64: spokenAudioBase64,
            text: finalSpokenText,
            turnId,
            isIntermediate: false,
          });

          // Priority 2: Transient dismissal for confirmed music playback commands or polite session closings
          const action = turnResult.actionResult?.action;
          const isPlaybackHandoff =
            action === 'play_favorite' ||
            action === 'play_track' ||
            action === 'compound_pause_play' ||
            action === 'next_track' ||
            action === 'previous_track';
          const isSuccessful = turnResult.actionResult?.ok;
          const needsClarification = Boolean(
            turnResult.actionResult?.clarificationNeeded || turnResult.actionResult?.ambiguous
          );
          const isSessionDismiss = action === 'session_dismiss' || Boolean(turnResult.actionResult?.isSessionEnd);

          if ((isPlaybackHandoff && isSuccessful && !needsClarification) || isSessionDismiss) {
            controller.stopSession();
            setStatus('idle');
            audioCoordinator.restoreVolume({ durationMs: 600 });
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('island:dismiss-voice'));
            }
          }
        } else {
          audioCoordinator.restoreVolume({ durationMs: 1100 });
          controller.finishSpeaking(turnId, 'listening');
          logDevStage(10, 'Voice turn completion', { turnId, nextState: 'listening' });
        }
      }
    } catch (err) {
      console.warn('[Voice Turn Error]', err);
      audioCoordinator.cancelDucking();
      controller.handleTurnFailure(turnId, err.message || 'Error processing speech turn.');
    }
  }, [controller, speakAssistantResponse]);

  // Wire turn submission handler to controller
  useEffect(() => {
    controller.onTurnTriggered = (samples, turnId) => {
      latencyTracker.startTurn(turnId, { sampleCount: samples.length, userSpeechEndTime: Date.now() });
      logDevStage(3, 'Speech segment finalized', {
        sampleCount: samples.length,
        durationMs: Math.round((samples.length / 16000) * 1000),
        turnId,
      });
      submitUserSpeech(samples, 16000, turnId);
    };
  }, [controller, submitUserSpeech]);

  // Start real-time voice session
  const startSession = useCallback(async () => {
    // If session is already running or connecting, reuse without resetting
    if (controller.state !== 'idle' && controller.state !== 'error') {
      return;
    }
    cleanup();
    setStatus('connecting');
    setErrorMessage(null);
    setIsMuted(false);

    // Priority 1: Immediately duck music as soon as Voice Agent begins listening
    audioCoordinator.startDucking({ duckLevel: 0.10, durationMs: 250, media: mediaRef.current });

    try {
      // 1. Verify provider status from main process
      const activeChatProvider = localStorage.getItem('island_chat_provider') || localStorage.getItem('island_voice_provider') || 'gemini';
      if (activeChatProvider === 'gemini' && window.island?.gemini?.getStatus) {
        const geminiStatus = await window.island.gemini.getStatus();
        if (!geminiStatus?.hasKey) {
          throw new Error('GEMINI_API_KEY is not configured in .env. Please add your key to enable voice.');
        }
      } else if (activeChatProvider === 'groq' && window.island?.groq?.getStatus) {
        const groqStatus = await window.island.groq.getStatus();
        if (!groqStatus?.hasKey) {
          throw new Error('GROQ_API_KEY is not configured. Please add your key in Settings.');
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

      logDevStage(1, 'Audio capture started', {
        sampleRate: 16000,
        provider: activeChatProvider,
      });

      const micSource = audioCtx.createMediaStreamSource(micStream);
      const micAnalyser = audioCtx.createAnalyser();
      micAnalyser.fftSize = 64;
      micAnalyser.smoothingTimeConstant = 0.75;
      micSource.connect(micAnalyser);
      micAnalyserRef.current = micAnalyser;

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

      let lastVisualUpdate = 0;
      const updateAudioVisuals = (timestamp) => {
        // Throttle React state updates to ~30 FPS (every ~33ms) to prevent high CPU / UI lag
        if (!lastVisualUpdate || timestamp - lastVisualUpdate >= 32) {
          lastVisualUpdate = timestamp;
          let currentLevel = 0;

          const playbackAnalyser = getPlaybackAnalyser();
          if (controller.state === 'speaking' && playbackAnalyser) {
            playbackAnalyser.getByteFrequencyData(speakerData);
            let sum = 0;
            for (let i = 0; i < 16; i++) {
              const val = speakerData[i] / 255;
              bars[i] = bars[i] * 0.35 + val * 0.65;
              sum += val;
            }
            currentLevel = sum / 16;
            setAudioLevel(currentLevel);
            setWaveformData(new Float32Array(bars));
          } else if (micAnalyserRef.current && controller.state === 'listening') {
            micAnalyserRef.current.getByteFrequencyData(micData);
            let sum = 0;
            for (let i = 0; i < 16; i++) {
              const val = micData[i] / 255;
              bars[i] = bars[i] * 0.35 + val * 0.65;
              sum += val;
            }
            currentLevel = sum / 16;
            setAudioLevel(currentLevel);
            setWaveformData(new Float32Array(bars));
          } else if (controller.state === 'processing') {
            setAudioLevel(0.2);
          }
        }

        if (controller.state !== 'idle' && controller.state !== 'error') {
          animFrameRef.current = requestAnimationFrame(updateAudioVisuals);
        } else {
          animFrameRef.current = null;
        }
      };

      animFrameRef.current = requestAnimationFrame(updateAudioVisuals);

      controller.startSession();
    } catch (err) {
      cleanup();
      setStatus('error');
      setErrorMessage(err.message || 'Failed to start Gemini voice companion.');
    }
  }, [cleanup, controller]);

  // User-triggered dismissal of cooldown
  const dismissCooldown = useCallback(() => {
    controller.dismissCooldown();
    setStatus('listening');
    setCooldownSeconds(0);
  }, [controller]);

  // User-triggered dismissal of error state
  const clearError = useCallback(() => {
    controller.clearError();
    setStatus('listening');
    setErrorMessage(null);
  }, [controller]);

  // Direct text command submission through unified AI agent pipeline
  const submitText = useCallback(async (text) => {
    if (!text || typeof text !== 'string' || !text.trim()) return null;
    const turnId = Date.now();
    controller.startSession();
    return submitUserSpeech(text.trim(), 16000, turnId);
  }, [controller, submitUserSpeech]);

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
    endSession,
    submitText,
    interrupt,
    toggleMute,
    dismissCooldown,
    clearError,
  };
}
