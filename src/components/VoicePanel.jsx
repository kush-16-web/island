import React, { useEffect, useRef, useState } from 'react';
import { Icon } from './icons';
import { getAssistantName } from '../lib/assistant';
import StructuredResponseRenderer from './structured/StructuredResponseRenderer';

function sanitizeError(msg) {
  if (!msg || typeof msg !== 'string') return '';
  return msg
    .replace(/gsk_[A-Za-z0-9_-]{8,}/g, 'gsk_••••••••')
    .replace(/AIza[0-9A-Za-z-_]{20,}/g, 'AIza••••••••');
}

/**
 * MinimalVoiceIndicator: Subtle 4-bar activity indicator.
 * - Replaces the oversized canvas waveform.
 * - Reacts to actual microphone amplitude during listening.
 * - Reacts to actual assistant audio playback during speaking.
 * - Gentle harmonic wave during thinking / transcribing.
 * - Calm static dots / bars when idle or muted.
 */
function MinimalVoiceIndicator({ status, audioLevel, isSpeaking }) {
  const boost = Math.min(1, Math.max(0, audioLevel || 0));
  const isListening = status === 'listening';
  const isThinking = status === 'thinking' || status === 'transcribing' || status === 'preparing_speech';
  const isActiveSpeaking = status === 'speaking' || isSpeaking;

  let h1 = 3;
  let h2 = 4;
  let h3 = 4;
  let h4 = 3;

  if (isListening) {
    h1 = Math.round(3 + boost * 9);
    h2 = Math.round(4 + boost * 13);
    h3 = Math.round(4 + boost * 11);
    h4 = Math.round(3 + boost * 7);
  } else if (isActiveSpeaking) {
    h1 = Math.round(3 + boost * 11);
    h2 = Math.round(5 + boost * 14);
    h3 = Math.round(4 + boost * 12);
    h4 = Math.round(3 + boost * 9);
  }

  return (
    <div
      className={`live-voice-indicator state--${status}${isActiveSpeaking ? ' is-speaking' : ''}`}
      aria-label={`Voice activity: ${status}`}
    >
      <span className="live-voice-bar bar--1" style={!isThinking ? { height: `${h1}px` } : undefined} />
      <span className="live-voice-bar bar--2" style={!isThinking ? { height: `${h2}px` } : undefined} />
      <span className="live-voice-bar bar--3" style={!isThinking ? { height: `${h3}px` } : undefined} />
      <span className="live-voice-bar bar--4" style={!isThinking ? { height: `${h4}px` } : undefined} />
    </div>
  );
}

/**
 * VoicePanel: Live Voice Assistant Surface (Pass 2.2.8.4).
 * - Priority: Latest meaningful result or response (Live Hero).
 * - Optional Conversation History view.
 * - No Pet in voice chat.
 * - No oversized waveform across the screen.
 * - Clean editorial layouts for Timers, Weather, Music, and Conversations.
 * - Dynamic music-artwork color system preserved.
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
    endSession,
    interrupt,
    toggleMute,
    dismissCooldown,
    clearError,
  } = voice;

  const [assistantName, setAssistantNameState] = useState(() => getAssistantName());
  const [viewMode, setViewMode] = useState('live'); // 'live' | 'history'
  const [isErrorExpanded, setIsErrorExpanded] = useState(false);
  const [copiedError, setCopiedError] = useState(false);
  const userName = localStorage.getItem('island_user_name') || 'You';
  const historyScrollRef = useRef(null);

  const handleCopyError = (e) => {
    e?.stopPropagation?.();
    const clean = sanitizeError(errorMessage);
    if (clean && navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(clean);
      setCopiedError(true);
      setTimeout(() => setCopiedError(false), 2000);
    }
  };

  useEffect(() => {
    const handleNameChange = () => setAssistantNameState(getAssistantName());
    window.addEventListener('island:assistant-changed', handleNameChange);
    return () => window.removeEventListener('island:assistant-changed', handleNameChange);
  }, []);

  // Determine single clear status
  let currentStatus = 'listening';
  let statusLabel = 'Listening…';

  if (status === 'error' || status === 'failed') {
    currentStatus = 'error';
    statusLabel = status === 'failed' ? 'Failed' : 'Notice';
  } else if (status === 'cooldown') {
    currentStatus = 'cooldown';
    statusLabel = cooldownSeconds > 0 ? `Resting (${cooldownSeconds}s)` : 'Cooling Down';
  } else if (isMuted) {
    currentStatus = 'muted';
    statusLabel = 'Muted';
  } else if (status === 'connecting') {
    currentStatus = 'connecting';
    statusLabel = 'Connecting…';
  } else if (status === 'transcribing') {
    currentStatus = 'transcribing';
    statusLabel = 'Understanding…';
  } else if (status === 'understanding' || status === 'thinking' || status === 'processing') {
    currentStatus = 'thinking';
    statusLabel = 'Thinking…';
  } else if (status === 'preparing_speech') {
    currentStatus = 'preparing_speech';
    statusLabel = 'Preparing…';
  } else if (status === 'acknowledging') {
    currentStatus = 'thinking';
    statusLabel = 'Opening…';
  } else if (status === 'executing' || status === 'awaiting_result') {
    currentStatus = 'thinking';
    statusLabel = 'Connecting…';
  } else if (status === 'completed') {
    currentStatus = 'completed';
    statusLabel = 'Ready';
  } else if (status === 'needs_user_action') {
    currentStatus = 'cooldown';
    statusLabel = 'Action Needed';
  } else if (status === 'speaking') {
    currentStatus = 'speaking';
    statusLabel = 'Speaking';
  }

  // Find latest interaction items
  const latestAssistantTurn = [...transcript].reverse().find((t) => t.role === 'assistant');
  const latestUserTurn = [...transcript].reverse().find((t) => t.role === 'user');

  // Track if a new request is actively being processed
  const isTurnInFlight = ['transcribing', 'thinking', 'preparing_speech'].includes(currentStatus);

  // Dynamic theme accent color
  const dynamicAccent = accentColor || 'var(--music-accent, var(--accent, #a855f7))';

  const handleEndSession = () => {
    if (typeof endSession === 'function') endSession();
    else stopSession?.();
    onClose?.();
  };

  return (
    <div className="live-assistant-panel" style={{ '--voice-accent': dynamicAccent }}>
      {/* 1. Assistant Activity Header */}
      <div className="live-assistant__header">
        <div className="live-assistant__status-group">
          <MinimalVoiceIndicator
            status={currentStatus}
            audioLevel={audioLevel}
            isSpeaking={currentStatus === 'speaking'}
          />
          <div className="live-assistant__status-meta">
            <span className="live-assistant__status-label">{statusLabel}</span>
            {isTurnInFlight && latestUserTurn?.text && (
              <span className="live-assistant__query-preview" title={latestUserTurn.text}>
                "{latestUserTurn.text}"
              </span>
            )}
          </div>
        </div>

        <div className="live-assistant__header-actions">
          <button
            type="button"
            className="live-assistant__icon-btn"
            onClick={() => onClose?.()}
            title="Minimize to Island pill"
            aria-label="Minimize assistant"
          >
            <Icon.Close width={14} height={14} />
          </button>
        </div>
      </div>

      {/* 2. Non-blocking Rate Limit Cooldown Banner */}
      {status === 'cooldown' && (
        <div className="live-assistant__banner live-assistant__banner--cooldown">
          <div className="live-assistant__banner-text">
            <Icon.Hourglass width={13} height={13} />
            <span>{assistantName} is catching breath ({cooldownSeconds}s)</span>
          </div>
          <button
            type="button"
            className="live-assistant__banner-btn"
            onClick={() => (dismissCooldown ? dismissCooldown() : stopSession())}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 3. Non-blocking Error Banner */}
      {status === 'error' && errorMessage && (
        <div className={`live-assistant__banner live-assistant__banner--error ${isErrorExpanded ? 'is-expanded' : ''}`}>
          <div
            className="live-assistant__banner-text"
            onClick={() => setIsErrorExpanded((prev) => !prev)}
            title="Click to toggle full error message"
            style={{ cursor: 'pointer' }}
          >
            <Icon.Alert width={13} height={13} style={{ flexShrink: 0 }} />
            <span>{sanitizeError(errorMessage)}</span>
          </div>
          <div className="live-assistant__banner-actions">
            <button
              type="button"
              className="live-assistant__banner-link"
              onClick={handleCopyError}
            >
              {copiedError ? 'Copied' : 'Copy'}
            </button>
            <button
              type="button"
              className="live-assistant__banner-link"
              onClick={() => onOpenSettings?.()}
            >
              Settings
            </button>
            <button
              type="button"
              className="live-assistant__banner-btn"
              onClick={() => (clearError ? clearError() : stopSession())}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* 4. Main Surface: Live Hero Result vs History View */}
      {viewMode === 'live' ? (
        <div className="live-assistant__surface">
          {!latestAssistantTurn ? (
            <div className="live-assistant__empty-state">
              <span className="live-assistant__empty-text">
                Ask anything or speak naturally with {assistantName}…
              </span>
            </div>
          ) : (
            <div className="live-assistant__hero-slot">
              {/* If user query is present and turn is not in-flight, display subtle query subtitle */}
              {!isTurnInFlight && latestUserTurn?.text && (
                <div className="live-assistant__query-tag" title={latestUserTurn.text}>
                  <span className="live-assistant__query-user">{userName}:</span>
                  <span className="live-assistant__query-val">"{latestUserTurn.text}"</span>
                </div>
              )}

              {/* Authoritative Structured or Conversational Result */}
              <StructuredResponseRenderer
                item={latestAssistantTurn}
                isAssistant
                isSpeaking={currentStatus === 'speaking'}
              />
            </div>
          )}
        </div>
      ) : (
        /* Conversation History View */
        <div className="live-assistant__history-view" ref={historyScrollRef}>
          <div className="live-assistant__history-header">
            <span className="live-assistant__history-title">Session History</span>
            <button
              type="button"
              className="live-assistant__history-back-btn"
              onClick={() => setViewMode('live')}
            >
              <span>← Back to Live</span>
            </button>
          </div>

          <div className="live-assistant__history-list">
            {transcript.length === 0 ? (
              <div className="live-assistant__history-empty">No conversation history yet.</div>
            ) : (
              transcript.map((item, idx) => {
                const isAssistant = item.role === 'assistant';
                return (
                  <div
                    key={item.id || idx}
                    className={`live-history-row live-history-row--${item.role}`}
                  >
                    <div className="live-history-row__meta">
                      <span className="live-history-row__speaker">
                        {isAssistant ? assistantName : userName}
                      </span>
                    </div>
                    <div className="live-history-row__body">
                      {item.text || item.displayText || item.spokenText}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* 5. Fixed Bottom Controls */}
      <div className="live-assistant__controls">
        <button
          type="button"
          className={`live-ctl-btn ${viewMode === 'history' ? 'is-active' : ''}`}
          onClick={() => setViewMode((m) => (m === 'history' ? 'live' : 'history'))}
          title={viewMode === 'history' ? 'Return to live response' : 'View session conversation history'}
          aria-label={viewMode === 'history' ? 'Return to live response' : 'View session history'}
        >
          <Icon.History width={13} height={13} />
          <span>{viewMode === 'history' ? 'Live' : 'History'}</span>
        </button>

        {status !== 'error' && status !== 'cooldown' && (
          <button
            type="button"
            className={`live-ctl-btn live-ctl-btn--mute ${isMuted ? 'is-muted' : ''}`}
            onClick={toggleMute}
            title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
            aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
          >
            {isMuted ? <Icon.MicOff width={13} height={13} /> : <Icon.Mic width={13} height={13} />}
            <span>{isMuted ? 'Unmute' : 'Mute'}</span>
          </button>
        )}

        {status === 'speaking' && (
          <button
            type="button"
            className="live-ctl-btn live-ctl-btn--interrupt"
            onClick={interrupt}
            title="Interrupt assistant speaking"
            aria-label="Interrupt"
          >
            <Icon.Pause width={12} height={12} />
            <span>Interrupt</span>
          </button>
        )}

        {status === 'error' || status === 'cooldown' ? (
          <button
            type="button"
            className={`live-ctl-btn live-ctl-btn--retry ${cooldownSeconds > 0 ? 'is-disabled' : ''}`}
            onClick={cooldownSeconds > 0 ? undefined : startSession}
            disabled={cooldownSeconds > 0}
            title={cooldownSeconds > 0 ? `Wait ${cooldownSeconds}s before retrying` : 'Retry voice session'}
          >
            <span>{cooldownSeconds > 0 ? `Wait (${cooldownSeconds}s)` : 'Retry'}</span>
          </button>
        ) : (
          <button
            type="button"
            className="live-ctl-btn live-ctl-btn--end"
            onClick={handleEndSession}
            title="End conversation session"
            aria-label="End session"
          >
            <span>End Session</span>
          </button>
        )}
      </div>
    </div>
  );
}
