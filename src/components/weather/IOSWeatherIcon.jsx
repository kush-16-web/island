import React from 'react';

/**
 * Apple SF Symbols Weather Iconography (Dynamic Island Duotone Style).
 * Clean, geometric, razor-sharp vector glyphs matching Apple's official SF Symbols:
 * - sun.max.fill
 * - moon.stars.fill
 * - cloud.sun.fill
 * - cloud.moon.fill
 * - cloud.fill
 * - cloud.rain.fill
 * - cloud.bolt.fill
 * - snowflake
 * - cloud.fog.fill
 */
export function IOSWeatherIcon({
  code = 0,
  isDay = true,
  size = 24,
  animated = false,
  className = '',
  ...props
}) {
  const c = Number(code) || 0;
  const animClass = animated ? 'ios-sf-icon--animated' : '';
  const rootClass = `ios-sf-icon ${animClass} ${className}`.trim();

  // WMO Condition Mapping:
  // 0: Clear
  if (c === 0) {
    return isDay ? (
      <SFSunIcon size={size} className={rootClass} {...props} />
    ) : (
      <SFMoonIcon size={size} className={rootClass} {...props} />
    );
  }

  // 1, 2: Mainly Clear / Partly Cloudy
  if (c === 1 || c === 2) {
    return isDay ? (
      <SFCloudSunIcon size={size} className={rootClass} {...props} />
    ) : (
      <SFCloudMoonIcon size={size} className={rootClass} {...props} />
    );
  }

  // 3: Overcast / Cloudy
  if (c === 3) {
    return <SFCloudIcon size={size} className={rootClass} {...props} />;
  }

  // 45, 48: Fog / Mist / Haze
  if (c === 45 || c === 48) {
    return <SFFogIcon size={size} className={rootClass} {...props} />;
  }

  // 51, 53, 55: Drizzle
  if (c >= 51 && c <= 55) {
    return <SFDrizzleIcon size={size} className={rootClass} {...props} />;
  }

  // 61, 63, 65, 80, 81, 82: Rain / Showers
  if ((c >= 61 && c <= 65) || (c >= 80 && c <= 82)) {
    return isDay && c <= 63 ? (
      <SFCloudSunRainIcon size={size} className={rootClass} {...props} />
    ) : (
      <SFRainIcon size={size} className={rootClass} {...props} />
    );
  }

  // 71, 73, 75, 77, 85, 86: Snow
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) {
    return <SFSnowIcon size={size} className={rootClass} {...props} />;
  }

  // 95, 96, 99: Thunderstorm
  if (c >= 95) {
    return <SFThunderstormIcon size={size} className={rootClass} {...props} />;
  }

  return isDay ? (
    <SFCloudSunIcon size={size} className={rootClass} {...props} />
  ) : (
    <SFCloudMoonIcon size={size} className={rootClass} {...props} />
  );
}

// ============================================================================
// 1. SUN (Apple / Windows 11 Volumetric Glowing 3D Orb)
// ============================================================================
export function SFSunIcon({ size = 24, className = '', ...props }) {
  const gradId = `sf-sun-grad-${size}`;
  const auraId = `sf-sun-aura-${size}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Sunny"
      {...props}
    >
      <defs>
        <radialGradient id={gradId} cx="36%" cy="32%" r="68%">
          <stop offset="0%" stopColor="#FFF275" />
          <stop offset="30%" stopColor="#FFAE19" />
          <stop offset="70%" stopColor="#F97316" />
          <stop offset="100%" stopColor="#EA580C" />
        </radialGradient>
        <radialGradient id={auraId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(249, 115, 22, 0.45)" />
          <stop offset="65%" stopColor="rgba(249, 115, 22, 0.15)" />
          <stop offset="100%" stopColor="rgba(249, 115, 22, 0)" />
        </radialGradient>
      </defs>
      {/* Soft atmospheric ambient glow */}
      <circle cx="24" cy="24" r="21" fill={`url(#${auraId})`} />
      {/* 3D Volumetric Sun Sphere */}
      <circle cx="24" cy="24" r="14" fill={`url(#${gradId})`} />
      {/* Subtle organic light sheen */}
      <ellipse cx="20" cy="18" rx="6" ry="4" fill="rgba(255, 255, 255, 0.28)" transform="rotate(-20 20 18)" />
      {/* Radiant Apple Ray Accents */}
      <g stroke="#FFAE19" strokeWidth="2.2" strokeLinecap="round" opacity="0.8">
        <line x1="24" y1="3.5" x2="24" y2="6.5" />
        <line x1="24" y1="41.5" x2="24" y2="44.5" />
        <line x1="3.5" y1="24" x2="6.5" y2="24" />
        <line x1="41.5" y1="24" x2="44.5" y2="24" />
        <line x1="9.5" y1="9.5" x2="11.8" y2="11.8" />
        <line x1="36.2" y1="36.2" x2="38.5" y2="38.5" />
        <line x1="9.5" y1="38.5" x2="11.8" y2="36.2" />
        <line x1="36.2" y1="11.8" x2="38.5" y2="9.5" />
      </g>
    </svg>
  );
}

// ============================================================================
// 2. MOON (SF Symbol: moon.stars.fill)
// ============================================================================
export function SFMoonIcon({ size = 24, className = '', ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Clear Night"
      {...props}
    >
      <path
        d="M33 26.5C31.5 27.2 29.8 27.6 28 27.6C19.7 27.6 13 20.9 13 12.6C13 10.7 13.4 8.9 14.1 7.3C8.8 9.5 5 14.8 5 21C5 29.8 12.2 37 21 37C27.2 37 32.5 33.2 34.7 27.9C34.1 27.4 33.6 27 33 26.5Z"
        fill="#E0E7FF"
      />
      {/* 4-point sparkle stars */}
      <path d="M37 10L37.8 12.5L40.3 13.3L37.8 14.1L37 16.6L36.2 14.1L33.7 13.3L36.2 12.5L37 10Z" fill="#FDE68A" />
      <path d="M39 23L39.5 24.3L40.8 24.8L39.5 25.3L39 26.6L38.5 25.3L37.2 24.8L38.5 24.3L39 23Z" fill="#FFFFFF" opacity="0.8" />
    </svg>
  );
}

// ============================================================================
// 3. CLOUD SUN (SF Symbol: cloud.sun.fill)
// ============================================================================
export function SFCloudSunIcon({ size = 24, className = '', ...props }) {
  const gradId = `sf-cloud-sun-${size}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Partly Cloudy"
      {...props}
    >
      <defs>
        <radialGradient id={gradId} cx="36%" cy="32%" r="68%">
          <stop offset="0%" stopColor="#FFF275" />
          <stop offset="30%" stopColor="#FFAE19" />
          <stop offset="70%" stopColor="#F97316" />
          <stop offset="100%" stopColor="#EA580C" />
        </radialGradient>
      </defs>
      {/* Sun Background */}
      <circle cx="31" cy="17" r="8" fill={`url(#${gradId})`} />
      <g stroke="#FFAE19" strokeWidth="2.2" strokeLinecap="round" opacity="0.85">
        <line x1="31" y1="4.5" x2="31" y2="7.5" />
        <line x1="39.8" y1="8.2" x2="37.6" y2="10.4" />
        <line x1="43.5" y1="17" x2="40.5" y2="17" />
        <line x1="22.2" y1="8.2" x2="24.4" y2="10.4" />
      </g>
      {/* Front Cloud */}
      <path
        d="M16.5 38C12.9 38 10 35.1 10 31.5C10 28.2 12.4 25.4 15.6 25C16.5 20.5 20.4 17 25.2 17C30.7 17 35.3 21.3 35.6 26.8C38.6 27.3 41 29.9 41 33C41 36.3 38.3 39 35 39L16.5 38Z"
        fill="rgba(255, 255, 255, 0.92)"
      />
    </svg>
  );
}

// ============================================================================
// 4. CLOUD MOON (SF Symbol: cloud.moon.fill)
// ============================================================================
export function SFCloudMoonIcon({ size = 24, className = '', ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Partly Cloudy Night"
      {...props}
    >
      {/* Moon Background */}
      <path
        d="M29 18C28 18.4 26.8 18.6 25.5 18.6C20.8 18.6 17 14.8 17 10.1C17 8.9 17.3 7.8 17.7 6.8C14.5 8.1 12.2 11.2 12.2 14.8C12.2 19.9 16.3 24 21.4 24C25 24 28.1 21.9 29.4 18.8C29.2 18.8 29.1 18.8 29 18Z"
        fill="#E0E7FF"
        transform="translate(11, 0)"
      />
      {/* Cloud Foreground */}
      <path
        d="M16.5 38C12.9 38 10 35.1 10 31.5C10 28.2 12.4 25.4 15.6 25C16.5 20.5 20.4 17 25.2 17C30.7 17 35.3 21.3 35.6 26.8C38.6 27.3 41 29.9 41 33C41 36.3 38.3 39 35 39L16.5 38Z"
        fill="rgba(255, 255, 255, 0.88)"
      />
    </svg>
  );
}

// ============================================================================
// 5. CLOUD (SF Symbol: cloud.fill)
// ============================================================================
export function SFCloudIcon({ size = 24, className = '', ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Cloudy"
      {...props}
    >
      <path
        d="M16.5 37C12.9 37 10 34.1 10 30.5C10 27.2 12.4 24.4 15.6 24C16.5 19.5 20.4 16 25.2 16C30.7 16 35.3 20.3 35.6 25.8C38.6 26.3 41 28.9 41 32C41 35.3 38.3 38 35 38L16.5 37Z"
        fill="rgba(255, 255, 255, 0.88)"
      />
    </svg>
  );
}

// ============================================================================
// 6. RAIN (SF Symbol: cloud.rain.fill)
// ============================================================================
export function SFRainIcon({ size = 24, className = '', ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Rain"
      {...props}
    >
      <path
        d="M16.5 33C12.9 33 10 30.1 10 26.5C10 23.2 12.4 20.4 15.6 20C16.5 15.5 20.4 12 25.2 12C30.7 12 35.3 16.3 35.6 21.8C38.6 22.3 41 24.9 41 28C41 31.3 38.3 34 35 34L16.5 33Z"
        fill="rgba(255, 255, 255, 0.85)"
      />
      {/* 3 Razor-Thin Rain Streaks */}
      <g stroke="#38BDF8" strokeWidth="2.4" strokeLinecap="round">
        <line x1="17" y1="36" x2="14" y2="43" />
        <line x1="25" y1="36" x2="22" y2="43" />
        <line x1="33" y1="36" x2="30" y2="43" />
      </g>
    </svg>
  );
}

// ============================================================================
// 7. SUN RAIN (SF Symbol: cloud.sun.rain.fill)
// ============================================================================
export function SFCloudSunRainIcon({ size = 24, className = '', ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Scattered Showers"
      {...props}
    >
      <circle cx="31" cy="15" r="6.5" fill="#FDBA74" />
      <path
        d="M16.5 33C12.9 33 10 30.1 10 26.5C10 23.2 12.4 20.4 15.6 20C16.5 15.5 20.4 12 25.2 12C30.7 12 35.3 16.3 35.6 21.8C38.6 22.3 41 24.9 41 28C41 31.3 38.3 34 35 34L16.5 33Z"
        fill="rgba(255, 255, 255, 0.88)"
      />
      <g stroke="#38BDF8" strokeWidth="2.2" strokeLinecap="round">
        <line x1="18" y1="36" x2="15.5" y2="42" />
        <line x1="26" y1="36" x2="23.5" y2="42" />
      </g>
    </svg>
  );
}

// ============================================================================
// 8. DRIZZLE (SF Symbol: cloud.drizzle.fill)
// ============================================================================
export function SFDrizzleIcon({ size = 24, className = '', ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Drizzle"
      {...props}
    >
      <path
        d="M16.5 33C12.9 33 10 30.1 10 26.5C10 23.2 12.4 20.4 15.6 20C16.5 15.5 20.4 12 25.2 12C30.7 12 35.3 16.3 35.6 21.8C38.6 22.3 41 24.9 41 28C41 31.3 38.3 34 35 34L16.5 33Z"
        fill="rgba(255, 255, 255, 0.85)"
      />
      <circle cx="17" cy="38" r="1.6" fill="#38BDF8" />
      <circle cx="24" cy="40.5" r="1.6" fill="#38BDF8" />
      <circle cx="31" cy="38" r="1.6" fill="#38BDF8" />
    </svg>
  );
}

// ============================================================================
// 9. THUNDERSTORM (SF Symbol: cloud.bolt.fill)
// ============================================================================
export function SFThunderstormIcon({ size = 24, className = '', ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Thunderstorm"
      {...props}
    >
      <path
        d="M16.5 32C12.9 32 10 29.1 10 25.5C10 22.2 12.4 19.4 15.6 19C16.5 14.5 20.4 11 25.2 11C30.7 11 35.3 15.3 35.6 20.8C38.6 21.3 41 23.9 41 27C41 30.3 38.3 33 35 33L16.5 32Z"
        fill="rgba(203, 213, 225, 0.85)"
      />
      <path d="M25 24L18 34H24L22 43L31 31H25L28 24H25Z" fill="#FACC15" />
    </svg>
  );
}

// ============================================================================
// 10. SNOW (SF Symbol: snowflake)
// ============================================================================
export function SFSnowIcon({ size = 24, className = '', ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Snow"
      {...props}
    >
      <path
        d="M16.5 32C12.9 32 10 29.1 10 25.5C10 22.2 12.4 19.4 15.6 19C16.5 14.5 20.4 11 25.2 11C30.7 11 35.3 15.3 35.6 20.8C38.6 21.3 41 23.9 41 27C41 30.3 38.3 33 35 33L16.5 32Z"
        fill="rgba(255, 255, 255, 0.88)"
      />
      <g stroke="#BAE6FD" strokeWidth="1.8" strokeLinecap="round">
        <line x1="16" y1="36" x2="16" y2="42" />
        <line x1="13" y1="39" x2="19" y2="39" />
        <line x1="25" y1="37" x2="25" y2="43" />
        <line x1="22" y1="40" x2="28" y2="40" />
        <line x1="33" y1="36" x2="33" y2="42" />
        <line x1="30" y1="39" x2="36" y2="39" />
      </g>
    </svg>
  );
}

// ============================================================================
// 11. FOG / MIST (SF Symbol: cloud.fog.fill)
// ============================================================================
export function SFFogIcon({ size = 24, className = '', ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Fog"
      {...props}
    >
      <path
        d="M16.5 28C12.9 28 10 25.1 10 21.5C10 18.2 12.4 15.4 15.6 15C16.5 10.5 20.4 7 25.2 7C30.7 7 35.3 11.3 35.6 16.8C38.6 17.3 41 19.9 41 23C41 26.3 38.3 29 35 29L16.5 28Z"
        fill="rgba(255, 255, 255, 0.80)"
      />
      <g stroke="rgba(255, 255, 255, 0.65)" strokeWidth="2.4" strokeLinecap="round">
        <line x1="12" y1="33" x2="36" y2="33" />
        <line x1="8" y1="38" x2="40" y2="38" />
        <line x1="14" y1="43" x2="34" y2="43" />
      </g>
    </svg>
  );
}

export default IOSWeatherIcon;

