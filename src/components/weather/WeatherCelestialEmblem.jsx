import React from 'react';

/**
 * WeatherCelestialEmblem: Apple SF Symbols Inspired Weather Emblem.
 * 
 * - Sunny (Day): Authentic Apple SF Symbol `sun.max.fill` with radiant central disc
 *   and 8 symmetrical tapered rays with soft solar halo (no cartoon planetary orbit dots).
 * - Night: Elegant crescent moon with soft lunar glow.
 * - Rainy: Nimbus cloud with illuminated angled droplets.
 * - Cloudy: Layered soft cloud glyph with rim illumination.
 */
export default function WeatherCelestialEmblem({
  code = 0,
  isDay = true,
  size = 74,
  className = '',
}) {
  const c = Number(code) || 0;

  // Night condition: crescent moon with soft glow
  if (!isDay || (c === 0 && !isDay)) {
    return (
      <div className={`weather-celestial-emblem weather-celestial-emblem--night ${className}`.trim()}>
        <svg
          width={size}
          height={size}
          viewBox="0 0 100 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <radialGradient id="night-lunar-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#818cf8" stopOpacity="0.32" />
              <stop offset="65%" stopColor="#4f46e5" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#4f46e5" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="moon-surface-grad" x1="20%" y1="20%" x2="80%" y2="80%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="#cbd5e1" />
            </linearGradient>
          </defs>

          {/* Ambient lunar glow */}
          <circle cx="50" cy="50" r="44" fill="url(#night-lunar-glow)" />

          {/* Micro constellation stars */}
          <circle cx="82" cy="28" r="1.5" fill="#ffffff" opacity="0.8" />
          <circle cx="24" cy="32" r="1.2" fill="#ffffff" opacity="0.6" />
          <circle cx="76" cy="74" r="1.3" fill="#ffffff" opacity="0.7" />

          {/* Elegant crescent moon */}
          <path
            d="M58 22C43.5 22 32 33.5 32 48C32 62.5 43.5 74 58 74C64.8 74 71 71.3 75.6 67C60.2 65.5 50 54 50 40C50 32.2 53.6 25.4 58 22Z"
            fill="url(#moon-surface-grad)"
          />
        </svg>
      </div>
    );
  }

  // Rainy condition
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
              <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#2563eb" stopOpacity="0" />
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

  // Cloudy condition
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
              <stop offset="0%" stopColor="#cbd5e1" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#64748b" stopOpacity="0" />
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

  // Default: Sunny / Clear Day (Apple SF Symbol sun.max.fill with 8 tapered rays)
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
            <stop offset="0%" stopColor="#fde047" stopOpacity="0.35" />
            <stop offset="60%" stopColor="#f59e0b" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="apple-sun-ray" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ffedd5" />
            <stop offset="100%" stopColor="#f59e0b" />
          </linearGradient>
          <radialGradient id="apple-sun-core" cx="38%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="35%" stopColor="#fde047" />
            <stop offset="100%" stopColor="#f59e0b" />
          </radialGradient>
        </defs>

        {/* Ambient atmospheric solar halo */}
        <circle cx="50" cy="50" r="46" fill="url(#apple-sun-corona)" />

        {/* Apple SF Symbol 8 Symmetrical Tapered Sun Rays */}
        {/* 0 deg (Top) */}
        <line x1="50" y1="14" x2="50" y2="25" stroke="url(#apple-sun-ray)" strokeWidth="3.2" strokeLinecap="round" />
        {/* 180 deg (Bottom) */}
        <line x1="50" y1="75" x2="50" y2="86" stroke="url(#apple-sun-ray)" strokeWidth="3.2" strokeLinecap="round" />
        {/* 90 deg (Right) */}
        <line x1="75" y1="50" x2="86" y2="50" stroke="url(#apple-sun-ray)" strokeWidth="3.2" strokeLinecap="round" />
        {/* 270 deg (Left) */}
        <line x1="14" y1="50" x2="25" y2="50" stroke="url(#apple-sun-ray)" strokeWidth="3.2" strokeLinecap="round" />
        {/* 45 deg (Top-Right) */}
        <line x1="68" y1="32" x2="76" y2="24" stroke="url(#apple-sun-ray)" strokeWidth="3.2" strokeLinecap="round" />
        {/* 225 deg (Bottom-Left) */}
        <line x1="24" y1="76" x2="32" y2="68" stroke="url(#apple-sun-ray)" strokeWidth="3.2" strokeLinecap="round" />
        {/* 135 deg (Bottom-Right) */}
        <line x1="68" y1="68" x2="76" y2="76" stroke="url(#apple-sun-ray)" strokeWidth="3.2" strokeLinecap="round" />
        {/* 315 deg (Top-Left) */}
        <line x1="24" y1="24" x2="32" y2="32" stroke="url(#apple-sun-ray)" strokeWidth="3.2" strokeLinecap="round" />

        {/* Luminous central sun sphere */}
        <circle cx="50" cy="50" r="18" fill="url(#apple-sun-core)" />
      </svg>
    </div>
  );
}
