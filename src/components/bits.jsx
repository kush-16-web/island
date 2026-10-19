import { hueFrom } from '../lib/format';
import { Icon } from './icons';

const KIND_COLOR = {
  info: 'var(--c-info)',
  success: 'var(--c-ok)',
  warning: 'var(--c-warn)',
  error: 'var(--c-err)',
};

export const kindColor = (kind) => KIND_COLOR[kind] || KIND_COLOR.info;

export function Equalizer({ color = 'currentColor' }) {
  return (
    <span className="eq" style={{ color }} aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
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

export function Empty({ icon: Glyph, title, hint }) {
  return (
    <div className="empty">
      <span className="empty__icon">
        <Glyph width={22} height={22} />
      </span>
      <div className="empty__title">{title}</div>
      <div className="empty__hint">{hint}</div>
    </div>
  );
}
