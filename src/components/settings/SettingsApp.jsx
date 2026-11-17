import { useEffect, useState } from 'react';
import Titlebar from '../common/Titlebar';
import { useThemeMode } from '../common/useThemeMode';
import { useWindowState } from '../common/useWindowState';
import { getIdleNotchPrefs, setIdleNotchPrefs, IDLE_PRESETS } from '../../lib/idle-prefs';
import { Icon } from '../icons';
import AuraStudio from './AuraStudio';
import '../common/quiet-glass.css';
import './settings-window.css';

const CATEGORIES = [
  { id: 'general', label: 'General', icon: Icon.Home },
  { id: 'appearance', label: 'Appearance', icon: Icon.Sun },
  { id: 'notch', label: 'Notch & Visibility', icon: Icon.Sliders },
  { id: 'aura', label: 'Aura Studio', icon: Icon.Sparkles, badge: 'New' },
  { id: 'windows', label: 'Windows', icon: Icon.Layers },
  { id: 'ai', label: 'AI & Models', icon: Icon.Sparkles, badge: 'In Hub' },
  { id: 'voice', label: 'Voice & Audio', icon: Icon.Mic, badge: 'In Hub' },
  { id: 'lyrics', label: 'Music & Lyrics', icon: Icon.Music, badge: 'In Hub' },
  { id: 'pet', label: 'Desktop Pet', icon: Icon.Paw },
  { id: 'advanced', label: 'Advanced', icon: Icon.Sliders },
  { id: 'about', label: 'About', icon: Icon.Clock },
];

/**
 * SettingsApp: Compact Desktop Preferences Window (Phase 1A.3).
 * 
 * 540×520 compact drill-down navigation:
 * - Category list with smooth transition into detail view
 * - Back navigation button for rapid, focused access
 * - Functional Appearance Mode with live swatch preview
 * - Functional Desktop Pet companion toggle
 * - Monochrome icons, no nested card clutter, high contrast
 */
export default function SettingsApp() {
  const [activeCategory, setActiveCategory] = useState(() => {
    try {
      const hash = window.location.hash || '';
      const queryStr = hash.includes('?') ? hash.split('?')[1] : '';
      const params = new URLSearchParams(queryStr);
      const initialTab = params.get('tab') || params.get('category');
      if (initialTab && CATEGORIES.some((c) => c.id === initialTab)) {
        return initialTab;
      }
    } catch {}
    return 'general';
  });
  const [petVisible, setPetVisible] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [copiedDiag, setCopiedDiag] = useState(false);
  const [notchVisibility, setNotchVisibility] = useState('always');
  const [displayInfo, setDisplayInfo] = useState({ selectedDisplayId: null, displays: [] });
  const [idlePrefs, setIdlePrefsState] = useState(getIdleNotchPrefs);

  const handleUpdateIdlePrefs = (patch) => {
    const next = setIdleNotchPrefs(patch);
    setIdlePrefsState(next);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2000);
  };

  const {
    appearanceMode,
    setAppearanceMode,
    accentColor,
    isDynamic,
    hasAlbumColor,
    windowStyle,
  } = useThemeMode();

  const { isMaximized, isTransitioning, toggleMaximize } = useWindowState();

  // Load initial settings & handle IPC
  useEffect(() => {
    // 1. Check Pet Visibility
    if (window.island?.getPetVisible) {
      window.island.getPetVisible().then((v) => setPetVisible(Boolean(v))).catch(() => {});
    } else {
      setPetVisible(localStorage.getItem('island_pet_visible') === 'true');
    }

    // 2. Check Notch Visibility & Displays
    if (window.island?.getNotchVisibilityMode) {
      window.island.getNotchVisibilityMode().then((m) => {
        if (m) setNotchVisibility(m);
      }).catch(() => {});
    }
    if (window.island?.getNotchDisplays) {
      window.island.getNotchDisplays().then((info) => {
        if (info) setDisplayInfo(info);
      }).catch(() => {});
    }

    // 3. Listen to external tab-change requests, pet updates, and notch visibility via IPC
    if (window.island?.on) {
      const unsubTab = window.island.on('settings:tab-change', (data) => {
        if (data?.tab && CATEGORIES.some((c) => c.id === data.tab)) {
          setActiveCategory(data.tab);
        }
      });
      const unsubPet = window.island.on('pet:visibility-changed', (data) => {
        if (typeof data?.visible === 'boolean') {
          setPetVisible(data.visible);
        }
      });
      const unsubVis = window.island.on('notch:visibility-changed', (data) => {
        if (data?.mode) setNotchVisibility(data.mode);
      });
      return () => {
        unsubTab?.();
        unsubPet?.();
        unsubVis?.();
      };
    }
    return undefined;
  }, []);

  const handleSelectNotchVisibility = (mode) => {
    setNotchVisibility(mode);
    if (window.island?.setNotchVisibilityMode) {
      window.island.setNotchVisibilityMode(mode);
    }
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2000);
  };

  const handleSelectDisplay = (displayId) => {
    const parsed = displayId === 'primary' ? null : Number(displayId);
    setDisplayInfo((prev) => ({ ...prev, selectedDisplayId: parsed }));
    if (window.island?.setNotchDisplay) {
      window.island.setNotchDisplay(parsed);
    }
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2000);
  };

  const handleTogglePet = () => {
    const next = !petVisible;
    setPetVisible(next);
    localStorage.setItem('island_pet_visible', String(next));
    if (window.island?.setPetVisible) {
      window.island.setPetVisible(next);
    }
  };

  const handleSelectAppearance = (mode) => {
    setAppearanceMode(mode);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2000);
  };

  const copyDiagnostics = () => {
    const diag = {
      app: 'Island AI Desktop',
      version: '0.1.0',
      appearanceMode,
      accentColor,
      petVisible,
      os: 'Windows 11 (x64)',
      electron: '44.9.0',
      time: new Date().toISOString(),
    };
    navigator.clipboard?.writeText(JSON.stringify(diag, null, 2));
    setCopiedDiag(true);
    setTimeout(() => setCopiedDiag(false), 1800);
  };

  const currentCat = CATEGORIES.find((c) => c.id === activeCategory);

  return (
    <div
      className={`quiet-glass-window settings-window${hasAlbumColor ? ' is-dynamic' : ''}${isMaximized ? ' is-maximized' : ''}${isTransitioning ? ' is-transitioning' : ''}`}
      style={windowStyle}
    >
      <Titlebar
        title="Settings"
        subtitle={currentCat ? currentCat.label : ''}
        accentColor={accentColor}
        isDynamic={hasAlbumColor}
        isMaximized={isMaximized}
        onToggleMaximize={toggleMaximize}
      />

      <div className="settings-body settings-body--split">
        {/* Left Sidebar */}
        <aside className="settings-sidebar">
          <div className="settings-sidebar__list">
            {CATEGORIES.map((cat) => {
              const Glyph = cat.icon;
              const isActive = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  className={`settings-sidebar__item${isActive ? ' is-active' : ''}${cat.id === 'aura' ? ' is-featured' : ''}`}
                  onClick={() => setActiveCategory(cat.id)}
                >
                  <span className="settings-sidebar__icon">
                    <Glyph width={15} height={15} />
                  </span>
                  <span className="settings-sidebar__label">{cat.label}</span>
                  {cat.badge && (
                    <span className={`settings-sidebar__badge${cat.id === 'aura' ? ' is-featured-badge' : ''}`}>{cat.badge}</span>
                  )}
                </button>
              );
            })}
          </div>
        </aside>

        {/* Right Stage */}
        <main className="settings-stage">
          {savedNotice && (
            <div className="settings-stage__toast">
              <Icon.Check width={12} height={12} /> Saved
            </div>
          )}

          <div className="settings-stage__content">
            {/* 0. AURA STUDIO */}
            {activeCategory === 'aura' && (
              <AuraStudio accentColor={accentColor} />
            )}

            {/* 1. GENERAL */}
            {activeCategory === 'general' && (
                <div className="settings-pane-inner">
                  <h2 className="settings-pane__title">General</h2>
                  <p className="settings-pane__desc">
                    Desktop shortcuts and startup behavior.
                  </p>

                  <div className="settings-list-group">
                    <div className="settings-item-row">
                      <div className="settings-item-row__text">
                        <span className="settings-item-row__label">Launch on Startup</span>
                        <span className="settings-item-row__sub">Start Island in background when signing in.</span>
                      </div>
                      <span className="settings-tag">System Tray</span>
                    </div>

                    <div className="settings-item-row">
                      <div className="settings-item-row__text">
                        <span className="settings-item-row__label">AI Workspace</span>
                        <span className="settings-item-row__sub">Open dedicated AI companion workspace.</span>
                      </div>
                      <span className="settings-kbd"><kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>A</kbd></span>
                    </div>

                    <div className="settings-item-row">
                      <div className="settings-item-row__text">
                        <span className="settings-item-row__label">Settings</span>
                        <span className="settings-item-row__sub">Open dedicated settings window.</span>
                      </div>
                      <span className="settings-kbd"><kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>S</kbd></span>
                    </div>

                    <div className="settings-item-row">
                      <div className="settings-item-row__text">
                        <span className="settings-item-row__label">Talk to Island</span>
                        <span className="settings-item-row__sub">Trigger ambient voice speech session.</span>
                      </div>
                      <span className="settings-kbd"><kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Space</kbd></span>
                    </div>

                    <div className="settings-item-row">
                      <div className="settings-item-row__text">
                        <span className="settings-item-row__label">Open Island Hub</span>
                        <span className="settings-item-row__sub">Expand dynamic island companion.</span>
                      </div>
                      <span className="settings-kbd"><kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>Space</kbd></span>
                    </div>
                  </div>
                </div>
              )}

              {/* 2. APPEARANCE */}
              {activeCategory === 'appearance' && (
                <div className="settings-pane-inner">
                  <h2 className="settings-pane__title">Appearance</h2>
                  <p className="settings-pane__desc">
                    Choose between dynamic artwork tinting or neutral dark graphite.
                  </p>

                  <div className="settings-list-group">
                    <div
                      className={`settings-select-row${appearanceMode === 'dynamic_frosted' ? ' is-selected' : ''}`}
                      onClick={() => handleSelectAppearance('dynamic_frosted')}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="settings-select-row__radio">
                        <span className="settings-radio-dot" />
                      </div>
                      <div className="settings-select-row__text">
                        <div className="settings-select-row__title">Dynamic Frosted</div>
                        <div className="settings-select-row__desc">
                          Subtly reflects accent tones from currently playing music. Falls back to neutral graphite when idle.
                        </div>
                      </div>
                    </div>

                    <div
                      className={`settings-select-row${appearanceMode === 'dark_frosted' ? ' is-selected' : ''}`}
                      onClick={() => handleSelectAppearance('dark_frosted')}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="settings-select-row__radio">
                        <span className="settings-radio-dot" />
                      </div>
                      <div className="settings-select-row__text">
                        <div className="settings-select-row__title">Dark Frosted</div>
                        <div className="settings-select-row__desc">
                          Neutral graphite appearance across all windows with no music color adaptation.
                        </div>
                      </div>
                    </div>

                    <div className="settings-item-row">
                      <div className="settings-item-row__text">
                        <span className="settings-item-row__label">Active Accent</span>
                        <span className="settings-item-row__sub">
                          {isDynamic
                            ? hasAlbumColor
                              ? 'Derived from album art'
                              : 'Neutral graphite fallback'
                            : 'Constant neutral slate'}
                        </span>
                      </div>
                      <div className="settings-swatch-chip">
                        <span className="settings-swatch-dot" style={{ backgroundColor: accentColor }} />
                        <code>{accentColor}</code>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 3. NOTCH & VISIBILITY */}
              {activeCategory === 'notch' && (
                <div className="settings-pane-inner">
                  <h2 className="settings-pane__title">Notch & Visibility</h2>
                  <p className="settings-pane__desc">
                    Top-attached notch behavior, visibility modes, and display placement.
                  </p>

                  <div className="settings-list-group">
                    <button
                      type="button"
                      className={`settings-item-row settings-item-row--selectable${notchVisibility === 'always' ? ' is-selected' : ''}`}
                      onClick={() => handleSelectNotchVisibility('always')}
                    >
                      <div className="settings-item-row__text">
                        <span className="settings-item-row__label">Always Visible</span>
                        <span className="settings-item-row__sub">Compact notch stays anchored at top-center.</span>
                      </div>
                      {notchVisibility === 'always' && <span className="settings-tag">Active</span>}
                    </button>

                    <button
                      type="button"
                      className={`settings-item-row settings-item-row--selectable${notchVisibility === 'smart_hide' ? ' is-selected' : ''}`}
                      onClick={() => handleSelectNotchVisibility('smart_hide')}
                    >
                      <div className="settings-item-row__text">
                        <span className="settings-item-row__label">Smart Hide</span>
                        <span className="settings-item-row__sub">Hides when idle; reveals on media, voice, or shortcuts.</span>
                      </div>
                      {notchVisibility === 'smart_hide' && <span className="settings-tag">Active</span>}
                    </button>

                    <button
                      type="button"
                      className={`settings-item-row settings-item-row--selectable${notchVisibility === 'peek' ? ' is-selected' : ''}`}
                      onClick={() => handleSelectNotchVisibility('peek')}
                    >
                      <div className="settings-item-row__text">
                        <span className="settings-item-row__label">Peek at Top Edge</span>
                        <span className="settings-item-row__sub">Tucks into a minimal top-edge lip until hovered.</span>
                      </div>
                      {notchVisibility === 'peek' && <span className="settings-tag">Active</span>}
                    </button>

                    {displayInfo.displays.length > 1 && (
                      <div className="settings-item-row">
                        <div className="settings-item-row__text">
                          <span className="settings-item-row__label">Target Display</span>
                          <span className="settings-item-row__sub">Choose which monitor hosts the notch.</span>
                        </div>
                        <select
                          className="settings-select"
                          value={displayInfo.selectedDisplayId ?? 'primary'}
                          onChange={(e) => handleSelectDisplay(e.target.value)}
                          aria-label="Target Display"
                        >
                          <option value="primary">Primary Display</option>
                          {displayInfo.displays.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.label}{d.isPrimary ? ' (Primary)' : ''} — {d.bounds?.width}×{d.bounds?.height}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  <h3 className="settings-subhead" style={{ marginTop: 18 }}>Idle Notch Content</h3>
                  <div className="settings-list-group">
                    <div className="settings-item-row">
                      <div className="settings-item-row__text">
                        <span className="settings-item-row__label">Idle Layout Preset</span>
                        <span className="settings-item-row__sub">Eyes remain centered in all eye presets.</span>
                      </div>
                      <select
                        className="settings-select"
                        value={idlePrefs.preset}
                        onChange={(e) => handleUpdateIdlePrefs({ preset: e.target.value })}
                        aria-label="Idle Layout Preset"
                      >
                        <option value={IDLE_PRESETS.EYES_ONLY}>Eyes only (Default)</option>
                        <option value={IDLE_PRESETS.EYES_CLOCK}>Eyes + clock</option>
                        <option value={IDLE_PRESETS.CLOCK_WEATHER}>Clock + weather</option>
                        <option value={IDLE_PRESETS.EYES_WEATHER}>Eyes + compact weather</option>
                        <option value={IDLE_PRESETS.CUSTOM}>Custom</option>
                      </select>
                    </div>

                    {idlePrefs.preset === IDLE_PRESETS.CUSTOM && (
                      <div className="settings-item-row">
                        <div className="settings-item-row__text">
                          <span className="settings-item-row__label">Custom Elements</span>
                          <span className="settings-item-row__sub">Toggle individual idle indicators.</span>
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {[
                            { key: 'showEyes', label: 'Eyes' },
                            { key: 'showTime', label: 'Time' },
                            { key: 'showDate', label: 'Date' },
                            { key: 'showWeather', label: 'Weather' },
                          ].map((item) => (
                            <button
                              key={item.key}
                              type="button"
                              className={`settings-action-btn${idlePrefs[item.key] ? ' is-active' : ''}`}
                              style={idlePrefs[item.key] ? { background: 'rgba(255,255,255,0.14)', borderColor: 'rgba(255,255,255,0.28)' } : undefined}
                              onClick={() => handleUpdateIdlePrefs({ [item.key]: !idlePrefs[item.key] })}
                            >
                              {item.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="settings-item-row">
                      <div className="settings-item-row__text">
                        <span className="settings-item-row__label">Companion Animations</span>
                        <span className="settings-item-row__sub">Natural blinking and subtle event reactions.</span>
                      </div>
                      <button
                        type="button"
                        className={`settings-toggle${idlePrefs.companionAnimations ? ' is-on' : ''}`}
                        onClick={() => handleUpdateIdlePrefs({ companionAnimations: !idlePrefs.companionAnimations })}
                        role="switch"
                        aria-checked={idlePrefs.companionAnimations}
                        aria-label="Toggle Companion Animations"
                      >
                        <span className="settings-toggle__thumb" />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* 4. WINDOWS */}
              {activeCategory === 'windows' && (
                <div className="settings-pane-inner">
                  <h2 className="settings-pane__title">Windows</h2>
                  <p className="settings-pane__desc">
                    Window geometry and display material properties.
                  </p>

                  <div className="settings-list-group">
                    <div className="settings-item-row">
                      <div className="settings-item-row__text">
                        <span className="settings-item-row__label">Bounds Persistence</span>
                        <span className="settings-item-row__sub">Window sizes clamp to display work area.</span>
                      </div>
                      <span className="settings-tag is-active">Active</span>
                    </div>

                    <div className="settings-item-row">
                      <div className="settings-item-row__text">
                        <span className="settings-item-row__label">Hardware Backdrop</span>
                        <span className="settings-item-row__sub">Windows 11 DWM Acrylic blur.</span>
                      </div>
                      <span className="settings-tag is-active">Acrylic</span>
                    </div>
                  </div>
                </div>
              )}

              {/* 5. AI */}
              {activeCategory === 'ai' && (
                <div className="settings-pane-inner">
                  <h2 className="settings-pane__title">AI & Models</h2>
                  <p className="settings-pane__desc">
                    Model selection and intelligence routing.
                  </p>
                  <div className="settings-notice-banner">
                    AI model keys and provider options are currently managed directly in the Island Hub. Dedicated window preferences arrive in Phase 1D.
                  </div>
                </div>
              )}

              {/* 6. VOICE */}
              {activeCategory === 'voice' && (
                <div className="settings-pane-inner">
                  <h2 className="settings-pane__title">Voice & Audio</h2>
                  <p className="settings-pane__desc">
                    Speech recognition and neural speech synthesis.
                  </p>
                  <div className="settings-notice-banner">
                    Kokoro ONNX Neural TTS and microphone sensitivity settings are active in the Island Hub. Dedicated window preferences arrive in Phase 1D.
                  </div>
                </div>
              )}

              {/* 7. MUSIC & LYRICS */}
              {activeCategory === 'lyrics' && (
                <div className="settings-pane-inner">
                  <h2 className="settings-pane__title">Music & Lyrics</h2>
                  <p className="settings-pane__desc">
                    Word-by-word karaoke synchronization and typography.
                  </p>
                  <div className="settings-notice-banner">
                    Lyric typography styles (Classic, Kinetic, Ghost + Wave) are configured in the Island Player lyrics popover.
                  </div>
                </div>
              )}

              {/* 8. DESKTOP PET */}
              {activeCategory === 'pet' && (
                <div className="settings-pane-inner">
                  <h2 className="settings-pane__title">Desktop Pet</h2>
                  <p className="settings-pane__desc">
                    Optional 3D kitten companion roaming your desktop.
                  </p>

                  <div className="settings-list-group">
                    <div className="settings-item-row">
                      <div className="settings-item-row__text">
                        <span className="settings-item-row__label">Enable Desktop Pet</span>
                        <span className="settings-item-row__sub">
                          When off, the pet window and its WebGL rendering process are shut down to save resources.
                        </span>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={petVisible}
                        className={`settings-switch${petVisible ? ' is-checked' : ''}`}
                        onClick={handleTogglePet}
                      >
                        <span className="settings-switch__thumb" />
                      </button>
                    </div>

                    <div className="settings-item-row">
                      <div className="settings-item-row__text">
                        <span className="settings-item-row__label">Process Status</span>
                        <span className="settings-item-row__sub">
                          {petVisible ? 'WebGL process active' : 'Zero CPU/GPU background overhead'}
                        </span>
                      </div>
                      <span className={`settings-tag${petVisible ? ' is-active' : ''}`}>
                        {petVisible ? 'Active' : 'Stopped'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* 9. ADVANCED */}
              {activeCategory === 'advanced' && (
                <div className="settings-pane-inner">
                  <h2 className="settings-pane__title">Advanced</h2>
                  <p className="settings-pane__desc">
                    System diagnostics and crash reporting.
                  </p>

                  <div className="settings-list-group">
                    <div className="settings-item-row">
                      <div className="settings-item-row__text">
                        <span className="settings-item-row__label">Export Diagnostics</span>
                        <span className="settings-item-row__sub">Copy runtime state for troubleshooting.</span>
                      </div>
                      <button
                        type="button"
                        className="settings-action-btn"
                        onClick={copyDiagnostics}
                      >
                        {copiedDiag ? 'Copied' : 'Copy'}
                      </button>
                    </div>

                    <div className="settings-item-row">
                      <div className="settings-item-row__text">
                        <span className="settings-item-row__label">Crash Log Directory</span>
                        <span className="settings-item-row__sub">%APPDATA%\island\Crashpad</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 10. ABOUT */}
              {activeCategory === 'about' && (
                <div className="settings-pane-inner">
                  <h2 className="settings-pane__title">About</h2>
                  <p className="settings-pane__desc">
                    Desktop companion architecture and version details.
                  </p>

                  <div className="settings-list-group">
                    <div className="settings-item-row">
                      <span className="settings-item-row__label">Island AI</span>
                      <span className="settings-tag">v0.1.0</span>
                    </div>
                    <div className="settings-item-row">
                      <span className="settings-item-row__label">Platform</span>
                      <span className="settings-text-val">Windows 11 (26H2)</span>
                    </div>
                    <div className="settings-item-row">
                      <span className="settings-item-row__label">Runtime</span>
                      <span className="settings-text-val">Electron 44.9.0 • Chromium 134</span>
                    </div>
                    <div className="settings-item-row">
                      <span className="settings-item-row__label">Backdrop</span>
                      <span className="settings-text-val">DWM Acrylic</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
    );
  }
