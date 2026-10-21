import React, { useEffect, useRef, useState } from 'react';
import { Icon } from './icons';
import { getAssistantName } from '../lib/assistant';

/**
 * LivingWaveform: Lightweight Canvas-based continuous audio visualizer.
 * Renders layered, organic sine waves with tapered bell envelopes.
 * Reacts to actual microphone amplitude when listening, and actual assistant audio when speaking.
 * Uses a restrained harmonic wave for thinking/processing, and a calm flatline for muted/cooldown state.
 * Inherits dynamic theme colors via CSS variable --voice-accent.
 */
function LivingWaveform({ status, audioLevel, isMuted }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const stateRef = useRef({
    smoothedAmp: 2.5,
    phase: 0,
    status,
    audioLevel: 0,
    isMuted,
  });

  // Keep state updated in ref without causing re-mounts of the canvas loop
  useEffect(() => {
    stateRef.current.status = status;
    stateRef.current.audioLevel = audioLevel || 0;
    stateRef.current.isMuted = isMuted;
  }, [status, audioLevel, isMuted]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    let destroyed = false;
    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

    const render = () => {
      if (destroyed) return;

      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;

      if (w === 0 || h === 0) {
        animRef.current = requestAnimationFrame(render);
        return;
      }

      const pixelW = Math.floor(w * dpr);
      const pixelH = Math.floor(h * dpr);

      if (canvas.width !== pixelW || canvas.height !== pixelH) {
        canvas.width = pixelW;
        canvas.height = pixelH;
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, h);

      const { status: curStatus, audioLevel: curAudio, isMuted: curMuted } = stateRef.current;
      const midY = h / 2;

      // Determine target amplitude and phase speed based on actual state and real audio
      let targetAmp = 2.5;
      let phaseSpeed = 0.032;

      if (curMuted) {
        targetAmp = 0.5;
        phaseSpeed = 0.005;
      } else if (curStatus === 'thinking' || curStatus === 'processing') {
        // Restrained, distinctive continuous harmonic motion without pretending to be mic audio
        targetAmp = 6.5;
        phaseSpeed = 0.03;
      } else if (curStatus === 'speaking') {
        // Expressive assistant speech driven by real output audio amplitude
        const voiceBoost = Math.min(1, Math.max(0, curAudio));
        targetAmp = 4 + voiceBoost * 20;
        phaseSpeed = 0.045 + voiceBoost * 0.055;
      } else if (curStatus === 'listening') {
        // Organic living wave responsive to real microphone input
        const micBoost = Math.min(1, Math.max(0, curAudio));
        targetAmp = 2.8 + micBoost * 22;
        phaseSpeed = 0.032 + micBoost * 0.05;
      } else if (curStatus === 'cooldown') {
        targetAmp = 1.0;
        phaseSpeed = 0.008;
      } else if (curStatus === 'connecting') {
        targetAmp = 2;
        phaseSpeed = 0.02;
      } else if (curStatus === 'error') {
        targetAmp = 0.8;
        phaseSpeed = 0.01;
      }

      if (prefersReducedMotion) {
        phaseSpeed = 0;
      }

      // Smooth amplitude lerp for organic physics
      stateRef.current.smoothedAmp += (targetAmp - stateRef.current.smoothedAmp) * 0.14;
      stateRef.current.phase += phaseSpeed;

      const amp = stateRef.current.smoothedAmp;
      const ph = stateRef.current.phase;

      // Resolve Island dynamic accent color
      const computedAccent =
        getComputedStyle(canvas).getPropertyValue('--voice-accent').trim() || '#38bdf8';

      // Draw 3 layered continuous curves
      // 1. Ambient depth wave
      drawWaveCurve(ctx, w, midY, amp * 0.45, 1.5, ph * 0.6 + 2.1, computedAccent, 0.22, 1.2);
      // 2. Harmonic counter-undulation
      drawWaveCurve(ctx, w, midY, amp * 0.72, 2.7, -ph * 0.75 + 1.2, computedAccent, 0.48, 1.5);
      // 3. Primary living curve
      drawWaveCurve(ctx, w, midY, amp, 2.2, ph, computedAccent, 0.92, 2.0);

      ctx.restore();

      animRef.current = requestAnimationFrame(render);
    };

    animRef.current = requestAnimationFrame(render);

    return () => {
      destroyed = true;
      if (animRef.current) {
        cancelAnimationFrame(animRef.current);
      }
    };
  }, []);

  return (
    <div className="voice-living-visualizer" aria-label={`Living waveform (${status})`}>
      <canvas ref={canvasRef} className="voice-living-waveform" />
    </div>
  );
}

function drawWaveCurve(ctx, w, midY, amplitude, freqMultiplier, phase, color, alpha, lineWidth) {
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const freq = (freqMultiplier * Math.PI) / w;
  const step = 3;

  for (let x = 0; x <= w; x += step) {
    const normX = x / w;
    // Bell envelope: smooth taper to zero deviation at both boundaries
    const envelope = Math.pow(Math.sin(Math.PI * normX), 1.6);
    const y = midY + envelope * amplitude * Math.sin(x * freq + phase);

    if (x === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }

  ctx.stroke();
}

/**
 * VoicePanel: Refined Voice Session Interface.
 * - Inherits Island's dynamic accent colors naturally without hardcoded voice palettes.
 * - Living continuous audio waveform (Canvas).
 * - Floating conversation transcript.
 * - Synchronous state machine with in-flight turn locking and rate-limit cooldown display.
 * - Integrated Windows Voice Discovery and Preview interface.
 */
export default function VoicePanel({
  voice,
  onClose,
  onOpenSettings,
  accentColor,
}) {
  const {
    status,
    errorMessage,
    isMuted,
    transcript = [],
    audioLevel = 0,
    cooldownSeconds = 0,
    startSession,
    stopSession,
    interrupt,
    toggleMute,
    dismissCooldown,
    clearError,
  } = voice;

  const [assistantName, setAssistantNameState] = useState(() => getAssistantName());
  const userName = localStorage.getItem('island_user_name') || 'Friend';
  const scrollRef = useRef(null);
  const userScrolledUpRef = useRef(false);

  useEffect(() => {
    const handleNameChange = () => setAssistantNameState(getAssistantName());
    window.addEventListener('island:assistant-changed', handleNameChange);
    return () => window.removeEventListener('island:assistant-changed', handleNameChange);
  }, []);

  // Determine single clear status
  let currentStatus = 'listening';
  let statusLabel = 'Listening';

  if (status === 'error') {
    currentStatus = 'error';
    statusLabel = 'Notice';
  } else if (status === 'cooldown') {
    currentStatus = 'cooldown';
    statusLabel = cooldownSeconds > 0 ? `Resting (${cooldownSeconds}s)` : 'Cooling Down';
  } else if (isMuted) {
    currentStatus = 'muted';
    statusLabel = 'Muted';
  } else if (status === 'connecting') {
    currentStatus = 'connecting';
    statusLabel = 'Connecting';
  } else if (status === 'thinking' || status === 'processing') {
    currentStatus = 'thinking';
    statusLabel = 'Thinking';
  } else if (status === 'speaking') {
    currentStatus = 'speaking';
    statusLabel = 'Speaking';
  }

  // Handle manual scroll detection: pause auto-follow if user scrolls up, resume when returning near bottom
  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= 36;
    userScrolledUpRef.current = !isAtBottom;
  };

  // Auto-scroll transcript to bottom unless user has manually scrolled up
  useEffect(() => {
    if (!userScrolledUpRef.current && scrollRef.current) {
      const el = scrollRef.current;
      el.scrollTo({
        top: el.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [transcript]);

  // Dynamic theme accent color
  const dynamicAccent = accentColor || 'var(--music-accent, var(--accent, #38bdf8))';

  return (
    <div className="voice-panel" style={{ '--voice-accent': dynamicAccent }}>
      {/* 1. Top Header */}
      <div className="voice-panel__header">
        <div className="voice-panel__identity">
          <div className="voice-panel__avatar" aria-hidden="true">
            <Icon.Sparkles width={14} height={14} />
          </div>
          <div className="voice-panel__meta">
            <div className="voice-panel__name">{assistantName}</div>
            <div className="voice-panel__status-row">
              <span className={`voice-panel__status-dot is-${currentStatus}`} />
              <span className="voice-panel__status-text">{statusLabel}</span>
            </div>
          </div>
        </div>

        <div className="voice-panel__header-actions">
          <button
            type="button"
            className="voice-panel__close-btn"
            onClick={() => {
              stopSession();
              onClose?.();
            }}
            title="End voice session (Ctrl+Shift+Space)"
            aria-label="End voice session"
          >
            <Icon.Close width={14} height={14} />
          </button>
        </div>
      </div>

      {/* 2. Non-blocking Rate Limit Cooldown Banner */}
      {status === 'cooldown' && (
        <div className="voice-panel__banner voice-panel__cooldown-banner">
          <div className="voice-panel__banner-text">
            <Icon.Hourglass width={13} height={13} />
            <span>{assistantName} is catching breath ({cooldownSeconds}s)</span>
          </div>
          <div className="voice-panel__banner-actions">
            <button
              type="button"
              className="voice-panel__dismiss-btn"
              onClick={() => (dismissCooldown ? dismissCooldown() : stopSession())}
              title="Dismiss cooldown and resume"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* 3. Non-blocking Error Banner */}
      {status === 'error' && errorMessage && (
        <div className="voice-panel__banner voice-panel__error-banner">
          <div className="voice-panel__banner-text" title={errorMessage}>
            <Icon.Alert width={13} height={13} />
            <span>{errorMessage}</span>
          </div>
          <div className="voice-panel__banner-actions">
            <button
              type="button"
              className="voice-panel__action-link"
              onClick={() => onOpenSettings?.()}
              title="Open AI Assistant Settings"
            >
              Settings
            </button>
            <button
              type="button"
              className="voice-panel__dismiss-btn"
              onClick={() => (clearError ? clearError() : stopSession())}
              title="Dismiss error"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Living Audio Waveform */}
      <LivingWaveform
        status={currentStatus}
        audioLevel={audioLevel}
        isMuted={isMuted}
      />

          {/* Floating Conversation Transcript */}
          <div
            className="voice-transcript scroll-transcript"
            ref={scrollRef}
            onScroll={handleScroll}
            tabIndex={0}
            aria-label="Voice conversation transcript"
          >
            <div className="voice-transcript__spacer-top" />
            {transcript.length === 0 ? (
              <div className="voice-transcript__empty">
                <span>Ask anything or speak naturally with {assistantName}...</span>
              </div>
            ) : (
              transcript.map((item, index) => {
                const isAssistant = item.role === 'assistant';
                const isLatest = index === transcript.length - 1;

                return (
                  <div
                    key={item.id || `${index}-${item.role}`}
                    className={`voice-turn voice-turn--${item.role}${item.isLive ? ' is-live' : ''}${isLatest ? ' is-latest' : ''}`}
                  >
                    <div className="voice-turn__speaker">
                      {isAssistant ? assistantName : userName}
                    </div>
                    <div className="voice-turn__text">{item.text}</div>
                  </div>
                );
              })
            )}
          </div>

      {/* 3. Bottom Controls */}
      <div className="voice-panel__controls">
        {status !== 'error' && status !== 'cooldown' && (
          <button
            type="button"
            className={`voice-btn voice-btn--mute${isMuted ? ' is-muted' : ''}`}
            onClick={toggleMute}
            title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
            aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
          >
            {isMuted ? <Icon.MicOff width={15} height={15} /> : <Icon.Mic width={15} height={15} />}
            <span>{isMuted ? 'Unmute' : 'Mute'}</span>
          </button>
        )}

        {status === 'speaking' && (
          <button
            type="button"
            className="voice-btn voice-btn--interrupt"
            onClick={interrupt}
            title="Interrupt assistant speaking"
            aria-label="Interrupt"
          >
            <Icon.Pause width={14} height={14} />
            <span>Interrupt</span>
          </button>
        )}

        {status === 'error' || status === 'cooldown' ? (
          <>
            <button
              type="button"
              className={`voice-btn voice-btn--retry ${cooldownSeconds > 0 ? 'is-disabled' : ''}`}
              onClick={cooldownSeconds > 0 ? undefined : startSession}
              disabled={cooldownSeconds > 0}
              title={cooldownSeconds > 0 ? `Wait ${cooldownSeconds}s before retrying` : 'Retry voice session'}
              aria-label="Retry voice session"
            >
              <span>{cooldownSeconds > 0 ? `Wait (${cooldownSeconds}s)` : 'Retry'}</span>
            </button>
            <button
              type="button"
              className="voice-btn voice-btn--dismiss"
              onClick={() => {
                stopSession();
                onClose?.();
              }}
              title="Close panel"
              aria-label="Close"
            >
              <span>Dismiss</span>
            </button>
          </>
        ) : (
          <button
            type="button"
            className="voice-btn voice-btn--end"
            onClick={() => {
              stopSession();
              onClose?.();
            }}
            title="End voice session (Ctrl+Shift+Space)"
            aria-label="End session"
          >
            <span>End Session</span>
          </button>
        )}
      </div>
    </div>
  );
}
