import React, { useEffect, useRef, useState } from 'react';
import MetaBalls from './animations/MetaBalls';
import FluidAurora from './animations/FluidAurora';
import AeroShards from './animations/AeroShards';
import Galaxy from './animations/Galaxy';
import GhostFibers from './animations/GhostFibers';
import GradientWaves from './animations/GradientWaves';
import LightRays from './animations/LightRays';

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
      analyser.smoothingTimeConstant = 0.18;
      analyser.minDecibels = -85;
      analyser.maxDecibels = -15;

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
  blurPx,
  reactive,
  isLoopbackDisabled = false,
  className = '',
  originX = 0.52,
  originY = 0.58,
  preset = 'spotlight',
}) {
  const [pulse, setPulse] = useState(0);
  const [bloom, setBloom] = useState(0);
  const [melody, setMelody] = useState(0);
  const [audioBands, setAudioBands] = useState([0.25, 0.25, 0.28, 0.1]);
  const animRef = useRef(null);
  const analyserRef = useRef(null);

  // User customizable blur and audio reactivity state
  const [customBlur, setCustomBlur] = useState(() => {
    if (typeof blurPx === 'number') return blurPx;
    try {
      const saved = localStorage.getItem('island_aura_blur');
      return saved !== null ? (Number(saved) / 100) * 10 : 2.5;
    } catch {
      return 2.5;
    }
  });

  const [isReactive, setIsReactive] = useState(() => {
    if (typeof reactive === 'boolean') return reactive;
    try {
      return localStorage.getItem('island_aura_reactive') !== 'false';
    } catch {
      return true;
    }
  });

  useEffect(() => {
    if (typeof blurPx === 'number') setCustomBlur(blurPx);
  }, [blurPx]);

  useEffect(() => {
    if (typeof reactive === 'boolean') setIsReactive(reactive);
  }, [reactive]);

  useEffect(() => {
    const handleAuraChange = (e) => {
      if (e.detail?.blur !== undefined && typeof blurPx !== 'number') {
        setCustomBlur((Number(e.detail.blur) / 100) * 10);
      }
      if (e.detail?.reactive !== undefined && typeof reactive !== 'boolean') {
        setIsReactive(Boolean(e.detail.reactive));
      }
    };
    window.addEventListener('island:aura-settings-changed', handleAuraChange);
    let unsub;
    if (window.island?.on) {
      unsub = window.island.on('aura:settings-changed', (s) => {
        if (s?.blur !== undefined && typeof blurPx !== 'number') {
          setCustomBlur((Number(s.blur) / 100) * 10);
        }
        if (s?.reactive !== undefined && typeof reactive !== 'boolean') {
          setIsReactive(Boolean(s.reactive));
        }
      });
    }
    return () => {
      window.removeEventListener('island:aura-settings-changed', handleAuraChange);
      unsub?.();
    };
  }, [blurPx, reactive]);

  useEffect(() => {
    if (mode === 'off' || mode === 'classic' || mode === 'none' || !isPlaying) {
      setPulse(0);
      setBloom(0);
      return;
    }

    let active = true;
    let t = 0;
    let decay = 0;
    let bloomDecay = 0;
    let lastDropTime = 0;
    let dynamicDropThreshold = 0.16;
    let subBassBaseline = 0;
    let bassBaseline = 0;
    let midBaseline = 0;
    let highBaseline = 0;
    let melodyEnvelope = 0;
    let lastCommitTime = 0;
    const freqData = new Uint8Array(512);

    if (sharedAnalyser) {
      analyserRef.current = sharedAnalyser;
    }

    if (!isLoopbackDisabled) {
      getLoopbackAnalyser().then((analyser) => {
        if (active && analyser) {
          analyserRef.current = analyser;
        }
      });
    }

    const tick = () => {
      if (!active) return;

      const analyser = analyserRef.current;
      if (analyser) {
        analyser.getByteFrequencyData(freqData);

        // High-Precision Multi-Band Spectrum (fftSize = 1024, ~46.9Hz per bin):
        // 1. Sub-Bass & Deep Floor Toms/808s (~47Hz - 141Hz, e.g. One More Hour, FE!N)
        let subSum = 0;
        for (let i = 1; i <= 3; i++) subSum += freqData[i];
        const currentSubBass = subSum / (3 * 255);

        // 2. Punch & Bass Body (~141Hz - 375Hz)
        let bassSum = 0;
        for (let i = 4; i <= 8; i++) bassSum += freqData[i];
        const currentBass = bassSum / (5 * 255);

        // 3. Mids / Pianos / Vocals / Guitars / Saxophone (~400Hz - 2400Hz)
        let midSum = 0;
        for (let i = 9; i <= 51; i++) midSum += freqData[i];
        const currentMid = midSum / (43 * 255);

        // 4. Highs / Cymbals / Hi-hats / Air (~2400Hz - 10000Hz)
        let highSum = 0;
        for (let i = 52; i <= 213; i++) highSum += freqData[i];
        const currentHigh = highSum / (162 * 255);

        // Initialize baselines to initial audio levels on first frame to prevent false startup surge
        if (subBassBaseline === 0 && bassBaseline === 0 && (currentSubBass > 0 || currentBass > 0)) {
          subBassBaseline = currentSubBass;
          bassBaseline = currentBass;
          midBaseline = currentMid;
          highBaseline = currentHigh;
        }

        // Adaptive Energy Moving Average (EMA) baselines:
        // Slow adapt rate allows sudden onset peaks to punch clearly above sustained volume
        subBassBaseline += (currentSubBass - subBassBaseline) * 0.045;
        bassBaseline += (currentBass - bassBaseline) * 0.045;
        midBaseline += (currentMid - midBaseline) * 0.06;
        highBaseline += (currentHigh - highBaseline) * 0.06;

        // Onset transients measured relative to dynamic audio floor
        const subOnset = Math.max(0, currentSubBass - subBassBaseline);
        const bassOnset = Math.max(0, currentBass - bassBaseline);
        const midOnset = Math.max(0, currentMid - midBaseline);
        const highOnset = Math.max(0, currentHigh - highBaseline);

        // Weighted composite transient:
        // Floor toms, sub kicks, and 808s receive prime transient weighting
        const transient = Math.max(
          subOnset * 3.4,
          bassOnset * 2.6,
          midOnset * 2.0,
          highOnset * 1.4
        );

        if (transient > 0.04) {
          // Sharp attack with fast recovery for rapid drum fills & consecutive kicks
          decay = Math.min(1.0, decay * 0.40 + transient * 0.95);
          if (transient > 0.08 && typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('island:music-beat', {
              detail: { transient, subBass: currentSubBass }
            }));
          }
        } else {
          // Organic fluid decay
          decay = Math.max(0, decay * 0.84 - 0.012);
        }

        // Dynamic Accent Gating for Heavy Beat Drops:
        // Dual-stage recovery curve allows rapid consecutive hits ("dum dum dum") ~160ms-350ms apart
        // to plunge into a clean acoustic trough and re-strike with full visual force on every beat.
        const now = performance.now();
        const timeSinceLastDrop = now - lastDropTime;
        dynamicDropThreshold = Math.max(0.12, dynamicDropThreshold * 0.88);

        if (transient > dynamicDropThreshold && timeSinceLastDrop > 150) {
          bloomDecay = Math.min(1.0, Math.max(0.70, transient * 1.35));
          lastDropTime = now;
          dynamicDropThreshold = Math.max(0.24, transient * 0.82);
        } else {
          // Fast-trough initial drop with golden ember tail
          bloomDecay = Math.max(0, bloomDecay * 0.78 - 0.02);
        }

        // Ambient groove presence from overall music energy
        const presence = (currentSubBass * 0.40 + currentBass * 0.30 + currentMid * 0.20 + currentHigh * 0.10) * 0.28;
        const totalPulse = Math.min(1.0, decay + presence);

        // Instrumental / Melodic nuance:
        // Smoothly envelope mid-range instruments (piano chords, jazz horns, vocals)
        // to guide concert light tilt, ray rotation, and water flow
        const instrumentalEnergy = currentMid * 1.6 + currentHigh * 0.9;
        melodyEnvelope += (instrumentalEnergy - melodyEnvelope) * 0.10;

        // Universal Acoustic Multi-Tone Frequency Bands (Logarithmic / Perceptual Response):
        // Power curve naturally compresses quiet background instruments (arpeggios, fingerpicking)
        // so they glow gently (35-45%) without jittery jumping, while full vocal belts and solos reach 90-100%.
        const bSub = Math.min(1.0, Math.pow(currentSubBass, 1.25) * 1.35 + subOnset * 1.1);
        const bBass = Math.min(1.0, Math.pow(currentBass, 1.25) * 1.25 + bassOnset * 0.9);
        const bVocals = Math.min(1.0, Math.pow(currentMid, 1.3) * 1.35 + midOnset * 0.85);
        const bHighs = Math.min(1.0, Math.pow(currentHigh, 1.3) * 1.4 + highOnset * 0.7);

        // If audio stream is silent/idle, smoothly blend with organic ambient wave
        if (currentSubBass === 0 && currentBass === 0 && currentMid === 0 && currentHigh === 0) {
          t += 0.035;
          if (now - lastCommitTime >= 22) {
            lastCommitTime = now;
            const fallbackBeat = Math.pow(Math.sin(t * 1.8), 6) * 0.35 + Math.pow(Math.sin(t * 0.9), 2) * 0.12;
            setPulse(fallbackBeat);
            setBloom(0);
            setMelody(Math.pow(Math.sin(t * 1.2), 2) * 0.25);
            setAudioBands([
              Math.pow(Math.sin(t * 1.8), 6) * 0.45,
              Math.pow(Math.sin(t * 1.2), 2) * 0.35,
              Math.pow(Math.sin(t * 0.9), 2) * 0.40,
              Math.pow(Math.sin(t * 2.4), 4) * 0.30,
            ]);
          }
        } else {
          // Rate-limit React state dispatches to ~45Hz (every 22ms) unless a sharp transient/beat drops,
          // completely eliminating React GC pauses and UI frame drops while preserving instant attack response.
          const isSharpOnset = transient > 0.08 || (bloomDecay > 0.6 && now - lastDropTime < 40);
          if (now - lastCommitTime >= 22 || isSharpOnset) {
            lastCommitTime = now;
            setPulse(totalPulse);
            setBloom(bloomDecay);
            setMelody(Math.min(1.0, melodyEnvelope));
            setAudioBands([bSub, bBass, bVocals, bHighs]);
          }
        }
      } else {
        // Fallback transient pulse wave
        t += 0.035;
        const now = performance.now();
        if (now - lastCommitTime >= 22) {
          lastCommitTime = now;
          const beat = Math.pow(Math.sin(t * 1.8), 6) * 0.35 + Math.pow(Math.sin(t * 0.9), 2) * 0.12;
          setPulse(beat);
          setBloom(0);
          setMelody(Math.pow(Math.sin(t * 1.2), 2) * 0.25);
          setAudioBands([
            Math.pow(Math.sin(t * 1.8), 6) * 0.45,
            Math.pow(Math.sin(t * 1.2), 2) * 0.35,
            Math.pow(Math.sin(t * 0.9), 2) * 0.40,
            Math.pow(Math.sin(t * 2.4), 4) * 0.30,
          ]);
        }
      }

      animRef.current = requestAnimationFrame(tick);
    };

    animRef.current = requestAnimationFrame(tick);
    return () => {
      active = false;
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [mode, isPlaying]);

  if (mode === 'off' || mode === 'classic' || mode === 'none') return null;

  const isWhite = mode === 'white';
  const color = isWhite ? '#ffffff' : (accentColor || '#ff3b69');

  const effectivePulse = isReactive ? pulse : 0;
  const effectiveBloom = isReactive ? bloom : 0;
  const effectiveMelody = isReactive ? melody : 0;
  const effectiveSpeed = isPlaying ? (mode === 'light-rays' ? 0.85 : 0.35) : 0;

  const isShards = mode === 'shards' || mode === 'aeroshards';
  const isUnblurred = isShards || mode === 'light-rays';

  // Apply custom blur via inline style or CSS variable
  const containerStyle = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    filter: isUnblurred ? 'none' : `blur(${customBlur}px) saturate(160%)`,
    WebkitFilter: isUnblurred ? 'none' : `blur(${customBlur}px) saturate(160%)`,
  };

  return (
    <div
      className={`island-liquid-metaballs${isShards ? ' island-liquid-metaballs--shards' : ''} ${className}`}
      style={containerStyle}
      aria-hidden="true"
    >
      {mode === 'shards' || mode === 'aeroshards' ? (
        <AeroShards
          color={color}
          speed={effectiveSpeed}
          paused={!isPlaying}
          beatPulse={effectivePulse}
          bloomPulse={effectiveBloom}
          melodyPulse={effectiveMelody}
          markers="dots"
          count={720}
        />
      ) : mode === 'galaxy' ? (
        <Galaxy
          color={color}
          speed={effectiveSpeed}
          paused={!isPlaying}
          beatPulse={effectivePulse}
          bloomPulse={effectiveBloom}
        />
      ) : mode === 'ghost-fibers' ? (
        <GhostFibers
          color={color}
          speed={effectiveSpeed}
          paused={!isPlaying}
          beatPulse={effectivePulse}
          bloomPulse={effectiveBloom}
        />
      ) : mode === 'gradient-waves' ? (
        <GradientWaves
          color={color}
          speed={effectiveSpeed}
          paused={!isPlaying}
          beatPulse={effectivePulse}
          bloomPulse={effectiveBloom}
          melodyPulse={effectiveMelody}
        />
      ) : mode === 'light-rays' ? (
        <LightRays
          color={color}
          speed={effectiveSpeed}
          paused={!isPlaying}
          beatPulse={effectivePulse}
          bloomPulse={effectiveBloom}
          melodyPulse={effectiveMelody}
          bands={isReactive ? audioBands : [0.25, 0.25, 0.28, 0.1]}
          preset={preset}
        />
      ) : mode === 'aurora' || mode === 'fluid' ? (
        <FluidAurora
          color={color}
          speed={effectiveSpeed}
          paused={!isPlaying}
          beatPulse={effectivePulse}
          bloomPulse={effectiveBloom}
        />
      ) : (
        <MetaBalls
          color={color}
          speed={effectiveSpeed}
          ballCount={14}
          clumpFactor={1.0}
          gooeyness={0.58}
          wobble={0.5}
          stretch={0.55}
          animationSize={24}
          originX={0.72}
          originY={originY}
          enableTransparency={true}
          paused={!isPlaying}
          beatPulse={effectivePulse}
          bloomPulse={effectiveBloom}
        />
      )}
    </div>
  );
}
