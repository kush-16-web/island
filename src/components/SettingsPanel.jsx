import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { SPRING } from '../lib/motion';
import { Switch } from './bits';
import { Icon } from './icons';
import WindowsVoicePreview from './WindowsVoicePreview';
import KokoroPreview from './KokoroPreview';

/**
 * SettingsPanel: Apple-inspired desktop preferences for Dynamic Island.
 * Features Framer Motion gliding pill, Lucide animated icons, dynamic album-tinted accents,
 * and clean typography without cluttered AI badge boxes.
 */
export default function SettingsPanel({ accentColor }) {
  const [currentPreset, setCurrentPreset] = useState('center');
  const [currentEdge, setCurrentEdge] = useState('top');
  const [dockMode, setDockMode] = useState('smart');
  const [snapThreshold, setSnapThreshold] = useState(85);
  const [autohideIsland, setAutohideIsland] = useState(true);
  const [autohidePet, setAutohidePet] = useState(true);
  const [userName, setUserName] = useState(() => {
    try {
      return localStorage.getItem('island_user_name') || 'Friend';
    } catch {
      return 'Friend';
    }
  });
  const [lyricsOffset, setLyricsOffset] = useState(() => {
    try {
      const saved = localStorage.getItem('island_lyrics_offset');
      return saved !== null ? Number(saved) : 0;
    } catch {
      return 0;
    }
  });
  const [showVoiceDiscovery, setShowVoiceDiscovery] = useState(false);
  const [showKokoroPreview, setShowKokoroPreview] = useState(false);
  const [vadSilenceMs, setVadSilenceMs] = useState(() => {
    try {
      return Number(localStorage.getItem('island_vad_silence_ms')) || 1400;
    } catch {
      return 1400;
    }
  });

  useEffect(() => {
    window.island?.getWindowDock?.().then((res) => {
      if (res?.preset) setCurrentPreset(res.preset);
      if (res?.edge) setCurrentEdge(res.edge);
    });
    window.island?.getDockMode?.().then((res) => {
      if (res) setDockMode(res);
    });
    window.island?.getSnapThreshold?.().then((res) => {
      if (typeof res === 'number') setSnapThreshold(res);
    });
    window.island?.getAutohide?.().then((res) => {
      if (typeof res === 'boolean') setAutohideIsland(res);
    });
    window.island?.getAutohidePet?.().then((res) => {
      if (typeof res === 'boolean') setAutohidePet(res);
    });

    if (window.island?.on) {
      return window.island.on('window:dock-changed', (snapped) => {
        if (snapped?.preset) setCurrentPreset(snapped.preset);
        if (snapped?.edge) setCurrentEdge(snapped.edge);
      });
    }
  }, []);

  const handleSetDockMode = (mode) => {
    setDockMode(mode);
    window.island?.setDockMode?.(mode);
  };

  const handleSetSnapThreshold = (val) => {
    setSnapThreshold(val);
    window.island?.setSnapThreshold?.(val);
  };

  const handleSetLyricsOffset = (offset) => {
    setLyricsOffset(offset);
    localStorage.setItem('island_lyrics_offset', String(offset));
    window.dispatchEvent(new CustomEvent('island:lyrics-offset-changed'));
  };

  const handleSetEdge = (edge) => {
    setCurrentEdge(edge);
    const defaultPreset = edge === 'top' || edge === 'bottom' ? 'center' : 'middle';
    setCurrentPreset(defaultPreset);
    window.island?.setWindowPreset?.({ preset: defaultPreset, edge });
  };

  const handleSetPreset = (preset) => {
    setCurrentPreset(preset);
    window.island?.setWindowPreset?.({ preset, edge: currentEdge });
  };

  const handleToggleAutohideIsland = (next) => {
    setAutohideIsland(next);
    window.island?.setAutohide?.(next);
  };

  const handleToggleAutohidePet = (next) => {
    setAutohidePet(next);
    window.island?.setAutohidePet?.(next);
  };

  const handleResetPos = () => {
    setCurrentEdge('top');
    setCurrentPreset('center');
    window.island?.resetWindowPos?.();
  };

  const isHorizontalEdge = currentEdge === 'top' || currentEdge === 'bottom';

  const MODES = [
    { id: 'smart', label: 'Smart Snapping', Glyph: Icon.Magnet, title: 'Edge magnetic snapping with free-space middle zone' },
    { id: 'free', label: 'Free Floating', Glyph: Icon.Move, title: 'Drop the Island anywhere with 100% full-screen freedom' },
    { id: 'always', label: 'Always Docked', Glyph: Icon.Layers, title: 'Lock Island firmly to a designated screen bezel' },
  ];

  return (
    <div className="settings-panel scroll" style={{ '--panel-accent': accentColor || 'var(--c-info)' }}>
      {/* Mode Segmented Controller with Framer Motion Gliding Pill */}
      <div className="settings-segmented">
        {MODES.map(({ id, label, Glyph, title }) => (
          <button
            key={id}
            type="button"
            className={`settings-segmented__item ${dockMode === id ? 'is-active' : ''}`}
            onClick={() => handleSetDockMode(id)}
            title={title}
          >
            {dockMode === id && (
              <motion.span
                layoutId="settings-dock-pill"
                className="settings-segmented__pill"
                transition={SPRING}
              />
            )}
            <span className="settings-segmented__label">
              <Glyph width={14} height={14} />
              <span>{label}</span>
            </span>
          </button>
        ))}
      </div>

      {/* Mode 1: Smart Snapping (Magnetic snap sensitivity & current dynamic anchor) */}
      {dockMode === 'smart' && (
        <div className="settings-group">
          <div className="settings-row">
            <div className="settings-row__text">
              <span className="settings-row__title">Magnetic Snap Range</span>
              <span className="settings-row__sub">Pulls to screen edges when close; floats freely in center area</span>
            </div>
            <div className="settings-chips">
              {[
                { label: 'Gentle (50px)', val: 50 },
                { label: 'Standard (85px)', val: 85 },
                { label: 'Strong (130px)', val: 130 },
              ].map((item) => (
                <button
                  key={item.val}
                  type="button"
                  className={`settings-chip ${snapThreshold === item.val ? 'is-active' : ''}`}
                  onClick={() => handleSetSnapThreshold(item.val)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-divider" />

          <div className="settings-row">
            <div className="settings-row__text">
              <span className="settings-row__title">Current Dock Status</span>
              <span className="settings-row__sub">
                {currentEdge === 'free'
                  ? 'Floating in center open area'
                  : `Magnetically docked to ${currentEdge.toUpperCase()} (${currentPreset.toUpperCase()})`}
              </span>
            </div>
            <button
              type="button"
              className="settings-btn-inline"
              onClick={() => {
                handleSetEdge('top');
                handleSetPreset('center');
              }}
              title="Snap to Top Center"
            >
              <Icon.RotateCcw width={12} height={12} />
              <span>Snap to Top</span>
            </button>
          </div>
        </div>
      )}

      {/* Mode 2: Free Floating (100% unrestricted canvas) */}
      {dockMode === 'free' && (
        <div className="settings-group">
          <div className="settings-radar-card">
            <div className="settings-radar-preview" aria-hidden="true">
              <div className="settings-radar-screen">
                <div className="settings-radar-island" />
              </div>
            </div>
            <div className="settings-radar-info">
              <div className="settings-radar-header">
                <span className="settings-radar-title">Full-Screen Free Floating</span>
                <span className="settings-badge-live">Active</span>
              </div>
              <p className="settings-radar-desc">
                Drag and drop the Island anywhere from the top bezel to the taskbar. Zero edge locks or boundary blocks.
              </p>
              <div className="settings-radar-actions">
                <button
                  type="button"
                  className="settings-btn-action"
                  onClick={handleResetPos}
                  title="Snap back to Top Center"
                >
                  <Icon.RotateCcw width={12} height={12} />
                  <span>Center Display</span>
                </button>
                <button
                  type="button"
                  className="settings-btn-action settings-btn-action--secondary"
                  onClick={() => {
                    handleSetDockMode('always');
                    handleSetEdge('top');
                    handleSetPreset('center');
                  }}
                  title="Switch to Fixed Top Dock"
                >
                  <Icon.Monitor width={12} height={12} />
                  <span>Dock Top</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mode 3: Always Docked (Manual fixed edge & alignment lock) */}
      {dockMode === 'always' && (
        <div className="settings-group">
          {/* Edge Selection */}
          <div className="settings-row">
            <div className="settings-row__text">
              <span className="settings-row__title">Dock Screen Edge</span>
              <span className="settings-row__sub">Lock Island firmly to a designated screen bezel</span>
            </div>
            <div className="settings-chips">
              {['top', 'bottom', 'left', 'right'].map((edge) => (
                <button
                  key={edge}
                  type="button"
                  className={`settings-chip ${currentEdge === edge ? 'is-active' : ''}`}
                  onClick={() => handleSetEdge(edge)}
                >
                  {edge.charAt(0).toUpperCase() + edge.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-divider" />

          {/* Alignment Selection */}
          <div className="settings-row">
            <div className="settings-row__text">
              <span className="settings-row__title">Edge Alignment</span>
              <span className="settings-row__sub">Position along selected edge</span>
            </div>
            <div className="settings-chips">
              {isHorizontalEdge ? (
                <>
                  <button
                    type="button"
                    className={`settings-chip ${currentPreset === 'left' ? 'is-active' : ''}`}
                    onClick={() => handleSetPreset('left')}
                  >
                    Left
                  </button>
                  <button
                    type="button"
                    className={`settings-chip ${currentPreset === 'center' ? 'is-active' : ''}`}
                    onClick={() => handleSetPreset('center')}
                  >
                    Center
                  </button>
                  <button
                    type="button"
                    className={`settings-chip ${currentPreset === 'right' ? 'is-active' : ''}`}
                    onClick={() => handleSetPreset('right')}
                  >
                    Right
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className={`settings-chip ${currentPreset === 'top' ? 'is-active' : ''}`}
                    onClick={() => handleSetPreset('top')}
                  >
                    Top
                  </button>
                  <button
                    type="button"
                    className={`settings-chip ${currentPreset === 'middle' ? 'is-active' : ''}`}
                    onClick={() => handleSetPreset('middle')}
                  >
                    Middle
                  </button>
                  <button
                    type="button"
                    className={`settings-chip ${currentPreset === 'bottom' ? 'is-active' : ''}`}
                    onClick={() => handleSetPreset('bottom')}
                  >
                    Bottom
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Display & Behavior Group */}
      <div className="settings-group">
        <div className="settings-row settings-row--switch">
          <div className="settings-row__text">
            <span className="settings-row__title">Hide Island in Fullscreen</span>
            <span className="settings-row__sub">YouTube, games, and full-screen windows</span>
          </div>
          <Switch checked={autohideIsland} onChange={handleToggleAutohideIsland} label="Toggle island fullscreen autohide" />
        </div>

        <div className="settings-divider" />

        <div className="settings-row settings-row--switch">
          <div className="settings-row__text">
            <span className="settings-row__title">Hide Pet in Fullscreen</span>
            <span className="settings-row__sub">Companion pet autohides during games and videos</span>
          </div>
          <Switch checked={autohidePet} onChange={handleToggleAutohidePet} label="Toggle pet fullscreen autohide" />
        </div>
      </div>

      {/* Lyrics Synchronization Group */}
      <div className="settings-group">
        <div className="settings-row settings-row--wrap">
          <div className="settings-row__text">
            <span className="settings-row__title">Lyrics Synchronization</span>
            <span className="settings-row__sub">Scroll lead-time to match singer vocal delivery</span>
          </div>
          <div className="settings-chips">
            {[
              { label: 'Faster (-400ms)', val: 150 },
              { label: 'Natural (-250ms)', val: 0 },
              { label: 'Exact (0ms)', val: -250 },
              { label: 'Late (+150ms)', val: -400 },
            ].map((item) => (
              <button
                key={item.label}
                type="button"
                className={`settings-chip ${lyricsOffset === item.val ? 'is-active' : ''}`}
                onClick={() => handleSetLyricsOffset(item.val)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Voice Assistant Identity */}
      <div className="settings-group">
        <div className="settings-row">
          <div className="settings-row__text">
            <span className="settings-row__title">Your Name</span>
            <span className="settings-row__sub">What Island & your companion pet calls you in voice conversations</span>
          </div>
          <div className="settings-input-box">
            <input
              type="text"
              className="settings-text-input"
              value={userName}
              onChange={(e) => {
                const val = e.target.value.slice(0, 20);
                setUserName(val);
                localStorage.setItem('island_user_name', val);
                window.dispatchEvent(new CustomEvent('island:pet-settings-changed'));
              }}
              placeholder="Friend"
            />
          </div>
        </div>
      </div>

      {/* Voice Assistant Silence Detection Tuning */}
      <div className="settings-group">
        <div className="settings-row settings-row--wrap">
          <div className="settings-row__text">
            <span className="settings-row__title">Speech Pause Detection</span>
            <span className="settings-row__sub">Silence delay before Jadu processes your turn (prevents premature cut-offs)</span>
          </div>
          <div className="settings-chips">
            {[
              { label: '850ms (Rapid)', val: 850 },
              { label: '1400ms (Recommended)', val: 1400 },
              { label: '2000ms (Relaxed)', val: 2000 },
            ].map((item) => (
              <button
                key={item.label}
                type="button"
                className={`settings-chip ${vadSilenceMs === item.val ? 'is-active' : ''}`}
                onClick={() => {
                  setVadSilenceMs(item.val);
                  localStorage.setItem('island_vad_silence_ms', String(item.val));
                  window.dispatchEvent(new CustomEvent('island:vad-timing-changed', { detail: item.val }));
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Local Windows Voice Discovery */}
      <div className="settings-group">
        <div className="settings-row">
          <div className="settings-row__text">
            <span className="settings-row__title">Windows Voice Discovery</span>
            <span className="settings-row__sub">Audit and test local offline voices (Heera, Ravi, David, Zira, etc.)</span>
          </div>
          <button
            type="button"
            className="settings-chip is-active"
            onClick={() => setShowVoiceDiscovery((prev) => !prev)}
          >
            {showVoiceDiscovery ? 'Hide Preview' : 'Open Preview'}
          </button>
        </div>
        {showVoiceDiscovery && (
          <div style={{ marginTop: 12 }}>
            <WindowsVoicePreview onClose={() => setShowVoiceDiscovery(false)} />
          </div>
        )}
      </div>

      {/* Kokoro Local TTS Prototype */}
      <div className="settings-group">
        <div className="settings-row">
          <div className="settings-row__text">
            <span className="settings-row__title">Kokoro Local TTS Prototype (CPU)</span>
            <span className="settings-row__sub">Isolated ONNX local speech synthesis test (af_heart, benchmarks, offline)</span>
          </div>
          <button
            type="button"
            className="settings-chip is-active"
            style={{ background: '#ec4899', color: '#fff', borderColor: '#ec4899' }}
            onClick={() => setShowKokoroPreview((prev) => !prev)}
          >
            {showKokoroPreview ? 'Close Prototype' : 'Open Prototype'}
          </button>
        </div>
        {showKokoroPreview && (
          <div style={{ marginTop: 12 }}>
            <KokoroPreview onClose={() => setShowKokoroPreview(false)} />
          </div>
        )}
      </div>

      {/* Shortcuts & Footer */}
      <div className="settings-footer">
        <div className="settings-footer__hint">
          <Icon.Sparkles width={13} height={13} />
          <span>Press <code>Esc</code> or click outside anytime to collapse.</span>
        </div>
        {dockMode !== 'free' && (
          <button type="button" className="settings-footer__reset" onClick={handleResetPos}>
            <Icon.RotateCcw width={12} height={12} />
            <span>Reset Dock</span>
          </button>
        )}
      </div>
    </div>
  );
}
