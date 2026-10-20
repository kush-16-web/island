import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * useRealtimeVoice: Real-time, full-duplex conversational voice companion
 * using OpenAI Realtime WebRTC API.
 * Features:
 * - Ephemeral token broker via Electron main process (API key never exposed to client)
 * - Server-side VAD with instant voice interruption
 * - Audio-reactive microphone & speaker waveform analysis
 * - English, Hindi, and Hinglish fluent conversation
 * - Live transcription of both user and assistant speech
 * - Clean resource disposal on session end
 */
export function useRealtimeVoice() {
  const [status, setStatus] = useState('idle'); // 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'error'
  const [errorMessage, setErrorMessage] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [transcript, setTranscript] = useState([]); // [{ role: 'user'|'assistant', text: string, isLive?: boolean }]
  const [audioLevel, setAudioLevel] = useState(0); // 0 to 1 normalized level for reactive waveform
  const [waveformData, setWaveformData] = useState(() => new Float32Array(16).fill(0.1));

  const pcRef = useRef(null);
  const dcRef = useRef(null);
  const micStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const micAnalyserRef = useRef(null);
  const speakerAnalyserRef = useRef(null);
  const audioElementRef = useRef(null);
  const animFrameRef = useRef(null);
  const isSpeakingRef = useRef(false);

  // Clean up all resources
  const cleanup = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    if (dcRef.current) {
      try {
        dcRef.current.close();
      } catch {}
      dcRef.current = null;
    }

    if (pcRef.current) {
      try {
        pcRef.current.close();
      } catch {}
      pcRef.current = null;
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

    if (audioElementRef.current) {
      audioElementRef.current.srcObject = null;
      audioElementRef.current = null;
    }

    micAnalyserRef.current = null;
    speakerAnalyserRef.current = null;
    isSpeakingRef.current = false;
    setAudioLevel(0);

    // Reset pet mood to normal
    window.island?.setVoiceMood?.('idle');
  }, []);

  // Stop active session
  const stopSession = useCallback(() => {
    cleanup();
    setStatus('idle');
    setErrorMessage(null);
  }, [cleanup]);

  // Interrupt assistant
  const interrupt = useCallback(() => {
    if (dcRef.current && dcRef.current.readyState === 'open') {
      try {
        dcRef.current.send(JSON.stringify({ type: 'response.cancel' }));
      } catch {}
    }
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current.currentTime = 0;
    }
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

  // Start real-time voice session
  const startSession = useCallback(async () => {
    cleanup();
    setStatus('connecting');
    setErrorMessage(null);
    setIsMuted(false);

    try {
      // 1. Get identity preferences
      const petName = localStorage.getItem('island_pet_name') || 'Mochi';
      const userName = localStorage.getItem('island_user_name') || 'Friend';

      // 2. Request short-lived ephemeral client secret from Electron broker
      if (!window.island?.realtime?.createSession) {
        throw new Error('Realtime voice is not supported in this environment.');
      }

      const sessionRes = await window.island.realtime.createSession({
        petName,
        userName,
        voice: 'verse',
      });

      if (!sessionRes || !sessionRes.ok || !sessionRes.clientSecret) {
        throw new Error(sessionRes?.error || 'Could not create voice session.');
      }

      const { clientSecret, model } = sessionRes;

      // 3. Acquire user microphone
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
            ? 'Microphone access was denied. Please allow microphone permissions.'
            : 'Could not access microphone.'
        );
      }

      // 4. Set up Web Audio Context & Analysers for reactive waveform visualization
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;

      // Mic analyser
      const micSource = audioCtx.createMediaStreamSource(micStream);
      const micAnalyser = audioCtx.createAnalyser();
      micAnalyser.fftSize = 64;
      micAnalyser.smoothingTimeConstant = 0.8;
      micSource.connect(micAnalyser);
      micAnalyserRef.current = micAnalyser;

      // Speaker analyser & playback element
      const audioEl = new Audio();
      audioEl.autoplay = true;
      audioElementRef.current = audioEl;

      // 5. Initialize WebRTC PeerConnection
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      // Handle remote incoming audio stream from OpenAI
      pc.ontrack = (event) => {
        audioEl.srcObject = event.streams[0];
        try {
          const streamSource = audioCtx.createMediaStreamSource(event.streams[0]);
          const speakerAnalyser = audioCtx.createAnalyser();
          speakerAnalyser.fftSize = 64;
          speakerAnalyser.smoothingTimeConstant = 0.8;
          streamSource.connect(speakerAnalyser);
          speakerAnalyserRef.current = speakerAnalyser;
        } catch {
          // Fallback if browser security restricts cross-stream analysis
        }
      };

      // Add local microphone audio track to peer connection
      const micTrack = micStream.getAudioTracks()[0];
      pc.addTrack(micTrack, micStream);

      // Create WebRTC Data Channel for realtime control events
      const dc = pc.createDataChannel('oai-events');
      dcRef.current = dc;

      // Data Channel Event Handlers
      dc.onopen = () => {
        // Send initial session configuration
        const sessionUpdateEvent = {
          type: 'session.update',
          session: {
            instructions: `You are ${petName}, a warm, witty, and helpful AI desktop companion living inside the Dynamic Island. You are conversing directly with ${userName}. Keep your spoken responses concise (1 to 3 natural sentences) and conversational. You naturally understand and can converse fluently in English, Hindi, and Hinglish. Never use markdown formatting, bullet points, or emojis in your speech, as your output is spoken aloud.`,
            voice: 'verse',
            turn_detection: {
              type: 'server_vad',
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 500,
            },
            input_audio_transcription: {
              model: 'whisper-1',
            },
          },
        };
        dc.send(JSON.stringify(sessionUpdateEvent));
        setStatus('listening');
        window.island?.setVoiceMood?.('listening');
      };

      dc.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          // User started speaking -> interrupt assistant immediately!
          if (msg.type === 'input_audio_buffer.speech_started') {
            if (isSpeakingRef.current) {
              interrupt();
            }
            setStatus('listening');
            window.island?.setVoiceMood?.('listening');
          }

          // User stopped speaking -> thinking
          if (msg.type === 'input_audio_buffer.speech_stopped') {
            setStatus('thinking');
            window.island?.setVoiceMood?.('listening');
          }

          // User speech transcription completed
          if (msg.type === 'conversation.item.input_audio_transcription.completed' && msg.transcript) {
            setTranscript((prev) => [
              ...prev.filter((t) => !t.isLive),
              { role: 'user', text: msg.transcript.trim() },
            ]);
          }

          // Assistant speech delta streaming
          if (msg.type === 'response.audio_transcript.delta' && msg.delta) {
            setStatus('speaking');
            isSpeakingRef.current = true;
            window.island?.setVoiceMood?.('speaking');

            setTranscript((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.role === 'assistant' && last.isLive) {
                return [...prev.slice(0, -1), { role: 'assistant', text: last.text + msg.delta, isLive: true }];
              }
              return [...prev, { role: 'assistant', text: msg.delta, isLive: true }];
            });
          }

          // Assistant response completed
          if (msg.type === 'response.done') {
            isSpeakingRef.current = false;
            setTranscript((prev) =>
              prev.map((t) => (t.isLive ? { ...t, isLive: false } : t))
            );
            setStatus('listening');
            window.island?.setVoiceMood?.('listening');
          }

          // Error from OpenAI Realtime
          if (msg.type === 'error') {
            console.warn('[Realtime error]', msg.error);
            setErrorMessage(msg.error?.message || 'OpenAI Realtime error');
            setStatus('error');
            window.island?.setVoiceMood?.('idle');
          }
        } catch {}
      };

      // 6. Create SDP Offer & connect to OpenAI WebRTC Endpoint
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const endpoints = [
        'https://api.openai.com/v1/realtime/calls',
        `https://api.openai.com/v1/realtime?model=${model}`,
      ];

      let sdpAnswer = null;
      let lastErr = null;

      for (const endpoint of endpoints) {
        try {
          const sdpRes = await fetch(endpoint, {
            method: 'POST',
            body: offer.sdp,
            headers: {
              Authorization: `Bearer ${clientSecret}`,
              'Content-Type': 'application/sdp',
            },
          });

          if (sdpRes.ok) {
            sdpAnswer = await sdpRes.text();
            break;
          } else {
            lastErr = await sdpRes.text();
          }
        } catch (e) {
          lastErr = e.message;
        }
      }

      if (!sdpAnswer) {
        throw new Error(`Failed to establish WebRTC connection: ${lastErr || 'Server rejected offer'}`);
      }

      await pc.setRemoteDescription({ type: 'answer', sdp: sdpAnswer });

      // 7. Start real-time audio visualization loop
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
            bars[i] = bars[i] * 0.4 + val * 0.6;
            sum += val;
          }
          currentLevel = sum / 16;
        } else if (micAnalyserRef.current) {
          micAnalyserRef.current.getByteFrequencyData(micData);
          let sum = 0;
          for (let i = 0; i < 16; i++) {
            const val = micData[i] / 255;
            bars[i] = bars[i] * 0.4 + val * 0.6;
            sum += val;
          }
          currentLevel = sum / 16;
        }

        setAudioLevel(currentLevel);
        setWaveformData(new Float32Array(bars));

        animFrameRef.current = requestAnimationFrame(updateAudioVisuals);
      };

      animFrameRef.current = requestAnimationFrame(updateAudioVisuals);
    } catch (err) {
      cleanup();
      setStatus('error');
      setErrorMessage(err.message || 'Failed to start voice companion.');
    }
  }, [cleanup, interrupt]);

  // Listen to global shortcut 'voice:toggle' from Electron
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
