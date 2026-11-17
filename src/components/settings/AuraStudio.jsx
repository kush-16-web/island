import React, { useState, useEffect } from 'react';
import AmbientLiquidMetaballs from '../AmbientLiquidMetaballs';
import { Icon } from '../icons';

const AURA_EFFECTS = [
  {
    id: 'dynamic',
    name: 'Liquid Metaballs',
    desc: 'Viscous organic lava droplets that merge and stretch to audio beats.',
    tag: 'Lava Lamp',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
      </svg>
    ),
  },
  {
    id: 'shards',
    name: 'Aero Shards',
    desc: 'Floating 3D chiseled chrome ribbons fluttering in acoustic wind.',
    tag: 'Prismatic',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 2 7 12 12 22 7 12 2" />
        <polyline points="2 17 12 22 22 17" />
        <polyline points="2 12 12 17 22 12" />
      </svg>
    ),
  },
  {
    id: 'classic',
    name: 'Classic Aura',
    desc: 'Island signature authentic album art ambient frosted glass glow.',
    tag: 'OG Default',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="4" />
        <line x1="12" y1="2" x2="12" y2="4" />
        <line x1="12" y1="20" x2="12" y2="22" />
        <line x1="20" y1="12" x2="22" y2="12" />
        <line x1="2" y1="12" x2="4" y2="12" />
      </svg>
    ),
  },
  {
    id: 'galaxy',
    name: 'Galaxy',
    desc: 'Cosmic spiral vortex of starlight particles that breathe with bass.',
    tag: 'Cosmic',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
  {
    id: 'ghost-fibers',
    name: 'Ghost Fibers',
    desc: 'Luminescent waving fiber lines undulating rhythmically.',
    tag: 'Fluid Lines',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 12c4-4 8 4 12 0s6-4 8-2" />
        <path d="M2 7c4-4 8 4 12 0s6-4 8-2" />
        <path d="M2 17c4-4 8 4 12 0s6-4 8-2" />
      </svg>
    ),
  },
  {
    id: 'gradient-waves',
    name: 'Gradient Waves',
    desc: 'Multi-layered chromatic satin mesh with fluid sweeping hills.',
    tag: 'Topography',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 20c4-6 8-2 12-6s6-2 8-6" />
        <path d="M2 15c4-4 8 2 12-2s6-4 8-2" />
      </svg>
    ),
  },
  {
    id: 'light-rays',
    name: 'Light Rays',
    desc: 'Volumetric atmospheric light beams with drifting ember specks.',
    tag: 'Atmosphere',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="5" />
        <line x1="12" y1="1" x2="12" y2="3" />
        <line x1="12" y1="21" x2="12" y2="23" />
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
        <line x1="1" y1="12" x2="3" y2="12" />
        <line x1="21" y1="12" x2="23" y2="12" />
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
      </svg>
    ),
  },
];

export default function AuraStudio({ accentColor = '#38bdf8' }) {
  const [selectedEffect, setSelectedEffect] = useState(() => {
    try {
      const saved = localStorage.getItem('island_metaballs_mode');
      if (saved === 'aurora') return 'classic';
      return saved || 'dynamic';
    } catch {
      return 'dynamic';
    }
  });

  const [blurPct, setBlurPct] = useState(() => {
    try {
      const saved = localStorage.getItem('island_aura_blur');
      return saved !== null ? Number(saved) : 25;
    } catch {
      return 25;
    }
  });

  const [isReactive, setIsReactive] = useState(() => {
    try {
      return localStorage.getItem('island_aura_reactive') !== 'false';
    } catch {
      return true;
    }
  });

  const [liveMedia, setLiveMedia] = useState(null);

  // Sync with live media and aura settings
  useEffect(() => {
    if (window.island?.getAuraSettings) {
      window.island.getAuraSettings().then((s) => {
        if (!s) return;
        if (s.mode) setSelectedEffect(s.mode);
        if (typeof s.blur === 'number') setBlurPct(s.blur);
        if (typeof s.reactive === 'boolean') setIsReactive(s.reactive);
      }).catch(() => {});
    }

    if (window.island?.getState) {
      window.island.getState().then((s) => {
        if (s?.media?.active) setLiveMedia(s.media);
      }).catch(() => {});
    }

    if (window.island?.on) {
      const unsub = window.island.on('media', (m) => {
        setLiveMedia(m?.active ? m : null);
      });
      return () => unsub?.();
    }
    return undefined;
  }, []);

  const handleSelectEffect = (id) => {
    setSelectedEffect(id);
    try {
      localStorage.setItem('island_metaballs_mode', id);
      window.dispatchEvent(new CustomEvent('island:metaballs-mode-changed', { detail: id }));
      window.dispatchEvent(new CustomEvent('island:aura-settings-changed', { detail: { mode: id } }));
      if (window.island?.setAuraSettings) {
        window.island.setAuraSettings({ mode: id, blur: blurPct, reactive: isReactive });
      }
    } catch {}
  };

  const handleBlurChange = (val) => {
    const num = Number(val);
    setBlurPct(num);
    try {
      localStorage.setItem('island_aura_blur', String(num));
      window.dispatchEvent(new CustomEvent('island:aura-settings-changed', { detail: { blur: num } }));
      if (window.island?.setAuraSettings) {
        window.island.setAuraSettings({ mode: selectedEffect, blur: num, reactive: isReactive });
      }
    } catch {}
  };

  const handleToggleReactive = () => {
    const next = !isReactive;
    setIsReactive(next);
    try {
      localStorage.setItem('island_aura_reactive', String(next));
      window.dispatchEvent(new CustomEvent('island:aura-settings-changed', { detail: { reactive: next } }));
      if (window.island?.setAuraSettings) {
        window.island.setAuraSettings({ mode: selectedEffect, blur: blurPct, reactive: next });
      }
    } catch {}
  };

  const effectiveBlurPx = (blurPct / 100) * 10;
  const currentAccent = liveMedia?.accentColor || accentColor || '#a855f7';
  const isPlaying = Boolean(liveMedia?.active && liveMedia?.title);

  return (
    <div className="aura-studio">
      {/* 1. Header */}
      <div className="aura-studio__header">
        <div className="aura-studio__title-row">
          <div className="aura-studio__icon-box">
            <Icon.Sparkles width={15} height={15} />
          </div>
          <div>
            <h2 className="aura-studio__title">Aura Studio</h2>
            <p className="aura-studio__desc">
              Custom background visualizers, shaders, and live audio-reactive atmospheres.
            </p>
          </div>
        </div>
      </div>

      {/* 2. CINEMATIC LIVE VISUALIZER VIEWPORT (NO FAKE SCRUBBERS / TIMESTAMPS) */}
      <div className="aura-stage-viewport">
        {/* Real Live Visualizer Canvas */}
        <div className="aura-stage-viewport__canvas" aria-hidden="true">
          {liveMedia?.art && selectedEffect === 'classic' ? (
            <div className="aura-stage-viewport__classic-art">
              <img src={liveMedia.art} alt="" />
              <div className="aura-stage-viewport__classic-overlay" />
            </div>
          ) : (
            <AmbientLiquidMetaballs
              mode={selectedEffect}
              accentColor={currentAccent}
              isPlaying={true}
              blurPx={effectiveBlurPx}
              reactive={isReactive}
              isLoopbackDisabled={true}
            />
          )}
        </div>

        {/* Quiet Surface Scrim & Subtle Real-Time Indicator */}
        <div className="aura-stage-viewport__overlay">
          <div className="aura-stage-viewport__track-tag">
            {liveMedia?.art ? (
              <img src={liveMedia.art} alt="" className="aura-stage-viewport__track-thumb" />
            ) : (
              <div className="aura-stage-viewport__track-thumb aura-stage-viewport__track-thumb--empty">
                <Icon.Music width={12} height={12} />
              </div>
            )}
            <div className="aura-stage-viewport__track-text">
              <span className="aura-stage-viewport__track-title">
                {isPlaying ? liveMedia.title : 'Live Shader Viewport'}
              </span>
              <span className="aura-stage-viewport__track-sub">
                {isPlaying ? (liveMedia.artist || 'Now Playing') : 'Simulated Audio Dynamics'}
              </span>
            </div>
          </div>

          <div className="aura-stage-viewport__mode-tag">
            <span>{AURA_EFFECTS.find((e) => e.id === selectedEffect)?.name || 'Custom'}</span>
          </div>
        </div>
      </div>

      {/* 3. VISUAL TUNING SHELF */}
      <div className="aura-tuning-shelf">
        {/* Frosted Glass Blur */}
        <div className="aura-tuning-card">
          <div className="aura-tuning-card__header">
            <span className="aura-tuning-card__label">Frosted Blur Dispersion</span>
            <span className="aura-tuning-card__val">{blurPct}%</span>
          </div>

          <div className="aura-tuning-card__body">
            <input
              type="range"
              min="0"
              max="100"
              value={blurPct}
              onChange={(e) => handleBlurChange(e.target.value)}
              className="aura-range-input"
            />
            <div className="aura-preset-pills">
              {[
                { label: 'Crisp', val: 0 },
                { label: 'Soft', val: 25 },
                { label: 'Medium', val: 50 },
                { label: 'Heavy', val: 85 },
              ].map((p) => (
                <button
                  key={p.val}
                  type="button"
                  className={`aura-preset-chip${blurPct === p.val ? ' is-active' : ''}`}
                  onClick={() => handleBlurChange(p.val)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Audio Reactivity Toggle */}
        <div className="aura-tuning-card aura-tuning-card--toggle">
          <div className="aura-tuning-card__header">
            <div>
              <span className="aura-tuning-card__label">Audio Reactivity</span>
              <span className="aura-tuning-card__sub">
                Pulsate speed, particle scale, and luminescence to beats.
              </span>
            </div>

            <button
              type="button"
              className={`aura-switch${isReactive ? ' is-on' : ''}`}
              onClick={handleToggleReactive}
              aria-label="Toggle beat reactivity"
            >
              <span className="aura-switch__thumb" />
            </button>
          </div>
        </div>
      </div>

      {/* 4. REFINED VISUALIZER GALLERY */}
      <div className="aura-gallery-section">
        <span className="aura-gallery-section__title">Atmosphere Styles</span>

        <div className="aura-gallery-grid">
          {AURA_EFFECTS.map((eff) => {
            const isActive = selectedEffect === eff.id;
            return (
              <button
                key={eff.id}
                type="button"
                className={`aura-card${isActive ? ' is-active' : ''}`}
                onClick={() => handleSelectEffect(eff.id)}
              >
                <div className="aura-card__header">
                  <div className="aura-card__icon-wrap">
                    {eff.icon}
                  </div>
                  <span className="aura-card__tag">{eff.tag}</span>
                </div>

                <div className="aura-card__content">
                  <span className="aura-card__name">{eff.name}</span>
                  <span className="aura-card__desc">{eff.desc}</span>
                </div>

                {isActive && (
                  <span className="aura-card__check" aria-hidden="true">
                    <Icon.Check width={11} height={11} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
