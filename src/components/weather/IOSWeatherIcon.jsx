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
  const gradId = `sf-moon-grad-${size}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Clear Night"
      {...props}
    >
      <defs>
        <linearGradient id={gradId} x1="2" y1="3" x2="18" y2="21" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFBEB" />
          <stop offset="35%" stopColor="#FDE68A" />
          <stop offset="100%" stopColor="#F59E0B" />
        </linearGradient>
      </defs>
      {/* Centered Apple SF Symbols Moon Crescent */}
      <path
        d="M15.2 13.5C14.3 14.2 13.1 14.6 11.8 14.6C8.2 14.6 5.3 11.7 5.3 8.1C5.3 6.6 5.8 5.2 6.7 4C3.9 5.3 2 8.2 2 11.6C2 16.2 5.8 20 10.4 20C13.8 20 16.7 17.9 18 15C17.1 14.3 16.1 13.8 15.2 13.5Z"
        fill={`url(#${gradId})`}
      />
      {/* 4-point sparkle stars */}
      <path d="M17.5 2.5L18.1 4L19.6 4.6L18.1 5.2L17.5 6.7L16.9 5.2L15.4 4.6L16.9 4L17.5 2.5Z" fill="#FFFFFF" />
      <path d="M20.2 9L20.6 9.8L21.4 10.2L20.6 10.6L20.2 11.4L19.8 10.6L19 10.2L19.8 9.8L20.2 9Z" fill="#FDE68A" opacity="0.9" />
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
  const gradId = `sf-cloud-moon-grad-${size}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Partly Cloudy Night"
      {...props}
    >
      <defs>
        <linearGradient id={gradId} x1="12" y1="3" x2="21" y2="13" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFBEB" />
          <stop offset="50%" stopColor="#FDE68A" />
          <stop offset="100%" stopColor="#F59E0B" />
        </linearGradient>
      </defs>
      {/* Moon Background Peeking Over Cloud */}
      <path
        d="M19.2 8.5C18.6 9 17.8 9.2 17 9.2C14.8 9.2 13 7.4 13 5.2C13 4.2 13.3 3.3 13.9 2.5C12.1 3.3 10.8 5.1 10.8 7.2C10.8 10.1 13.2 12.5 16.1 12.5C18.2 12.5 20 11.2 20.8 9.4C20.3 9 19.7 8.7 19.2 8.5Z"
        fill={`url(#${gradId})`}
      />
      {/* Cloud Foreground */}
      <path
        d="M8.5 20C6.6 20 5 18.4 5 16.5C5 14.8 6.2 13.3 7.9 13.1C8.4 10.7 10.5 9 13 9C15.9 9 18.3 11.2 18.5 14.1C20.1 14.4 21.3 15.8 21.3 17.5C21.3 19.2 19.9 20 18.2 20H8.5Z"
        fill="rgba(255, 255, 255, 0.95)"
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

