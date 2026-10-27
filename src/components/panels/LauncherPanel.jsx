import { useEffect, useState } from 'react';
import { getAssistantName } from '../../lib/assistant';
import { formatRemaining } from '../../lib/format';
import { Icon } from '../icons';
import { Art, Equalizer } from '../bits';

/**
 * LauncherPanel: Modern Asymmetric Bento Grid Dashboard for Island.
 * Features uneven, modern proportions (inspired by Apple iOS widgets & Bento design):
 * - Hero Music card (2 cols) with unclipped titles, album art, and quick controls
 * - Tall Voice Companion card (1 col) with live waveform/status
 * - Spacious Timers card (1 col) with unclipped chips (+5m, +15m, +25m)
 * - Desktop Pet card (1 col) with companion stats
 * - Inbox card (1 col) with unread badge
 * - Settings & Engine full-width banner (2 cols)
 */
export default function LauncherPanel({
  s,
  now,
  actions,
  setTab,
  voice,
  accentColor,
}) {
  const [assistantName, setAssistantNameState] = useState(getAssistantName);
  const petName = typeof window !== 'undefined'
    ? localStorage.getItem('island_pet_name') || 'Mochi'
    : 'Mochi';

  useEffect(() => {
    const handleAssistantChange = (e) => {
      if (e.detail?.name) setAssistantNameState(e.detail.name);
    };
    window.addEventListener('island:assistant-changed', handleAssistantChange);
    return () => window.removeEventListener('island:assistant-changed', handleAssistantChange);
  }, []);

  const { media, schedule = [], inbox = [] } = s;
  const unreadCount = inbox.filter((n) => !n.read).length;
  const activeTimers = schedule.filter((i) => i.kind === 'timer');
  const nextTimer = activeTimers.sort((a, b) => a.fireAt - b.fireAt)[0] || null;
  const isPlaying = media.active && media.status === 'playing';

  const handleQuickTimer = (e, minutes, label) => {
    e.stopPropagation();
    if (actions?.addTimer) {
      actions.addTimer(minutes, label);
      setTab('clock');
    }
  };

  const handleMediaControl = (e, action) => {
    e.stopPropagation();
    actions?.mediaControl?.(action);
  };

  return (
    <div className="launcher" style={{ '--accent': accentColor || 'var(--c-info)' }}>
      <div className="launcher__grid">
        {/* 1. Hero Music Card (Spans full width across 2 columns) */}
        <div
          className={`launcher-card launcher-card--hero launcher-card--music${isPlaying ? ' is-playing' : ''}`}
          onClick={() => setTab('playing')}
          role="button"
          tabIndex={0}
        >
          <div className="launcher-card__head">
            <span className="launcher-card__icon">
              <Icon.Music width={15} height={15} />
            </span>
            <span className="launcher-card__tag">
              {isPlaying ? 'Now Playing' : 'Music & Favorites'}
            </span>
            {isPlaying && (
              <div className="launcher-card__eq">
                <Equalizer color={accentColor || 'var(--c-info)'} playing={isPlaying} />
              </div>
            )}
          </div>

          <div className="launcher-card__content">
            {media.active ? (
              <div className="launcher-hero-music">
                <div className="launcher-hero-left">
                  {media.art ? (
                    <Art
                      src={media.art}
                      seed={`${media.title}${media.artist}`}
                      size={46}
                      radius={10}
                    />
                  ) : (
                    <div className="launcher-hero-art-fallback">
                      <Icon.Music width={20} height={20} />
                    </div>
                  )}
                  <div className="launcher-hero-meta">
                    <div className="launcher-hero-title" title={media.title}>
                      {media.title || 'Untitled Track'}
                    </div>
                    <div className="launcher-hero-sub" title={media.artist}>
                      {media.artist || 'Unknown Artist'}
                    </div>
                  </div>
                </div>

                {/* Direct quick playback controls right on the hero card */}
                <div className="launcher-hero-controls">
                  <button
                    type="button"
                    className="launcher-control-btn"
                    onClick={(e) => handleMediaControl(e, 'previous')}
                    title="Previous"
                    aria-label="Previous track"
                  >
                    <Icon.Prev width={14} height={14} />
                  </button>
                  <button
                    type="button"
                    className="launcher-control-btn launcher-control-btn--play"
                    onClick={(e) => handleMediaControl(e, 'playpause')}
                    title={isPlaying ? 'Pause' : 'Play'}
                    aria-label={isPlaying ? 'Pause' : 'Play'}
                  >
                    {isPlaying ? <Icon.Pause width={14} height={14} /> : <Icon.Play width={14} height={14} />}
                  </button>
                  <button
                    type="button"
                    className="launcher-control-btn"
                    onClick={(e) => handleMediaControl(e, 'next')}
                    title="Next"
                    aria-label="Next track"
                  >
                    <Icon.Next width={14} height={14} />
                  </button>
                </div>
              </div>
            ) : (
              <div className="launcher-hero-empty">
                <div className="launcher-card__title">Play Music & Favorites</div>
                <div className="launcher-card__sub">
                  Browse saved tracks, queue playlists or ask {assistantName}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 2. Voice Assistant Card (Column 1 - Tall & Expressive) */}
        <div
          className={`launcher-card launcher-card--voice${voice?.status !== 'idle' ? ' is-active' : ''}`}
          onClick={() => {
            if (voice?.status === 'idle' || voice?.status === 'error') {
              voice?.startSession();
            }
            setTab('voice');
          }}
          role="button"
          tabIndex={0}
        >
          <div className="launcher-card__head">
            <span className="launcher-card__icon">
              <Icon.Sparkles width={15} height={15} />
            </span>
            <span className="launcher-card__tag">Companion</span>
            {voice?.status !== 'idle' && (
              <span className={`launcher-pulse is-${voice.status}`} />
            )}
          </div>
          <div className="launcher-card__content">
            <div className="launcher-card__title">Talk to {assistantName}</div>
            <div className="launcher-card__sub">Voice control, music & questions</div>
            <div className="launcher-voice-badge">
              <span className={`launcher-status-dot is-${voice?.status || 'idle'}`} />
              <span className="launcher-status-text">
                {voice?.status === 'speaking'
                  ? 'Speaking...'
                  : voice?.status === 'listening'
                  ? 'Listening...'
                  : voice?.status === 'thinking'
                  ? 'Thinking...'
                  : 'Tap to speak'}
              </span>
            </div>
          </div>
        </div>

        {/* 3. Timers / Clock Card (Column 2 - Spacious, Zero Clipping) */}
        <div
          className="launcher-card launcher-card--clock"
          onClick={() => setTab('clock')}
          role="button"
          tabIndex={0}
        >
          <div className="launcher-card__head">
            <span className="launcher-card__icon">
              <Icon.Timer width={15} height={15} />
            </span>
            <span className="launcher-card__tag">
              {nextTimer ? 'Timer Active' : 'Timers & Focus'}
            </span>
          </div>
          <div className="launcher-card__content">
            {nextTimer ? (
              <div className="launcher-timer-active">
                <div className="launcher-timer-digits">
                  {formatRemaining(Math.max(0, nextTimer.fireAt - now))}
                </div>
                <div className="launcher-card__sub">{nextTimer.label || 'Active countdown'}</div>
              </div>
            ) : (
              <div className="launcher-timer-idle">
                <div className="launcher-card__title">Quick Timer</div>
                <div className="launcher-timer-chips">
                  <button
                    type="button"
                    className="launcher-chip"
                    onClick={(e) => handleQuickTimer(e, 5, 'Quick 5m')}
                  >
                    +5m
                  </button>
                  <button
                    type="button"
                    className="launcher-chip"
                    onClick={(e) => handleQuickTimer(e, 15, 'Focus 15m')}
                  >
                    +15m
                  </button>
                  <button
                    type="button"
                    className="launcher-chip"
                    onClick={(e) => handleQuickTimer(e, 25, 'Pomodoro 25m')}
                  >
                    +25m
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 4. Desktop Pet Card (Column 1) */}
        <div
          className="launcher-card launcher-card--pet"
          onClick={() => setTab('pet')}
          role="button"
          tabIndex={0}
        >
          <div className="launcher-card__head">
            <span className="launcher-card__icon">
              <Icon.Paw width={15} height={15} />
            </span>
            <span className="launcher-card__tag">Desktop Pet</span>
          </div>
          <div className="launcher-card__content">
            <div className="launcher-card__title">{petName}</div>
            <div className="launcher-card__sub">Feed, dress up & companion studio</div>
          </div>
        </div>

        {/* 5. Notifications / Inbox Card (Column 2) */}
        <div
          className="launcher-card launcher-card--inbox"
          onClick={() => setTab('inbox')}
          role="button"
          tabIndex={0}
        >
          <div className="launcher-card__head">
            <span className="launcher-card__icon">
              <Icon.Inbox width={15} height={15} />
            </span>
            <span className="launcher-card__tag">Inbox</span>
            {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
          </div>
          <div className="launcher-card__content">
            <div className="launcher-card__title">
              {unreadCount > 0 ? `${unreadCount} Unread Note${unreadCount > 1 ? 's' : ''}` : 'All caught up'}
            </div>
            <div className="launcher-card__sub">Recent alerts & clipboard history</div>
          </div>
        </div>

        {/* 6. Settings Banner (Spans full width across 2 columns) */}
        <div
          className="launcher-card launcher-card--settings launcher-card--full"
          onClick={() => setTab('settings')}
          role="button"
          tabIndex={0}
        >
          <div className="launcher-settings-row">
            <div className="launcher-settings-left">
              <span className="launcher-card__icon">
                <Icon.Settings width={15} height={15} />
              </span>
              <div className="launcher-settings-text">
                <div className="launcher-card__title">Settings & Preferences</div>
                <div className="launcher-card__sub">Voice engine, dock position & shortcuts</div>
              </div>
            </div>
            <span className="launcher-settings-arrow">
              <Icon.Chevron width={14} height={14} />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
