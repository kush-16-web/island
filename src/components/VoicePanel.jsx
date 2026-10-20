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
            {voice.provider === 'gemini' ? 'Gemini Voice Issue' : 'Voice Connection Issue'}
          </div>
          <div className="voice-panel__error-desc">
            {errorMessage || (voice.provider === 'gemini'
              ? 'Unable to communicate with Google Gemini Voice.'
              : 'Unable to establish real-time voice connection.')}
          </div>
          {errorMessage?.includes('.env') && (
            <div className="voice-panel__env-hint">
              Make sure <code>GEMINI_API_KEY</code> is set in your <code>.env</code> file.
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Center Audio-Reactive Waveform Visualizer */}
          <div className="voice-panel__visualizer">
            {status === 'thinking' ? (
              <div className="voice-thinking-sweep" aria-label="Gemini thinking">
                <div className="voice-thinking-sweep__beam" />
                <div className="voice-thinking-sweep__glow" />
              </div>
            ) : (
              <div className={`voice-waveform is-${status}`}>
                {Array.from({ length: 16 }).map((_, i) => {
                  const rawVal = waveformData ? waveformData[i] || 0.1 : 0.1;
                  const barScale = Math.max(0.12, Math.min(1.0, rawVal * 1.6 + audioLevel * 0.9));

                  return (
                    <span
                      key={i}
                      className="voice-waveform__bar"
                      style={{
                        height: `${Math.round(barScale * 44)}px`,
                        transition: 'height 0.05s ease-out',
                      }}
                    />
                  );
                })}
              </div>
            )}

            <div className="voice-panel__subtext">
              {status === 'listening' && <span>Speak naturally in English, Hindi, or Hinglish</span>}
              {status === 'speaking' && <span>Tap Interrupt or speak anytime to jump in</span>}
              {status === 'thinking' && <span>Gemini is thinking...</span>}
              {status === 'connecting' && <span>Connecting to Gemini Voice...</span>}
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
