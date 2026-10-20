import { useCallback, useEffect, useRef, useState } from 'react';

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
  view.setUint32(28, sampleRate * 2, true); // Byte rate (SampleRate * NumChannels * BitsPerSample/8)
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
 * Default provider: Gemini Voice Pipeline (Gemini 3.5 Flash intelligence + Gemini 3.8 Flash TTS).
 * Features:
 * - Real audio-driven waveforms (both user mic and assistant speaker)
 * - Intelligent client-side VAD with auto-turn detection
 * - Instant voice interruption upon user speaking or clicking interrupt
 * - Multi-turn conversational context in English, Hindi, and Hinglish
 * - Clean resource release on session close
 */
export function useRealtimeVoice() {
  const [provider, setProvider] = useState(() => localStorage.getItem('island_voice_provider') || 'gemini');
  const [status, setStatus] = useState('idle'); // 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'error'
  const [errorMessage, setErrorMessage] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [transcript, setTranscript] = useState([]);
  const [audioLevel, setAudioLevel] = useState(0);
  const [waveformData, setWaveformData] = useState(() => new Float32Array(16).fill(0.1));

  // Audio nodes and references
  const micStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const micAnalyserRef = useRef(null);
  const speakerAnalyserRef = useRef(null);
  const scriptProcessorRef = useRef(null);
  const currentSourceRef = useRef(null);
  const animFrameRef = useRef(null);

  // VAD and recording state
  const isSpeakingRef = useRef(false);
  const isUserSpeakingRef = useRef(false);
  const accumulatedSamplesRef = useRef([]);
  const silenceTimerRef = useRef(null);
  const historyRef = useRef([]);

  // Clean up all audio contexts, tracks, and timers
  const cleanup = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
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
    isSpeakingRef.current = false;
    isUserSpeakingRef.current = false;
    accumulatedSamplesRef.current = [];

    setAudioLevel(0);
    setWaveformData(new Float32Array(16).fill(0.1));

    // Reset pet voice state
    window.island?.setVoiceMood?.('idle');
  }, []);

  // Stop active session
  const stopSession = useCallback(() => {
    cleanup();
    setStatus('idle');
    setErrorMessage(null);
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
    isSpeakingRef.current = false;
    setStatus('listening');
    window.island?.setVoiceMood?.('listening');
  }, []);

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
  const playAssistantSpeech = useCallback(async (audioBase64, text) => {
    const audioCtx = audioContextRef.current;
    if (!audioCtx) return;

    try {
      const arrayBuffer = base64ToArrayBuffer(audioBase64);
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

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

      isSpeakingRef.current = true;
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
          isSpeakingRef.current = false;
          setStatus('listening');
          window.island?.setVoiceMood?.('listening');
        }
      };

      source.start(0);
    } catch (err) {
      console.warn('[Audio Playback Error]', err);
      // Fallback to listening if audio decode fails
      isSpeakingRef.current = false;
      setStatus('listening');
      window.island?.setVoiceMood?.('listening');
    }
  }, []);

  // Submit recorded user utterance to Gemini
  const submitUserSpeech = useCallback(async (samples, sampleRate) => {
    if (!samples || samples.length < sampleRate * 0.4) {
      // Too short / background pop: resume listening
      setStatus('listening');
      window.island?.setVoiceMood?.('listening');
      return;
    }

    setStatus('thinking');
    window.island?.setVoiceMood?.('listening');

    try {
      const petName = localStorage.getItem('island_pet_name') || 'Cat';
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
        petName,
        userName,
      });

      if (!res.ok) {
        throw new Error(res.error || 'Failed to get response from Gemini.');
      }

      // Add user speech entry to transcript
      setTranscript((prev) => [
        ...prev,
        { role: 'user', text: `Voice message to ${petName}` },
      ]);
      historyRef.current.push({ role: 'user', text: `Voice message to ${petName}` });

      // Play generated speech audio
      if (res.audioBase64) {
        await playAssistantSpeech(res.audioBase64, res.text);
      } else {
        // Text-only fallback if audio failed
        setTranscript((prev) => [
          ...prev,
          { role: 'assistant', text: res.text },
        ]);
        setStatus('listening');
        window.island?.setVoiceMood?.('listening');
      }
    } catch (err) {
      console.warn('[Gemini voice submit error]', err);
      setStatus('error');
      setErrorMessage(err.message || 'Error processing speech with Gemini.');
      window.island?.setVoiceMood?.('idle');
    }
  }, [playAssistantSpeech]);

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

      // 4. Client-side VAD (Voice Activity Detection) via ScriptProcessor
      // Accumulates microphone PCM floats when user speaks; auto-submits on natural pause.
      const bufferSize = 2048;
      const processor = audioCtx.createScriptProcessor(bufferSize, 1, 1);
      scriptProcessorRef.current = processor;

      accumulatedSamplesRef.current = [];
      isUserSpeakingRef.current = false;

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

        // Interrupt assistant if user starts speaking while assistant is talking
        if (isSpeakingRef.current && rms > 0.035) {
          interrupt();
        }

        // Voice Activity Detection threshold
        if (rms > 0.02) {
          isUserSpeakingRef.current = true;
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
          }
          // Accumulate raw PCM samples
          const chunk = new Float32Array(inputData);
          accumulatedSamplesRef.current.push(chunk);
        } else if (isUserSpeakingRef.current) {
          // Still accumulate minor trailing frames
          const chunk = new Float32Array(inputData);
          accumulatedSamplesRef.current.push(chunk);

          // If silence lasts >= 850ms, user has completed their turn!
          if (!silenceTimerRef.current) {
            silenceTimerRef.current = setTimeout(() => {
              isUserSpeakingRef.current = false;
              silenceTimerRef.current = null;

              // Flatten accumulated sample chunks
              const totalLength = accumulatedSamplesRef.current.reduce((acc, c) => acc + c.length, 0);
              const flatSamples = new Float32Array(totalLength);
              let offset = 0;
              for (const c of accumulatedSamplesRef.current) {
                flatSamples.set(c, offset);
                offset += c.length;
              }
              accumulatedSamplesRef.current = [];

              // Send to Gemini
              submitUserSpeech(flatSamples, audioCtx.sampleRate);
            }, 850);
          }
        }
      };

      micSource.connect(processor);
      // Connect to destination through a gain node with 0 volume to keep the processor running without audio feedback
      const nullGain = audioCtx.createGain();
      nullGain.gain.value = 0;
      processor.connect(nullGain);
      nullGain.connect(audioCtx.destination);

      // 5. Start audio-reactive animation loop (drives visualizer with actual audio)
      const micData = new Uint8Array(32);
      const speakerData = new Uint8Array(32);
      const bars = new Float32Array(16);

      const updateAudioVisuals = () => {
        let currentLevel = 0;

        if (isSpeakingRef.current && speakerAnalyserRef.current) {
          speakerAnalyserRef.current.getByteFrequencyData(speakerData);
          let sum = 0;
          for (let i = 0; i < 16; i++) {
            const val = speakerData[i] / 255;
            bars[i] = bars[i] * 0.35 + val * 0.65;
            sum += val;
          }
          currentLevel = sum / 16;
        } else if (micAnalyserRef.current) {
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

      setStatus('listening');
      window.island?.setVoiceMood?.('listening');
    } catch (err) {
      cleanup();
      setStatus('error');
      setErrorMessage(err.message || 'Failed to start Gemini voice companion.');
    }
  }, [cleanup, interrupt, submitUserSpeech]);

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
    startSession,
    stopSession,
    interrupt,
    toggleMute,
  };
}
