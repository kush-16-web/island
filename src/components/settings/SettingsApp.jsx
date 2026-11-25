import { useEffect, useRef, useState } from 'react';
import Titlebar from '../common/Titlebar';
import { useThemeMode } from '../common/useThemeMode';
import { useWindowState } from '../common/useWindowState';
import { getIdleNotchPrefs, setIdleNotchPrefs, IDLE_PRESETS, IDLE_WIDGET_OPTIONS, IDLE_WIDGETS } from '../../lib/idle-prefs';
import { Icon } from '../icons';
import AuraStudio from './AuraStudio';
import IdleWidget from '../IdleWidget';
import CompanionEyes from '../CompanionEyes';
import { computeNotchDimensions } from '../../lib/notch-state';
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
function AppleDropdown({ value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const selectedOpt = options.find((o) => o.id === value) || options[0];
  const dropdownRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div className="apple-dropdown-container" ref={dropdownRef}>
      <button
        type="button"
        className={`apple-dropdown-btn${open ? ' is-open' : ''}`}
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="apple-dropdown-btn__label">{selectedOpt?.label || value}</span>
        <svg
          className={`apple-dropdown-btn__chevron${open ? ' is-open' : ''}`}
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="apple-dropdown-menu" role="listbox">
          {options.map((opt) => {
            const isSelected = opt.id === value;
            return (
              <button
                key={opt.id}
                type="button"
                className={`apple-dropdown-item${isSelected ? ' is-selected' : ''}`}
                onClick={() => {
                  onChange(opt.id);
                  setOpen(false);
                }}
                role="option"
                aria-selected={isSelected}
              >
                <span className="apple-dropdown-item__text">{opt.label}</span>
                {isSelected && (
                  <svg
                    className="apple-dropdown-item__check"
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

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

                  <h3 className="settings-subhead" style={{ marginTop: 22 }}>Customizable Widgets</h3>
                  <div className="idle-concept-card">
                    <div className="idle-concept-card__header">
                      <span className="idle-concept-card__title">Interactive idle notch concept</span>
                    </div>

                    <div className="idle-concept-card__stage">
                      <div
                        className="idle-concept-notch"
                        style={{
                          width: computeNotchDimensions({ notchState: 'compact', mode: 'idle', idlePrefs }).width,
                          height: computeNotchDimensions({ notchState: 'compact', mode: 'idle', idlePrefs }).height,
                          borderBottomLeftRadius: computeNotchDimensions({ notchState: 'compact', mode: 'idle', idlePrefs }).bottomRadius,
                          borderBottomRightRadius: computeNotchDimensions({ notchState: 'compact', mode: 'idle', idlePrefs }).bottomRadius,
                        }}
                      >
                        <div className="idle__slot idle__slot--left">
                          <IdleWidget
                            type={idlePrefs.leftWidget || 'weather'}
                            now={new Date()}
                            weather={{ temp: 28, weatherCode: 0, isDay: true }}
                            battery={{ level: 85, charging: false }}
                            cpuPercent={14}
                            taskStats={{ ratio: '2/7', completed: 2, total: 7 }}
                            activeTimer={{ display: '04:15' }}
                          />
                        </div>

                        {idlePrefs.showEyes !== false && (
                          <div className="idle__center-eyes">
                            <CompanionEyes
                              mood="idle"
                              size="md"
                              animationsEnabled={idlePrefs.companionAnimations}
                            />
                          </div>
                        )}

                        <div className="idle__slot idle__slot--right">
                          <IdleWidget
                            type={idlePrefs.rightWidget || 'date'}
                            now={new Date()}
                            weather={{ temp: 28, weatherCode: 0, isDay: true }}
                            battery={{ level: 85, charging: false }}
                            cpuPercent={14}
                            taskStats={{ ratio: '2/7', completed: 2, total: 7 }}
                            activeTimer={{ display: '04:15' }}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="idle-concept-card__controls">
                      <div className="idle-concept-control">
                        <label className="idle-concept-control__label">Left widget</label>
                        <AppleDropdown
                          value={idlePrefs.leftWidget || 'weather'}
                          options={IDLE_WIDGET_OPTIONS}
                          onChange={(val) => handleUpdateIdlePrefs({ leftWidget: val })}
                        />
                      </div>

                      <div className="idle-concept-control">
                        <label className="idle-concept-control__label">Right widget</label>
                        <AppleDropdown
                          value={idlePrefs.rightWidget || 'date'}
                          options={IDLE_WIDGET_OPTIONS}
                          onChange={(val) => handleUpdateIdlePrefs({ rightWidget: val })}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="settings-list-group" style={{ marginTop: 14 }}>
                    <div className="settings-item-row">
                      <div className="settings-item-row__text">
                        <span className="settings-item-row__label">Companion Eyes</span>
                        <span className="settings-item-row__sub">Show centered living companion eyes in idle state.</span>
                      </div>
                      <button
                        type="button"
                        className={`settings-toggle${idlePrefs.showEyes !== false ? ' is-on' : ''}`}
                        onClick={() => handleUpdateIdlePrefs({ showEyes: idlePrefs.showEyes === false ? true : false })}
                        role="switch"
                        aria-checked={idlePrefs.showEyes !== false}
                        aria-label="Toggle Companion Eyes"
                      >
                        <span className="settings-toggle__thumb" />
                      </button>
                    </div>

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
