import { useEffect, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'framer-motion';
import { getAssistantName } from '../../lib/assistant';
import { formatRemaining } from '../../lib/format';
import { MOTION, getMotionTransition } from '../../lib/motion';
import { Icon } from '../icons';
import CompanionEyes from '../CompanionEyes';
import ClockPanel from '../ClockPanel';

const UTILITIES = [
  { id: 'timer', title: 'Timer', sub: 'Focus & countdowns', Glyph: Icon.Timer },
  { id: 'weather', title: 'Weather', sub: 'Local conditions', Glyph: Icon.Sun },
  { id: 'assistant', title: 'Ask Island', sub: 'Text & voice chat', Glyph: Icon.Sparkles },
  { id: 'controls', title: 'Quick Controls', sub: 'Notch & audio', Glyph: Icon.Sliders },
];

/**
 * LauncherPanel — Utilities 2×2 Grid & Connected Morphing Experience (Phase 1B.3 Gate B)
 *
 * - Pitch-black #000000 backdrop when no song is active
 * - Top minimal header: "Little Island" + top-right Companion Eyes (or single back arrow when navigated)
 * - Compact Now Playing widget above grid when media is active
 * - Compact 2×2 charcoal grid of utility tiles
 * - Fluid Framer Motion morphing into selected detail view (Timer, Weather, Ask Island, Quick Controls)
 * - Separated Countdown & Alarms experiences via modern ClockPanel
 */
export default function LauncherPanel({
  s,
  now,
  actions,
  setTab,
  onClose,
  voice,
  accentColor,
  companionMood = 'idle',
  companionAnimations = true,
  volume = 75,
  onVolumeChange,
}) {
  const prefersReducedMotion = useReducedMotion();
  const morphTransition = getMotionTransition(MOTION.morph, prefersReducedMotion);
  const contentTransition = getMotionTransition(MOTION.content, prefersReducedMotion);
  const headerTransition = getMotionTransition(MOTION.header, prefersReducedMotion);

  const [activeUtility, setActiveUtility] = useState(null);
  const [assistantName, setAssistantNameState] = useState(getAssistantName);
  const [visibilityMode, setVisibilityMode] = useState('always');
  const [appearanceMode, setAppearanceMode] = useState('dynamic_frosted');
  const [draftPrompt, setDraftPrompt] = useState('');

  useEffect(() => {
    const handleAssistantChange = (e) => {
      if (e.detail?.name) setAssistantNameState(e.detail.name);
    };
    window.addEventListener('island:assistant-changed', handleAssistantChange);
    return () => window.removeEventListener('island:assistant-changed', handleAssistantChange);
  }, []);

  useEffect(() => {
    window.island?.getNotchVisibilityMode?.().then((m) => {
      if (m) setVisibilityMode(m);
    }).catch(() => {});
    window.island?.getAppearanceMode?.().then((m) => {
      if (m) setAppearanceMode(m);
    }).catch(() => {});
  }, []);

  const { schedule = [], media = { active: false } } = s || {};
  const activeTimers = schedule.filter((i) => i.kind === 'timer').sort((a, b) => a.fireAt - b.fireAt);
  const nextTimer = activeTimers[0] || null;

  const isPlaying = Boolean(
    media?.active &&
    (media?.status === 'playing' ||
      media?.isPlaying === true ||
      media?.playing === true ||
      (typeof window !== 'undefined' &&
        (window.__islandCompanionState?.playbackState === 'PLAYING' ||
         window.__islandCompanionState?.status === 'playing')))
  );

  useEffect(() => {
    if (media?.active && !media?.status && typeof window !== 'undefined' && window.island?.getState) {
      window.island.getState().catch(() => {});
    }
  }, [media?.active, media?.status]);

  let cachedWeather = null;
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem('island_weather_cache');
      if (raw) cachedWeather = JSON.parse(raw);
    } catch {}
  }

  const handleSetVisibility = (mode) => {
    setVisibilityMode(mode);
    window.island?.setNotchVisibilityMode?.(mode);
  };

  const handleSetAppearance = (mode) => {
    setAppearanceMode(mode);
    window.island?.setAppearanceMode?.(mode);
  };

  const renderTileSub = (id) => {
    if (id === 'timer') {
      return nextTimer
        ? `${nextTimer.label || 'Timer'} · ${formatRemaining(nextTimer.fireAt - now)}`
        : 'Set countdown';
    }
    if (id === 'weather') {
      return cachedWeather && cachedWeather.temp != null
        ? `${Math.round(cachedWeather.temp)}° · ${cachedWeather.condition || 'Clear'}`
        : 'Local conditions';
    }
    if (id === 'assistant') {
      return voice?.status && voice.status !== 'idle'
        ? `${assistantName} active`
        : 'Text & voice chat';
    }
    return `${visibilityMode === 'always' ? 'Always' : visibilityMode === 'smart_hide' ? 'Smart' : 'Peek'} · ${volume}%`;
  };

  const activeMeta = UTILITIES.find((u) => u.id === activeUtility) || null;

  return (
    <div className="utilities-root" style={{ '--accent': media.active ? (accentColor || 'var(--c-info)') : 'transparent' }}>
      {/* Top Minimal Unified Header */}
      <div className="utilities-header">
        <div className="utilities-header__left">
          {activeUtility ? (
            <>
              <button
                type="button"
                className="utilities-back-btn utility-surface__back"
                onClick={() => setActiveUtility(null)}
                title="Back to Utilities"
                aria-label="Back to Utilities"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </button>
              <span className="utilities-header__title">{activeMeta?.title}</span>
            </>
          ) : (
            <span className="utilities-header__title">Little Island</span>
          )}
        </div>

        <div className="utilities-header__right">
          <button
            type="button"
            className="utilities-eyes-btn"
            onClick={() => {
              if (activeUtility) {
                setActiveUtility(null);
              } else {
                onClose?.();
              }
            }}
            title={activeUtility ? 'Back to Utilities' : 'Close Utilities'}
            aria-label={activeUtility ? 'Back to Utilities' : 'Close Utilities'}
          >
            <CompanionEyes size="sm" mood={companionMood} animationsEnabled={companionAnimations} />
          </button>
        </div>
      </div>

      <LayoutGroup id="utilities-morph">
        <div className="utilities-body-container" style={{ position: 'relative', flex: 1, minHeight: 0, width: '100%', display: 'flex', flexDirection: 'column' }}>
          {/* Root Grid and Now Playing */}
          <motion.div
            className="utilities-root-content"
            animate={{
              opacity: activeUtility ? 0 : 1,
              pointerEvents: activeUtility ? 'none' : 'auto',
            }}
            transition={contentTransition}
            style={{
              position: activeUtility ? 'absolute' : 'relative',
              inset: 0,
              width: '100%',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Compact Now Playing Widget above Grid when music is active */}
            {media.active && (
              <div className="utilities-now-playing">
                <button
                  type="button"
                  className="utilities-np__art-btn"
                  onClick={() => setTab?.('playing')}
                  title="Open Expanded Music"
                  aria-label="Open Expanded Music"
                >
                  {media.art ? (
                    <img src={media.art} alt="" className="utilities-np__art" />
                  ) : (
                    <div className="utilities-np__art-fallback">
                      <Icon.Music width={14} height={14} />
                    </div>
                  )}
                </button>

                <div
                  className="utilities-np__info"
                  onClick={() => setTab?.('playing')}
                  role="button"
                  tabIndex={0}
                >
                  <span className="utilities-np__title">{media.title || 'Unknown Title'}</span>
                  <span className="utilities-np__artist">{media.artist || 'Unknown Artist'}</span>
                </div>

                <div className="utilities-np__controls">
                  <button
                    type="button"
                    className="utilities-np__ctrl-btn"
                    onClick={() => actions?.mediaControl?.('previous')}
                    title="Previous Track"
                    aria-label="Previous Track"
                  >
                    <Icon.Prev width={12} height={12} />
                  </button>
                  <button
                    type="button"
                    className="utilities-np__ctrl-btn utilities-np__ctrl-btn--play"
                    onClick={() => actions?.mediaControl?.('playpause')}
                    title={isPlaying ? 'Pause' : 'Play'}
                    aria-label={isPlaying ? 'Pause' : 'Play'}
                  >
                    {isPlaying ? <Icon.Pause width={12} height={12} /> : <Icon.Play width={12} height={12} />}
                  </button>
                  <button
                    type="button"
                    className="utilities-np__ctrl-btn"
                    onClick={() => actions?.mediaControl?.('next')}
                    title="Next Track"
                    aria-label="Next Track"
                  >
                    <Icon.Next width={12} height={12} />
                  </button>
                </div>
              </div>
            )}

            {/* Compact 2×2 Grid */}
            <div className="utilities-grid">
              {UTILITIES.map(({ id, title, Glyph }) => (
                <motion.button
                  key={id}
                  type="button"
                  layoutId={`utility-surface-${id}`}
                  className="utility-tile"
                  onClick={() => setActiveUtility(id)}
                  transition={morphTransition}
                  style={{
                    visibility: activeUtility === id ? 'hidden' : 'visible',
                  }}
                >
                  <span className="utility-tile__icon">
                    <Glyph width={15} height={15} />
                  </span>
                  <div className="utility-tile__text">
                    <span className="utility-tile__title">{title}</span>
                    <span className="utility-tile__sub">{renderTileSub(id)}</span>
                  </div>
                </motion.button>
              ))}
            </div>
          </motion.div>

          {/* Morphed Detail Surface */}
          <AnimatePresence>
            {activeUtility && (
              <motion.div
                key={`utility-active-${activeUtility}`}
                layoutId={`utility-surface-${activeUtility}`}
                className="utility-surface"
                transition={morphTransition}
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  zIndex: 10,
                }}
              >
                <motion.div
                  className="utility-surface__body"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={contentTransition}
                >
                  {activeUtility === 'timer' && (
                    <div className="utility-pane utility-pane--timer">
                      <ClockPanel schedule={schedule} now={now} onBack={() => setActiveUtility(null)} />
                    </div>
                  )}

                  {activeUtility === 'weather' && (
                    <div className="utility-pane utility-pane--weather">
                      {cachedWeather && cachedWeather.temp != null ? (
                        <div className="utility-weather-summary">
                          <div className="utility-weather-temp">{Math.round(cachedWeather.temp)}°</div>
                          <div className="utility-weather-meta">
                            <div className="utility-weather-loc">{cachedWeather.location || 'Local'}</div>
                            <div className="utility-weather-cond">{cachedWeather.condition || 'Clear'}</div>
                          </div>
                        </div>
                      ) : (
                        <div className="utility-empty-state">
                          <Icon.Sun width={24} height={24} />
                          <span className="utility-empty-state__title">Weather Unavailable</span>
                          <p className="utility-empty-state__sub">Local weather provider connects in the next checkpoint.</p>
                        </div>
                      )}
                    </div>
                  )}

                  {activeUtility === 'assistant' && (
                    <div className="utility-pane utility-pane--assistant">
                      <div className="utility-assistant-intro">
                        <span className="utility-assistant-heading">Ask Island</span>
                        <p className="utility-assistant-desc">Ask a quick question or open the full AI Workspace.</p>
                      </div>
                      <div className="utility-assistant-composer">
                        <input
                          type="text"
                          className="utility-assistant-input"
                          placeholder="Ask Island anything…"
                          value={draftPrompt}
                          onChange={(e) => setDraftPrompt(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && draftPrompt.trim()) {
                              window.island?.openWorkspace?.({ prompt: draftPrompt.trim() });
                              setDraftPrompt('');
                            }
                          }}
                        />
                        {voice && (
                          <button
                            type="button"
                            className="utility-assistant-btn"
                            onClick={() => {
                              voice.startSession?.();
                              setTab?.('voice');
                            }}
                            title="Start Voice"
                            aria-label="Start Voice"
                          >
                            <Icon.Mic width={13} height={13} />
                          </button>
                        )}
                        <button
                          type="button"
                          className="utility-assistant-btn utility-assistant-btn--send"
                          onClick={() => {
                            window.island?.openWorkspace?.(draftPrompt.trim() ? { prompt: draftPrompt.trim() } : undefined);
                            if (draftPrompt.trim()) setDraftPrompt('');
                          }}
                          title="Open AI Workspace"
                        >
                          <span>Workspace</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {activeUtility === 'controls' && (
                    <div className="utility-pane utility-pane--controls">
                      <div className="utility-ctrl-row">
                        <span className="utility-ctrl-label">Notch Visibility</span>
                        <div className="utility-ctrl-pills">
                          {[
                            { id: 'always', label: 'Always' },
                            { id: 'smart_hide', label: 'Smart' },
                            { id: 'peek', label: 'Peek' },
                          ].map((opt) => (
                            <button
                              key={opt.id}
                              type="button"
                              className={`utility-ctrl-pill${visibilityMode === opt.id ? ' is-active' : ''}`}
                              onClick={() => handleSetVisibility(opt.id)}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="utility-ctrl-row">
                        <span className="utility-ctrl-label">Appearance</span>
                        <div className="utility-ctrl-pills">
                          <button
                            type="button"
                            className={`utility-ctrl-pill${appearanceMode === 'dynamic_frosted' ? ' is-active' : ''}`}
                            onClick={() => handleSetAppearance('dynamic_frosted')}
                          >
                            Dynamic
                          </button>
                          <button
                            type="button"
                            className={`utility-ctrl-pill${appearanceMode === 'dark_frosted' ? ' is-active' : ''}`}
                            onClick={() => handleSetAppearance('dark_frosted')}
                          >
                            Dark
                          </button>
                        </div>
                      </div>

                      <div className="utility-ctrl-row">
                        <span className="utility-ctrl-label">Music Volume ({volume}%)</span>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={volume}
                          onChange={(e) => onVolumeChange?.(Number(e.target.value))}
                          className="utility-ctrl-slider"
                          aria-label="Music Volume"
                        />
                      </div>

                      <div className="utility-ctrl-footer">
                        <button
                          type="button"
                          className="utility-ctrl-link"
                          onClick={() => window.island?.openSettings?.()}
                        >
                          All Settings
                        </button>
                        <button
                          type="button"
                          className="utility-ctrl-link"
                          onClick={() => window.island?.openWorkspace?.()}
                        >
                          AI Workspace
                        </button>
                      </div>
                    </div>
                  )}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </LayoutGroup>
    </div>
  );
}
