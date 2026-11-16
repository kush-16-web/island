import React, { useEffect, useRef, useState } from 'react';
import MetaBalls from './animations/MetaBalls';
import FluidAurora from './animations/FluidAurora';
import AeroShards from './animations/AeroShards';

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

export async function getLoopbackAnalyser() {
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
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.15;

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
  const [bloom, setBloom] = useState(0);
  const animRef = useRef(null);
  const analyserRef = useRef(null);

  useEffect(() => {
    if (mode === 'off' || !isPlaying) {
      setPulse(0);
      setBloom(0);
      return;
    }

    let active = true;
    let t = 0;
    let decay = 0;
    let bloomDecay = 0;
    let lastBloomTime = 0;
    let prevSubBass = 0;
    let prevBass = 0;
    let prevMid = 0;
    let prevHigh = 0;
    const freqData = new Uint8Array(512);

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

        // High-Precision Multi-Band Spectrum (fftSize = 1024, ~46.9Hz per bin):
        // 1. Sub-Bass & Deep Kicks (~47Hz - 141Hz, e.g. FE!N 808s, One More Hour floor toms)
        let subSum = 0;
        for (let i = 1; i <= 3; i++) subSum += freqData[i];
        const currentSubBass = subSum / (3 * 255);

        // 2. Punch & Bass Body (~141Hz - 328Hz)
        let bassSum = 0;
        for (let i = 4; i <= 7; i++) bassSum += freqData[i];
        const currentBass = bassSum / (4 * 255);

        // 3. Mids / Claps / Snares / Vocals (~375Hz - 1875Hz, e.g. Harleys In Hawaii rimshots)
        let midSum = 0;
        for (let i = 8; i <= 40; i++) midSum += freqData[i];
        const currentMid = midSum / (33 * 255);

        // 4. Highs / Crisp Percussion / Hi-hats (~1900Hz - 6000Hz)
        let highSum = 0;
        for (let i = 41; i <= 128; i++) highSum += freqData[i];
        const currentHigh = highSum / (88 * 255);

        // Positive Spectral Flux (instantaneous energy rise per musical band)
        const subFlux = Math.max(0, currentSubBass - prevSubBass);
        const bassFlux = Math.max(0, currentBass - prevBass);
        const midFlux = Math.max(0, currentMid - prevMid);
        const highFlux = Math.max(0, currentHigh - prevHigh);

        prevSubBass = currentSubBass;
        prevBass = currentBass;
        prevMid = currentMid;
        prevHigh = currentHigh;

        // Weighted transient onset:
        // Deep sub-bass drops + sharp rimshots/claps get priority weighting
        const transient = Math.max(
          subFlux * 3.2,
          bassFlux * 2.4,
          midFlux * 1.8,
          highFlux * 1.3
        );

        if (transient > 0.05) {
          // Sharp punchy attack with fast recovery for consecutive trap beats & rolls
          decay = Math.min(1.0, decay * 0.35 + transient * 0.95);
          if (transient > 0.09 && typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('island:music-beat', {
              detail: { transient, subBass: currentSubBass }
            }));
          }
        } else {
          // Snappy, organic fluid decay
          decay = Math.max(0, decay * 0.82 - 0.015);
        }

        // Accent Gating for Warm Light Bloom:
        // Only fires on true heavy musical drops (transient > 0.28) with a 750ms phrasing cooldown
        // Eliminates continuous strobe/disco flashing and keeps lighting warm and gentle on the eyes
        const now = performance.now();
        if (transient > 0.28 && (now - lastBloomTime > 750)) {
          bloomDecay = Math.min(1.0, transient * 1.1);
          lastBloomTime = now;
        } else {
          // Soft, gentle ember fade
          bloomDecay = Math.max(0, bloomDecay * 0.91 - 0.015);
        }

        // Ambient groove presence from overall music energy
        const presence = (currentSubBass * 0.40 + currentBass * 0.30 + currentMid * 0.20 + currentHigh * 0.10) * 0.28;
        const totalPulse = Math.min(1.0, decay + presence);

        // If audio stream is silent/idle, smoothly blend with organic ambient wave
        if (currentSubBass === 0 && currentBass === 0 && currentMid === 0 && currentHigh === 0) {
          t += 0.035;
          const fallbackBeat = Math.pow(Math.sin(t * 1.8), 6) * 0.35 + Math.pow(Math.sin(t * 0.9), 2) * 0.12;
          setPulse(fallbackBeat);
          setBloom(0);
        } else {
          setPulse(totalPulse);
          setBloom(bloomDecay);
        }
      } else {
        // Fallback transient pulse wave
        t += 0.035;
        const beat = Math.pow(Math.sin(t * 1.8), 6) * 0.35 + Math.pow(Math.sin(t * 0.9), 2) * 0.12;
        setPulse(beat);
        setBloom(0);
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

  const isShards = mode === 'shards' || mode === 'aeroshards';

  return (
    <div
      className={`island-liquid-metaballs${isShards ? ' island-liquid-metaballs--shards' : ''} ${className}`}
      aria-hidden="true"
    >
      {mode === 'shards' || mode === 'aeroshards' ? (
        <AeroShards
          color={color}
          speed={isPlaying ? 0.35 : 0}
          paused={!isPlaying}
          beatPulse={pulse}
          bloomPulse={bloom}
        />
      ) : mode === 'aurora' || mode === 'fluid' ? (
        <FluidAurora
          color={color}
          speed={isPlaying ? 0.35 : 0}
          paused={!isPlaying}
          beatPulse={pulse}
          bloomPulse={bloom}
        />
      ) : (
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
          bloomPulse={bloom}
        />
      )}
    </div>
  );
}
