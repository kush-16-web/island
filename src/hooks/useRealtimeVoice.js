import { useCallback, useEffect, useRef, useState } from 'react';
import { VoiceTurnController } from '../lib/voice-turn-controller';
import { processTurnIntent } from '../lib/voice-intent';
import { getAssistantName } from '../lib/assistant';
import { audioCoordinator } from '../lib/audio-coordinator';
import { interpretLocalMusicCommand } from '../lib/music-command-interpreter';

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
        currentSourceRef.current.onended = null;
        currentSourceRef.current.stop();
        currentSourceRef.current.disconnect();
      } catch {}
      currentSourceRef.current = null;
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
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.onended = null;
        currentSourceRef.current.stop();
        currentSourceRef.current.disconnect();
      } catch {}
      currentSourceRef.current = null;
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

  // Play audio buffer received from TTS with real-time waveform connection
  const playAssistantSpeech = useCallback(async (audioBase64, text, turnId, onSpeechComplete = null) => {
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
          currentSourceRef.current.onended = null;
          currentSourceRef.current.stop();
          currentSourceRef.current.disconnect();
        } catch {}
        currentSourceRef.current = null;
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
          if (typeof onSpeechComplete === 'function') {
            try { onSpeechComplete(); } catch {}
          }
        }
      };

      source.start(0);
    } catch (err) {
      console.warn('[Audio Playback Error]', err);
      controller.finishSpeaking(turnId);
      if (typeof onSpeechComplete === 'function') {
        try { onSpeechComplete(); } catch {}
      }
    }
  }, [controller]);

  // Submit recorded user utterance through modular AI pipeline: STT -> Conversational LLM -> Island Action -> TTS
  const submitUserSpeech = useCallback(async (samples, sampleRate, turnId) => {
    try {
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

      // Validate provider readiness before proceeding to avoid mysterious failures
      if (chatProvider === 'groq' || sttProvider === 'groq-whisper') {
        const groqStatus = await window.island?.groq?.getStatus?.();
        if (!groqStatus?.hasKey) {
          controller.handleTurnFailure(turnId, 'Groq API Key is not configured. Please paste your key in Settings and click Save Key.', {
            retryDelaySeconds: 0,
            isDailyQuota: false,
          });
          return;
        }
      }

      // Encode samples into standard 16-bit mono WAV
      const wavBuffer = encodeWav(samples, sampleRate);
      const audioData = arrayBufferToBase64(wavBuffer);

      let userText = null;

      // 1. Stage 1: Speech-to-Text (STT)
      if (sttProvider === 'groq-whisper') {
        if (!window.island?.groq?.transcribe) {
          throw new Error('Groq Whisper speech recognition service is not available in Electron.');
        }

        const sttRes = await window.island.groq.transcribe({
          audioBase64: audioData,
          model: groqWhisperModel,
        });

        if (!controller.isTurnActive(turnId)) return;

        if (!sttRes?.ok) {
          controller.handleTurnFailure(turnId, sttRes?.error || 'Failed to transcribe audio with Groq Whisper.', {
            retryDelaySeconds: sttRes?.retryDelaySeconds || 0,
            isDailyQuota: sttRes?.isDailyQuota || false,
          });
          return;
        }

        if (sttRes.empty || !sttRes.text?.trim()) {
          // Silence or no speech detected; reset turn cleanly without error
          controller.finishSpeaking(turnId);
          return;
        }

        userText = sttRes.text.trim();
      }

      // Add user speech entry to transcript
      const displayedUserText = userText || `Voice message to ${assistantName}`;
      setTranscript((prev) => [
        ...prev,
        { role: 'user', text: displayedUserText },
      ]);
      historyRef.current.push({ role: 'user', text: displayedUserText });

      // 2. Direct Local Music Command Interpretation (PASS 2 - PART B)
      // Checks local-first command grammar to completely eliminate unnecessary Groq chat calls
      let localMusicResult = null;
      if (userText) {
        const localEval = interpretLocalMusicCommand(userText, {
          media: mediaRef.current || { active: false },
          onControl: onControlRef.current || ((act) => window.island?.media?.control?.(act)),
          turnId,
        });
        if (localEval.handledLocally && localEval.actionResult) {
          localMusicResult = localEval.actionResult;
        }
      }

      let turnResult = null;
      let geminiAudioBase64 = null;

      if (localMusicResult) {
        // Handled deterministically locally: 0 Groq chat API quota spent
        let confirmation = localMusicResult.spokenConfirmation || 'Action completed.';
        if (
          localMusicResult.ok &&
          localMusicResult.track?.title &&
          (localMusicResult.action === 'play_favorite' ||
           localMusicResult.action === 'play_track' ||
           localMusicResult.action === 'play_random_favorite')
        ) {
          const artistText = localMusicResult.track.artist ? ` by ${localMusicResult.track.artist}` : '';
          confirmation = `Playing ${localMusicResult.track.title}${artistText}.`;
        }
        turnResult = {
          executed: true,
          actionResult: localMusicResult,
          spokenText: confirmation,
          transcriptText: confirmation,
        };
      } else {
        // 3. Stage 2: Conversational LLM (if not handled by direct local action)
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

        // 4. Stage 3: Truth-grounded Island Action Execution
        turnResult = processTurnIntent(llmReplyText, {
          media: mediaRef.current || { active: false },
          onControl: onControlRef.current || ((act) => window.island?.media?.control?.(act)),
        });
      }

      const finalSpokenText = turnResult.spokenText;
      const finalTranscriptText = turnResult.transcriptText;

      setTranscript((prev) => [
        ...prev,
        { role: 'assistant', text: finalTranscriptText },
      ]);
      historyRef.current.push({ role: 'assistant', text: finalTranscriptText });

      // Check if this action triggers music playback (PASS 2 - PART E & F)
      const isPlaybackAction = Boolean(
        turnResult.actionResult?.ok && (
          turnResult.actionResult.action === 'play_favorite' ||
          turnResult.actionResult.action === 'play_track' ||
          turnResult.actionResult.action === 'play_random_favorite'
        )
      );

      if (isPlaybackAction) {
        // Start playing music softly in background (~22% volume) over 250ms
        audioCoordinator.startDucking({ duckLevel: 0.22, durationMs: 250 });
      }

      const handleSpeechComplete = () => {
        if (isPlaybackAction) {
          // Smoothly fade music back up to 100% user volume over 1100ms
          audioCoordinator.restoreVolume({ durationMs: 1100 });
          // Smoothly transition expanded view toward Now Playing view while keeping session active
          if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
            window.dispatchEvent(new CustomEvent('island:navigate', { detail: { tab: 'playing' } }));
          }
        }
      };

      // 5. Stage 4: Speech Synthesis (TTS)
      let spokenAudioBase64 = null;

      if (ttsEngine === 'kokoro') {
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

        // STRICT SAFETY: Never call Gemini TTS unless user explicitly turned on cloud fallback
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
      } else if (ttsEngine === 'gemini') {
        spokenAudioBase64 = geminiAudioBase64;
        if (!spokenAudioBase64 && window.island?.gemini?.synthesizeSpeech) {
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
        await playAssistantSpeech(spokenAudioBase64, finalSpokenText, turnId, handleSpeechComplete);
      } else {
        handleSpeechComplete();
        controller.finishSpeaking(turnId);
      }
    } catch (err) {
      console.warn('[Voice Turn Error]', err);
      audioCoordinator.cancelDucking();
      controller.handleTurnFailure(turnId, err.message || 'Error processing speech turn.');
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
    // If session is already running or connecting, reuse without resetting
    if (controller.state !== 'idle' && controller.state !== 'error') {
      return;
    }
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

      let lastVisualUpdate = 0;
      const updateAudioVisuals = (timestamp) => {
        // Throttle React state updates to ~30 FPS (every ~33ms) to prevent high CPU / UI lag
        if (!lastVisualUpdate || timestamp - lastVisualUpdate >= 32) {
          lastVisualUpdate = timestamp;
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
    interrupt,
    toggleMute,
    dismissCooldown,
    clearError,
  };
}
