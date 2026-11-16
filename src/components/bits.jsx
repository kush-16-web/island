import React, { useEffect, useRef, useState } from 'react';
import { hueFrom } from '../lib/format';
import { Icon } from './icons';
import { getLoopbackAnalyser } from './AmbientLiquidMetaballs';

const KIND_COLOR = {
  info: 'var(--c-info)',
  success: 'var(--c-ok)',
  warning: 'var(--c-warn)',
  error: 'var(--c-err)',
};

export const kindColor = (kind) => KIND_COLOR[kind] || KIND_COLOR.info;

export function Equalizer({ color = 'currentColor', playing = true }) {
  const [bars, setBars] = useState([0.2, 0.2, 0.2, 0.2]);
  const [isLive, setIsLive] = useState(false);
  const rafRef = useRef(null);
  const barsRef = useRef([0.2, 0.2, 0.2, 0.2]);

  useEffect(() => {
    if (!playing) {
      setBars([0.2, 0.2, 0.2, 0.2]);
      barsRef.current = [0.2, 0.2, 0.2, 0.2];
      setIsLive(false);
      return;
    }

    let active = true;
    const freqData = new Uint8Array(256);

    getLoopbackAnalyser().then((analyser) => {
      if (!active || !analyser) return;
      setIsLive(true);

      const tick = () => {
        if (!active) return;
        analyser.getByteFrequencyData(freqData);

        // Bar 1: Sub-Bass / Kicks (Bins 1-3, ~47-140Hz)
        let b1 = 0;
        for (let i = 1; i <= 3; i++) b1 += freqData[i];
        const raw1 = (b1 / (3 * 255)) * 1.5;

        // Bar 2: Low-Mids / Bassline (Bins 4-8, ~180-380Hz)
        let b2 = 0;
        for (let i = 4; i <= 8; i++) b2 += freqData[i];
        const raw2 = (b2 / (5 * 255)) * 1.4;

        // Bar 3: High-Mids / Vocals (Bins 9-28, ~400-1300Hz)
        let b3 = 0;
        for (let i = 9; i <= 28; i++) b3 += freqData[i];
        const raw3 = (b3 / (20 * 255)) * 1.4;

        // Bar 4: Treble / Cymbals / Hi-Hats (Bins 29-70, ~1400-3300Hz)
        let b4 = 0;
        for (let i = 29; i <= 70; i++) b4 += freqData[i];
        const raw4 = (b4 / (42 * 255)) * 1.6;

        const totalEnergy = b1 + b2 + b3 + b4;
        const current = barsRef.current;

        if (totalEnergy > 0) {
          // Responsive attack (0.35) and smooth organic release
          const target1 = Math.max(0.18, Math.min(1.0, raw1));
          const target2 = Math.max(0.18, Math.min(1.0, raw2));
          const target3 = Math.max(0.18, Math.min(1.0, raw3));
          const target4 = Math.max(0.18, Math.min(1.0, raw4));

          current[0] += (target1 - current[0]) * 0.35;
          current[1] += (target2 - current[1]) * 0.35;
          current[2] += (target3 - current[2]) * 0.35;
          current[3] += (target4 - current[3]) * 0.35;
        } else {
          // Audio silence or paused track: smoothly glide down to rest level 0.2
          current[0] += (0.2 - current[0]) * 0.22;
          current[1] += (0.2 - current[1]) * 0.22;
          current[2] += (0.2 - current[2]) * 0.22;
          current[3] += (0.2 - current[3]) * 0.22;
        }

        setBars([current[0], current[1], current[2], current[3]]);
        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);
    }).catch(() => {});

    return () => {
      active = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [playing]);

  return (
    <span
      className={`eq${playing ? ' is-playing' : ' is-paused'}${isLive && playing ? ' is-live' : ''}`}
      style={{ color }}
      aria-hidden="true"
    >
      <i style={isLive && playing ? { transform: `scaleY(${bars[0]})` } : undefined} />
      <i style={isLive && playing ? { transform: `scaleY(${bars[1]})` } : undefined} />
      <i style={isLive && playing ? { transform: `scaleY(${bars[2]})` } : undefined} />
      <i style={isLive && playing ? { transform: `scaleY(${bars[3]})` } : undefined} />
    </span>
  );
}

// fraction = share of the ring that is still filled (1 -> full, 0 -> empty).
export function Ring({ fraction = 1, size = 22, stroke = 2.6, color = 'currentColor' }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const f = Math.min(1, Math.max(0, fraction));
  return (
    <svg className="ring-svg" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - f)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 1s linear' }}
      />
    </svg>
  );
}

export function Art({ src, seed = '', size = 26, radius = 8 }) {
  const style = { width: size, height: size, borderRadius: radius };
  if (src) return <img className="art" style={style} src={src} alt="" draggable={false} />;
  const hue = hueFrom(seed);
  return (
    <span
      className="art art--fallback"
      style={{
        ...style,
        background: `linear-gradient(135deg, hsl(${hue} 78% 64%), hsl(${(hue + 48) % 360} 70% 40%))`,
      }}
    >
      <Icon.Music width={Math.round(size * 0.5)} height={Math.round(size * 0.5)} />
    </span>
  );
}

export function Avatar({ app = '', kind = 'info', size = 40 }) {
  const hue = hueFrom(app || 'x');
  const letter = (app.trim()[0] || '•').toUpperCase();
  return (
    <span
      className="avatar"
      style={{
        width: size,
        height: size,
        '--ring': kindColor(kind),
        background: `hsl(${hue} 38% 20%)`,
        color: `hsl(${hue} 85% 78%)`,
      }}
    >
      {letter}
    </span>
  );
}

export function Switch({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`switch${checked ? ' is-on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}

export function Empty({ icon: Glyph, title, hint, action, children }) {
  return (
    <div className="empty">
      {Glyph && (
        <span className="empty__icon">
          {typeof Glyph === 'function' ? (
            <Glyph width={20} height={20} />
          ) : typeof Glyph === 'string' ? (
            <span style={{ fontSize: '18px', lineHeight: 1 }}>{Glyph}</span>
          ) : (
            Glyph
          )}
        </span>
      )}
      <div className="empty__title">{title}</div>
      {hint && <div className="empty__hint">{hint}</div>}
      {action && <div className="empty__action">{action}</div>}
      {children}
    </div>
  );
}
