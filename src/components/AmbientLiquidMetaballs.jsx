import React, { useEffect, useRef, useState } from 'react';
import MetaBalls from './animations/MetaBalls';

/**
 * AmbientLiquidMetaballs — Official ReactBits WebGL2 Engine for Island.
 *
 * Real-time Audio Loopback & Organic Fluid Parameters:
 * - ballCount: 14
 * - speed: 0.35 (fluid drift)
 * - clumpFactor: 1.0 (organic cluster center pull)
 * - stretch: 0.55 (liquid surface tension elongation)
 * - wobble: 0.50 (fluid surface rippling)
 * - gooeyness: 0.55 (analytic distance-field bridging & pinching)
 * - originX: 0.72 (anchored in the spacious right void to preserve lyric readability)
 * - Real-time WASAPI Desktop Loopback: tracks live bass transients & drum kicks (40Hz-150Hz)
 * - Graceful fallback to rhythmic transient waves when loopback is silent
 * - Completely unmounted when mode === 'off' (reveals original signature blurred album art aura)
 */

let sharedAudioStream = null;
let sharedAudioContext = null;
let sharedAnalyser = null;
let capturePromise = null;

async function getLoopbackAnalyser() {
  if (sharedAnalyser && sharedAudioContext && sharedAudioContext.state !== 'closed') {
    if (sharedAudioContext.state === 'suspended') {
      await sharedAudioContext.resume().catch(() => {});
    }
    return sharedAnalyser;
  }

  if (capturePromise) return capturePromise;

  capturePromise = (async () => {
    try {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getDisplayMedia) {
        return null;
      }

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });

      // Stop video track immediately — zero video decoding overhead!
      const videoTracks = stream.getVideoTracks();
      videoTracks.forEach((track) => track.stop());

      const audioTracks = stream.getAudioTracks();
      if (!audioTracks || audioTracks.length === 0) {
        return null;
      }

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;

      const audioCtx = new AudioCtx();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.45;

      // Note: Never connect analyser to audioCtx.destination! Zero feedback loop.
      source.connect(analyser);

      sharedAudioStream = stream;
      sharedAudioContext = audioCtx;
      sharedAnalyser = analyser;

      return analyser;
    } catch {
      // Quietly fall back without console spam if user cancelled or in unsupported sandbox
      return null;
    } finally {
      capturePromise = null;
    }
  })();

  return capturePromise;
}

export default function AmbientLiquidMetaballs({
  mode = 'dynamic',
  accentColor = '#ff3b69',
  isPlaying = false,
  className = '',
}) {
  const [pulse, setPulse] = useState(0);
  const animRef = useRef(null);
  const analyserRef = useRef(null);

  useEffect(() => {
    if (mode === 'off' || !isPlaying) {
      setPulse(0);
      return;
    }

    let active = true;
    let t = 0;
    let decay = 0;
    let prevBass = 0;
    let prevMid = 0;
    let prevHigh = 0;
    const freqData = new Uint8Array(128);

    getLoopbackAnalyser().then((analyser) => {
      if (active && analyser) {
        analyserRef.current = analyser;
      }
    });

    const tick = () => {
      if (!active) return;

      const analyser = analyserRef.current;
      if (analyser) {
        analyser.getByteFrequencyData(freqData);

        // Multi-Band Spectrum:
        // 1. Low / Sub-bass / Kicks (~40Hz - 340Hz)
        let bassSum = 0;
        for (let i = 1; i <= 4; i++) bassSum += freqData[i];
        const currentBass = bassSum / (4 * 255);

        // 2. Mids / Claps / Snares / Guitars / Marimbas (~350Hz - 1900Hz)
        let midSum = 0;
        for (let i = 5; i <= 22; i++) midSum += freqData[i];
        const currentMid = midSum / (18 * 255);

        // 3. Highs / Percussion / Hats / Shakers (~2000Hz - 5500Hz)
        let highSum = 0;
        for (let i = 23; i <= 64; i++) highSum += freqData[i];
        const currentHigh = highSum / (42 * 255);

        // Positive Spectral Flux (instantaneous energy jump per band)
        const bassFlux = Math.max(0, currentBass - prevBass);
        const midFlux = Math.max(0, currentMid - prevMid);
        const highFlux = Math.max(0, currentHigh - prevHigh);

        prevBass = currentBass;
        prevMid = currentMid;
        prevHigh = currentHigh;

        // Weighted transient onset:
        // Catches deep bass drops + snappy claps/snares with smooth, musical elasticity
        const transient = Math.max(
          bassFlux * 2.4,
          midFlux * 1.8,
          highFlux * 1.2
        );

        if (transient > 0.08) {
          // Smooth additive pulse: no lockout, catches consecutive 8th/16th note beats
          decay = Math.min(0.65, decay * 0.5 + transient * 0.7);
        } else {
          // Natural bouncy fluid decay
          decay = Math.max(0, decay * 0.86 - 0.012);
        }

        // Ambient groove breathing from overall music presence
        const presence = (currentBass * 0.35 + currentMid * 0.32 + currentHigh * 0.24) * 0.26;
        const totalPulse = Math.min(0.75, decay + presence);

        // If audio stream is silent/idle, smoothly blend with organic ambient wave
        if (currentBass === 0 && currentMid === 0 && currentHigh === 0) {
          t += 0.035;
          const fallbackBeat = Math.pow(Math.sin(t * 1.8), 6) * 0.35 + Math.pow(Math.sin(t * 0.9), 2) * 0.12;
          setPulse(fallbackBeat);
        } else {
          setPulse(totalPulse);
        }
      } else {
        // Fallback transient pulse wave
        t += 0.035;
        const beat = Math.pow(Math.sin(t * 1.8), 6) * 0.35 + Math.pow(Math.sin(t * 0.9), 2) * 0.12;
        setPulse(beat);
      }

      animRef.current = requestAnimationFrame(tick);
    };

    animRef.current = requestAnimationFrame(tick);
    return () => {
      active = false;
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [mode, isPlaying]);

  if (mode === 'off') return null;

  const isWhite = mode === 'white';
  const color = isWhite ? '#ffffff' : (accentColor || '#ff3b69');

  return (
    <div
      className={`island-liquid-metaballs ${className}`}
      aria-hidden="true"
    >
      <MetaBalls
        color={color}
        speed={isPlaying ? 0.35 : 0}
        ballCount={14}
        clumpFactor={1.0}
        gooeyness={0.55}
        wobble={0.5}
        stretch={0.55}
        animationSize={24}
        originX={0.72}
        originY={0.50}
        enableTransparency={true}
        paused={!isPlaying}
        beatPulse={pulse}
      />
    </div>
  );
}
