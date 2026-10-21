import { useEffect, useState } from 'react';
import { getAssistantName } from '../lib/assistant';
import { formatClock, formatRemaining } from '../lib/format';
import { Icon } from './icons';
import { Art, Equalizer } from './bits';

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

  return (
    <div className="launcher" style={{ '--accent': accentColor || 'var(--c-info)' }}>
      <div className="launcher__grid">
        {/* Card 1: Music / Now Playing */}
        <div
          className={`launcher-card launcher-card--music${isPlaying ? ' is-playing' : ''}`}
          onClick={() => setTab('playing')}
          role="button"
          tabIndex={0}
        >
          <div className="launcher-card__head">
            <span className="launcher-card__icon launcher-card__icon--music">
              <Icon.Music width={16} height={16} />
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
              <div className="launcher-music-row">
                {media.art && (
                  <Art
                    src={media.art}
                    seed={`${media.title}${media.artist}`}
                    size={36}
                    radius={8}
                  />
                )}
                <div className="launcher-music-meta">
                  <div className="launcher-music-title">{media.title || 'Untitled'}</div>
                  <div className="launcher-music-sub">{media.artist || 'Unknown artist'}</div>
                </div>
              </div>
            ) : (
              <div className="launcher-music-empty">
                <div className="launcher-card__title">Play Music</div>
                <div className="launcher-card__sub">Browse saved favorites or ask {assistantName}</div>
              </div>
            )}
          </div>
        </div>

        {/* Card 2: Voice Assistant */}
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
            <span className="launcher-card__icon launcher-card__icon--voice">
              <Icon.Sparkles width={16} height={16} />
            </span>
            <span className="launcher-card__tag">{assistantName}</span>
            {voice?.status !== 'idle' && (
              <span className={`launcher-pulse is-${voice.status}`} />
            )}
          </div>
          <div className="launcher-card__content">
            <div className="launcher-card__title">
              {voice?.status === 'idle'
                ? `Talk to ${assistantName}`
                : voice?.status === 'speaking'
                ? `${assistantName} is speaking`
                : `${assistantName} is listening`}
            </div>
            <div className="launcher-card__sub">Voice commands, favorites & control</div>
          </div>
        </div>

        {/* Card 3: Timers / Clock */}
        <div
          className="launcher-card launcher-card--clock"
          onClick={() => setTab('clock')}
          role="button"
          tabIndex={0}
        >
          <div className="launcher-card__head">
            <span className="launcher-card__icon launcher-card__icon--clock">
              <Icon.Timer width={16} height={16} />
            </span>
            <span className="launcher-card__tag">
              {nextTimer ? 'Active Timer' : 'Timers & Alarms'}
            </span>
          </div>
          <div className="launcher-card__content">
            {nextTimer ? (
              <div className="launcher-timer-active">
                <div className="launcher-card__title">
                  {formatRemaining(Math.max(0, nextTimer.fireAt - now))}
                </div>
                <div className="launcher-card__sub">{nextTimer.label || 'Timer'}</div>
              </div>
            ) : (
              <div className="launcher-card__title">Quick Timer</div>
            )}
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
        </div>

        {/* Card 4: Pet Studio */}
        <div
          className="launcher-card launcher-card--pet"
          onClick={() => setTab('pet')}
          role="button"
          tabIndex={0}
        >
          <div className="launcher-card__head">
            <span className="launcher-card__icon launcher-card__icon--pet">
              <Icon.Paw width={16} height={16} />
            </span>
            <span className="launcher-card__tag">{petName}</span>
          </div>
          <div className="launcher-card__content">
            <div className="launcher-card__title">Desktop Pet</div>
            <div className="launcher-card__sub">Companion stats, feed & dress up</div>
          </div>
        </div>

        {/* Card 5: Inbox */}
        <div
          className="launcher-card launcher-card--inbox"
          onClick={() => setTab('inbox')}
          role="button"
          tabIndex={0}
        >
          <div className="launcher-card__head">
            <span className="launcher-card__icon launcher-card__icon--inbox">
              <Icon.Inbox width={16} height={16} />
            </span>
            <span className="launcher-card__tag">Inbox</span>
            {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
          </div>
          <div className="launcher-card__content">
            <div className="launcher-card__title">
              {unreadCount > 0 ? `${unreadCount} unread note${unreadCount > 1 ? 's' : ''}` : 'All caught up'}
            </div>
            <div className="launcher-card__sub">Recent notifications & reminders</div>
          </div>
        </div>

        {/* Card 6: Settings */}
        <div
          className="launcher-card launcher-card--settings"
          onClick={() => setTab('settings')}
          role="button"
          tabIndex={0}
        >
          <div className="launcher-card__head">
            <span className="launcher-card__icon launcher-card__icon--settings">
              <Icon.Settings width={16} height={16} />
            </span>
            <span className="launcher-card__tag">Preferences</span>
          </div>
          <div className="launcher-card__content">
            <div className="launcher-card__title">Settings</div>
            <div className="launcher-card__sub">Voice engine, dock position & appearance</div>
          </div>
        </div>
      </div>
    </div>
  );
}
