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
  { id: 'assistant', title: 'Assistant', sub: 'Text & voice chat', Glyph: Icon.Sparkles },
  { id: 'controls', title: 'Quick Controls', sub: 'Notch & audio', Glyph: Icon.Sliders },
];

/**
 * LauncherPanel — Utilities 2×2 Grid & Full-Surface Morphing (Phase 1B.2 Checkpoint D)
 *
 * - Compact 2×2 grid of monochrome utility tiles
 * - Clicking a tile morphs that selected tile into the entire utility surface
 * - Other tiles exit smoothly (no accordions, no stacked detail cards)
 * - Small Back control reverses the morph to restore the 2×2 grid
 */
export default function LauncherPanel({
  s,
  now,
  setTab,
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

  const { schedule = [] } = s;
  const activeTimers = schedule.filter((i) => i.kind === 'timer').sort((a, b) => a.fireAt - b.fireAt);
  const nextTimer = activeTimers[0] || null;

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
        : 'Conditions';
    }
    if (id === 'assistant') {
      return voice?.status && voice.status !== 'idle'
        ? `${assistantName} active`
        : 'Ask anything';
    }
    return `${visibilityMode === 'always' ? 'Always' : visibilityMode === 'smart_hide' ? 'Smart' : 'Peek'} · ${volume}%`;
  };

  const activeMeta = UTILITIES.find((u) => u.id === activeUtility) || null;

  return (
    <div className="utilities-root" style={{ '--accent': accentColor || 'var(--c-info)' }}>
      <LayoutGroup id="utilities-morph">
        <AnimatePresence mode="wait" initial={false}>
          {!activeUtility ? (
            <motion.div
              key="utilities-grid"
              className="utilities-grid"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={contentTransition}
            >
              {UTILITIES.map(({ id, title, Glyph }) => (
                <motion.button
                  key={id}
                  type="button"
                  layoutId={`utility-surface-${id}`}
                  className="utility-tile"
                  onClick={() => setActiveUtility(id)}
                  transition={morphTransition}
                >
                  <span className="utility-tile__icon">
                    <Glyph width={16} height={16} />
                  </span>
                  <div className="utility-tile__text">
                    <span className="utility-tile__title">{title}</span>
                    <span className="utility-tile__sub">{renderTileSub(id)}</span>
                  </div>
                </motion.button>
              ))}
            </motion.div>
          ) : (
            <motion.div
              key={`utility-active-${activeUtility}`}
              layoutId={`utility-surface-${activeUtility}`}
              className="utility-surface"
              transition={morphTransition}
            >
              <div className="utility-surface__head">
                <button
                  type="button"
                  className="utility-surface__back"
                  onClick={() => setActiveUtility(null)}
                  aria-label="Back to Utilities"
                >
                  <Icon.Prev width={12} height={12} />
                  <span>Utilities</span>
                </button>
                <span className="utility-surface__title">{activeMeta?.title}</span>
                <div className="utility-surface__head-right">
                  {activeUtility === 'assistant' && (
                    <CompanionEyes size="sm" mood={companionMood} animationsEnabled={companionAnimations} />
                  )}
                </div>
              </div>

              <div className="utility-surface__body">
                {activeUtility === 'timer' && (
                  <div className="utility-pane utility-pane--timer">
                    <ClockPanel schedule={schedule} now={now} />
                  </div>
                )}

                {activeUtility === 'weather' && (
                  <div className="utility-pane utility-pane--weather">
                    {cachedWeather ? (
                      <div className="utility-weather-summary">
                        <div className="utility-weather-temp">{Math.round(cachedWeather.temp)}°</div>
                        <div className="utility-weather-meta">
                          <div className="utility-weather-loc">{cachedWeather.location || 'Local'}</div>
                          <div className="utility-weather-cond">{cachedWeather.condition || 'Available'}</div>
                        </div>
                      </div>
                    ) : (
                      <div className="utility-empty-state">
                        <Icon.Sun width={20} height={20} />
                        <p>Live weather provider connects in the next checkpoint.</p>
                      </div>
                    )}
                  </div>
                )}

                {activeUtility === 'assistant' && (
                  <div className="utility-pane utility-pane--assistant">
                    <div className="utility-assistant-empty">
                      <p>Ask {assistantName} a question or open the full workspace.</p>
                    </div>
                    <div className="utility-assistant-composer">
                      <input
                        type="text"
                        className="utility-assistant-input"
                        placeholder={`Message ${assistantName}…`}
                        value={draftPrompt}
                        onChange={(e) => setDraftPrompt(e.target.value)}
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
                        onClick={() => window.island?.openWorkspace?.()}
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
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </LayoutGroup>
    </div>
  );
}
