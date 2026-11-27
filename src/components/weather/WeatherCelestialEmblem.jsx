import React from 'react';

/**
 * WeatherCelestialEmblem: Apple SF Symbols Inspired Weather Emblem.
 * 
 * Single Celestial & Environmental Owner Contract:
 * - When Living Atmosphere WebGL is active (`atmosphereActive === true`),
 *   the WebGL atmosphere exclusively owns and renders the sun, real moon,
 *   stars, cloud deck, rain, snow, lightning, and fog. The emblem is suppressed
 *   to ensure single celestial ownership.
 * - When WebGL is unavailable or failed (`atmosphereActive === false`),
 *   this component provides the authentic Apple SF Symbol SVG fallbacks:
 *   - Sunny: Apple SF Symbol `sun.max.fill` 3D orb.
 *   - Night: Real Moon SVG with exact astronomical phase and illumination.
 *   - Rainy: Nimbus cloud with illuminated angled droplets.
 *   - Cloudy: Layered soft cloud glyph with rim illumination.
 */
export default function WeatherCelestialEmblem({
  code = 0,
  isDay = true,
  lunar = null,
  size = 74,
  atmosphereActive = false,
  className = '',
}) {
  const c = Number(code) || 0;

  // Solitary Living Atmosphere Ownership: When WebGL atmosphere is actively rendering,
  // suppress static emblem completely (for clear daylight sun, night moon, and severe weather).
  if (atmosphereActive && isDay && (c === 0 || c === 1)) {
    return null;
  }
  if (atmosphereActive) {
    return null;
  }

  // Fallback Night condition: Real Moon with exact astronomical phase and illumination
  if (!isDay || (c === 0 && !isDay)) {
    const fraction = typeof lunar?.fractionIlluminated === 'number' ? lunar.fractionIlluminated : 0.98;
    const waxing = Boolean(lunar?.waxing ?? false);
    const phaseName = lunar?.phaseName || 'Moon';
    const percent = Math.round(fraction * 100);

    const cx = 50;
    const cy = 50;
    const r = 26;
    const isFull = fraction >= 0.97;
    const isNew = fraction <= 0.03;
    const rx = Math.abs(r * (2 * fraction - 1));
    const sweepOuter = waxing ? 1 : 0;
    const sweepInner = fraction > 0.5 ? (waxing ? 1 : 0) : (waxing ? 0 : 1);
    const litPath = `M ${cx} ${cy - r} A ${r} ${r} 0 0 ${sweepOuter} ${cx} ${cy + r} A ${rx.toFixed(2)} ${r} 0 0 ${sweepInner} ${cx} ${cy - r} Z`;

    return (
      <div
        className={`weather-celestial-emblem weather-celestial-emblem--night ${className}`.trim()}
        title={`${phaseName} (${percent}% illuminated)`}
      >
        <svg
          width={size}
          height={size}
          viewBox="0 0 100 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <radialGradient id="night-lunar-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#818cf8" stopOpacity={0.25 + fraction * 0.15} />
              <stop offset="65%" stopColor="#4f46e5" stopOpacity={0.06} />
              <stop offset="100%" stopColor="#4f46e5" stopOpacity={0} />
            </radialGradient>
            <linearGradient id="moon-surface-grad" x1="20%" y1="20%" x2="80%" y2="80%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="50%" stopColor="#e2e8f0" />
              <stop offset="100%" stopColor="#cbd5e1" />
            </linearGradient>
            <radialGradient id="moon-dark-surface" cx="40%" cy="40%" r="60%">
              <stop offset="0%" stopColor="#1e293b" stopOpacity={0.85} />
              <stop offset="100%" stopColor="#0f172a" stopOpacity={0.95} />
            </radialGradient>
          </defs>

          {/* Ambient lunar glow */}
          <circle cx="50" cy="50" r="44" fill="url(#night-lunar-glow)" />

          {/* Micro constellation stars */}
          <circle cx="82" cy="24" r="1.5" fill="#ffffff" opacity="0.8" />
          <circle cx="20" cy="30" r="1.2" fill="#ffffff" opacity="0.6" />
          <circle cx="78" cy="76" r="1.4" fill="#ffffff" opacity="0.75" />
          <circle cx="24" cy="72" r="1.0" fill="#ffffff" opacity="0.5" />

          {/* Base Dark Moon Sphere (Earthshine Disc) */}
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="url(#moon-dark-surface)"
            stroke="rgba(148, 163, 184, 0.22)"
            strokeWidth="0.8"
          />

          {/* Maria Crater Accents on unlit surface */}
          <circle cx="44" cy="45" r="4" fill="rgba(0, 0, 0, 0.25)" />
          <circle cx="53" cy="58" r="5" fill="rgba(0, 0, 0, 0.20)" />

          {/* Illuminated Phase Geometry */}
          {isFull ? (
            <circle cx={cx} cy={cy} r={r} fill="url(#moon-surface-grad)" />
          ) : isNew ? null : (
            <path d={litPath} fill="url(#moon-surface-grad)" />
          )}

          {/* Subtle 3D Rim Sheen */}
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="rgba(255, 255, 255, 0.35)"
            strokeWidth="0.75"
          />
        </svg>
      </div>
    );
  }

  // Fallback Rainy condition
  if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82) || c >= 95) {
    return (
      <div className={`weather-celestial-emblem weather-celestial-emblem--rainy ${className}`.trim()}>
        <svg
          width={size}
          height={size}
          viewBox="0 0 100 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <radialGradient id="rain-cloud-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
            </radialGradient>
            <linearGradient id="rain-cloud-body" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#f1f5f9" />
              <stop offset="100%" stopColor="#94a3b8" />
            </linearGradient>
          </defs>

          <circle cx="50" cy="45" r="42" fill="url(#rain-cloud-glow)" />

          <path
            d="M32 58H68C74.6 58 80 52.6 80 46C80 39.8 75.3 34.6 69.3 34.1C68.1 24.9 60.2 18 50.8 18C42.8 18 35.9 23.3 33.7 30.6C32.8 30.2 31.8 30 30.8 30C24.3 30 19 35.3 19 41.8C19 48.3 24.3 53.6 30.8 53.6H32V58Z"
            fill="url(#rain-cloud-body)"
          />

          <line x1="34" y1="64" x2="31" y2="76" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="48" y1="64" x2="45" y2="76" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="62" y1="64" x2="59" y2="76" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      </div>
    );
  }

  // Fallback Cloudy condition
  if (c === 2 || c === 3 || c === 45 || c === 48) {
    return (
      <div className={`weather-celestial-emblem weather-celestial-emblem--cloudy ${className}`.trim()}>
        <svg
          width={size}
          height={size}
          viewBox="0 0 100 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <radialGradient id="cloud-ambient-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#cbd5e1" stopOpacity={0.22} />
              <stop offset="100%" stopColor="#64748b" stopOpacity={0} />
            </radialGradient>
            <linearGradient id="cloud-body-grad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="#cbd5e1" />
            </linearGradient>
          </defs>

          <circle cx="50" cy="50" r="44" fill="url(#cloud-ambient-glow)" />

          <path
            d="M30 66H70C76.6 66 82 60.6 82 54C82 47.8 77.3 42.6 71.3 42.1C70.1 32.9 62.2 26 52.8 26C44.8 26 37.9 31.3 35.7 38.6C34.8 38.2 33.8 38 32.8 38C26.3 38 21 43.3 21 49.8C21 56.3 26.3 61.6 32.8 61.6H30V66Z"
            fill="url(#cloud-body-grad)"
          />
        </svg>
      </div>
    );
  }

  // Fallback Sunny / Clear Day (Volumetric Radiant Sun Orb)
  return (
    <div className={`weather-celestial-emblem weather-celestial-emblem--sunny ${className}`.trim()}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <radialGradient id="apple-sun-corona" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fef08a" stopOpacity={0.45} />
            <stop offset="50%" stopColor="#f59e0b" stopOpacity={0.15} />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
          </radialGradient>
          <radialGradient id="apple-sun-core" cx="36%" cy="32%" r="68%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="32%" stopColor="#fef08a" />
            <stop offset="72%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#d97706" />
          </radialGradient>
        </defs>

        {/* Soft atmospheric solar halo */}
        <circle cx="50" cy="50" r="46" fill="url(#apple-sun-corona)" />

        {/* 3D Volumetric Sun Sphere */}
        <circle cx="50" cy="50" r="24" fill="url(#apple-sun-core)" />

        {/* Specular sheen highlight */}
        <ellipse cx="44" cy="40" rx="10" ry="6" fill="rgba(255, 255, 255, 0.40)" transform="rotate(-25 44 40)" />
      </svg>
    </div>
  );
}
