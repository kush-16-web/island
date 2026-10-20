import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icon } from './icons';

/**
 * VoicePanel: High-craft Apple-level glassmorphic Voice Assistant interface.
 * Implements real-time audio-reactive waveforms (soft blue for listening,
 * pulsing for thinking, emerald green for speaking), live speech transcription,
 * identity styling with pet avatar, and instant interrupt/mute controls.
 */
export default function VoicePanel({
  voice,
  onClose,
  accentColor,
}) {
  const {
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
  } = voice;

  const petName = localStorage.getItem('island_pet_name') || 'Mochi';
  const userName = localStorage.getItem('island_user_name') || 'Friend';
  const scrollRef = useRef(null);

  // Auto-scroll transcript to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcript]);

  // Determine state color & label
  let statusColor = '#38bdf8'; // Soft sky blue (listening)
  let statusLabel = 'Listening...';

  if (status === 'connecting') {
    statusColor = '#a855f7';
    statusLabel = 'Connecting...';
  } else if (status === 'thinking') {
    statusColor = '#f59e0b';
    statusLabel = 'Thinking...';
  } else if (status === 'speaking') {
    statusColor = '#10b981'; // Vivid emerald green (speaking)
    statusLabel = `${petName} is speaking...`;
  } else if (status === 'error') {
    statusColor = '#ef4444';
    statusLabel = 'Connection Error';
  } else if (isMuted) {
    statusColor = '#f97316';
    statusLabel = 'Microphone Muted';
  }

  return (
    <div className="voice-panel" style={{ '--voice-color': statusColor }}>
      {/* Top Header */}
      <div className="voice-panel__header">
        <div className="voice-panel__identity">
          <div className="voice-panel__avatar">
            <Icon.Paw width={14} height={14} />
          </div>
          <div className="voice-panel__meta">
            <div className="voice-panel__name">{petName}</div>
            <div className="voice-panel__user">Talking with {userName}</div>
          </div>
        </div>

        <div className="voice-panel__status-pill">
          <span className={`voice-panel__status-dot is-${status}`} />
          <span className="voice-panel__status-text">{statusLabel}</span>
        </div>

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

      {/* Error State Card or Active Visualizer */}
      {status === 'error' ? (
        <div className="voice-panel__error-card">
          <div className="voice-panel__error-icon">
            <Icon.Alert width={26} height={26} />
          </div>
          <div className="voice-panel__error-title">
            {errorMessage?.toLowerCase().includes('credit') || errorMessage?.toLowerCase().includes('quota')
              ? 'OpenAI Credits Exhausted'
              : 'Voice Connection Issue'}
          </div>
          <div className="voice-panel__error-desc">
            {errorMessage || 'Unable to establish real-time voice connection with OpenAI.'}
          </div>
          {(errorMessage?.toLowerCase().includes('credit') || errorMessage?.toLowerCase().includes('quota')) && (
            <a
              href="https://platform.openai.com/settings/organization/billing"
              target="_blank"
              rel="noreferrer"
              className="voice-panel__billing-link"
            >
              Open OpenAI Billing Settings ↗
            </a>
          )}
        </div>
      ) : (
        <>
          {/* Center Audio-Reactive Waveform Visualizer */}
          <div className="voice-panel__visualizer">
            <div className={`voice-waveform is-${status}`}>
              {Array.from({ length: 16 }).map((_, i) => {
                const rawVal = waveformData ? waveformData[i] || 0.1 : 0.1;
                let barScale = Math.max(0.12, Math.min(1.0, rawVal * 1.5 + audioLevel * 0.8));

                if (status === 'thinking') {
                  const pulse = Math.sin((Date.now() / 250) + i * 0.4) * 0.25 + 0.35;
                  barScale = Math.max(0.18, pulse);
                } else if (status === 'connecting') {
                  const pulse = Math.sin((Date.now() / 400) + i * 0.3) * 0.15 + 0.25;
                  barScale = Math.max(0.15, pulse);
                }

                return (
                  <span
                    key={i}
                    className="voice-waveform__bar"
                    style={{
                      height: `${Math.round(barScale * 44)}px`,
                      transition: status === 'thinking' ? 'height 0.25s ease' : 'height 0.06s ease',
                    }}
                  />
                );
              })}
            </div>

            <div className="voice-panel__subtext">
              {status === 'listening' && <span>Speak naturally in English, Hindi, or Hinglish</span>}
              {status === 'speaking' && <span>Tap Interrupt or speak anytime to jump in</span>}
              {status === 'thinking' && <span>Processing your response...</span>}
              {status === 'connecting' && <span>Establishing secure WebRTC channel...</span>}
            </div>
          </div>

          {/* Live Transcription Box */}
          <div className="voice-panel__transcript-box" ref={scrollRef}>
            {transcript.length === 0 ? (
              <div className="voice-panel__transcript-empty">
                <span>Ask anything: "What's the weather today?", "Play some Lo-Fi", "Tell me a joke in Hindi"...</span>
              </div>
            ) : (
              transcript.map((item, index) => (
                <div
                  key={index}
                  className={`voice-bubble voice-bubble--${item.role}${item.isLive ? ' is-live' : ''}`}
                >
                  <div className="voice-bubble__sender">
                    {item.role === 'user' ? userName : petName}
                  </div>
                  <div className="voice-bubble__text">{item.text}</div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {/* Bottom Controls */}
      <div className="voice-panel__controls">
        {status !== 'error' && (
          <button
            type="button"
            className={`voice-btn voice-btn--mute${isMuted ? ' is-muted' : ''}`}
            onClick={toggleMute}
            title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
            aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
          >
            {isMuted ? <Icon.MicOff width={16} height={16} /> : <Icon.Mic width={16} height={16} />}
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

        {status === 'error' ? (
          <>
            <button
              type="button"
              className="voice-btn voice-btn--retry"
              onClick={startSession}
              title="Retry voice session"
              aria-label="Retry voice session"
            >
              <span>Retry</span>
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
