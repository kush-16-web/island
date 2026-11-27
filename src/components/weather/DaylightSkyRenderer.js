import { Renderer, Program, Mesh, Triangle, Texture } from 'ogl';

/**
 * DaylightSkyRenderer: Comprehensive Living Weather Atmosphere Engine powered by OGL.
 * 
 * Capabilities:
 * - Approved Phase B.2 Daylight Atmosphere: Rich azure Rayleigh scattering palette,
 *   soft luminous solar core disc with expansive forward-scattering Mie corona and atmospheric halo.
 * - Real Moon: Astronomical phase terminator, maria cratering, earthshine, and horizon altitude suppression.
 * - Living Night Sky: Deep natural midnight-navy/sapphire palette with stable procedural stars.
 * - Multi-layer seamless cloud simulation with parallax and directional day/night rim illumination.
 * - Precipitation & severe weather: fine directional rain streaks, gentle fluttering snow,
 *   soft intra-cloud lightning flashes for thunderstorms, and atmospheric fog/mist.
 * - Smooth parametric interpolation (no jarring state changes or canvas re-creations).
 * - High performance: capped DPR, auto-pause when hidden, zero WebGL resource leaks.
 */

const VERTEX_SHADER = /* glsl */ `
  attribute vec2 position;
  attribute vec2 uv;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  varying vec2 vUv;

  uniform vec2 uResolution;
  uniform float uTime;
  uniform float uSolarElevation; // in degrees (-30 to +90)
  uniform vec2 uSunPos;          // normalized screen coordinate [0..1]
  uniform float uIsDay;          // 0.0 (night) to 1.0 (day)
  uniform vec2 uMoonPos;         // normalized screen coordinate [0..1]
  uniform float uMoonVisible;    // 0.0 to 1.0 (elevation > 0 & cloud visibility)
  uniform float uMoonPhase;      // 0.0 to 1.0 (fraction illuminated)
  uniform float uMoonWaxing;     // 1.0 = waxing, 0.0 = waning
  uniform float uCloudCover;     // 0.0 to 1.0
  uniform vec2 uWindDir;         // normalized wind direction vector
  uniform float uWindSpeed;      // km/h
  uniform float uRainIntensity;  // 0.0 to 1.0
  uniform float uSnowIntensity;  // 0.0 to 1.0
  uniform float uLightning;      // 0.0 to 1.0 (soft cloud illumination)
  uniform float uFog;            // 0.0 to 1.0
  uniform float uTemperature;    // ambient temperature in °C
  uniform float uHaloIntensity;  // 0.0 to 1.0 (authentic 22° ice crystal halo)

  uniform sampler2D tCumulus;
  uniform sampler2D tCirrus;

  // Pseudo-random hash for procedural stars and precipitation
  float hash21(vec2 p) {
    p = fract(p * vec2(234.34, 435.345));
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
  }

  // 1. Approved Phase B.2 Daylight Atmospheric Scattering Palettes
  vec3 getZenithColor(float elev) {
    if (elev > 35.0) {
      // Crisp clear noon azure
      return vec3(0.11, 0.42, 0.78);
    } else if (elev > 15.0) {
      // Midday deep sky blue
      return vec3(0.14, 0.45, 0.84);
    } else if (elev > 2.0) {
      // Golden hour deep indigo-violet
      float t = (elev - 2.0) / 13.0;
      return mix(vec3(0.22, 0.20, 0.52), vec3(0.14, 0.45, 0.84), t);
    } else if (elev > -6.0) {
      // Sunset / Civil Twilight deep cobalt-purple
      float t = (elev + 6.0) / 8.0;
      return mix(vec3(0.08, 0.10, 0.28), vec3(0.22, 0.20, 0.52), t);
    } else {
      // Nautical twilight / night
      return vec3(0.04, 0.06, 0.16);
    }
  }

  vec3 getMidSkyColor(float elev) {
    if (elev > 35.0) {
      return vec3(0.32, 0.62, 0.92);
    } else if (elev > 15.0) {
      return vec3(0.36, 0.66, 0.95);
    } else if (elev > 2.0) {
      // Golden hour rose-amber midtones
      float t = (elev - 2.0) / 13.0;
      return mix(vec3(0.85, 0.38, 0.42), vec3(0.36, 0.66, 0.95), t);
    } else if (elev > -6.0) {
      // Sunset violet-crimson
      float t = (elev + 6.0) / 8.0;
      return mix(vec3(0.35, 0.15, 0.42), vec3(0.85, 0.38, 0.42), t);
    } else {
      return vec3(0.06, 0.09, 0.22);
    }
  }

  vec3 getHorizonColor(float elev) {
    if (elev > 35.0) {
      // Luminous cyan-white aerosol haze
      return vec3(0.72, 0.86, 0.98);
    } else if (elev > 15.0) {
      return vec3(0.75, 0.88, 0.99);
    } else if (elev > 2.0) {
      // Golden hour intense incandescent gold
      float t = (elev - 2.0) / 13.0;
      return mix(vec3(0.98, 0.64, 0.16), vec3(0.75, 0.88, 0.99), t);
    } else if (elev > -6.0) {
      // Sunset radiant vermilion-coral horizon glow
      float t = (elev + 6.0) / 8.0;
      return mix(vec3(0.88, 0.22, 0.28), vec3(0.98, 0.64, 0.16), t);
    } else {
      return vec3(0.12, 0.15, 0.32);
    }
  }

  // 2. Night Sky Gradient
  vec3 getNightSky(float h) {
    vec3 zenithNight = vec3(0.025, 0.038, 0.085);
    vec3 midNight = vec3(0.045, 0.065, 0.140);
    vec3 horizonNight = vec3(0.075, 0.105, 0.210);
    return mix(mix(horizonNight, midNight, smoothstep(0.0, 0.45, h)), zenithNight, smoothstep(0.40, 1.0, h));
  }

  // 3. Stable Procedural Starfield
  float getStars(vec2 uv, float aspect) {
    vec2 p = uv * vec2(aspect * 95.0, 95.0);
    vec2 ip = floor(p);
    vec2 fp = fract(p) - 0.5;
    float h = hash21(ip);
    if (h > 0.89) {
      float twinkle = sin(uTime * 0.0016 * (h * 4.0 + 1.0) + h * 6.28) * 0.25 + 0.75;
      float starRadius = mix(0.04, 0.09, fract(h * 17.3));
      return smoothstep(starRadius, 0.0, length(fp)) * twinkle;
    }
    return 0.0;
  }

  // 4. Directional Rain Streaks
  float getRain(vec2 uv, float aspect, float time, vec2 windDir, float intensity) {
    if (intensity < 0.02) return 0.0;
    float slant = windDir.x * 0.28;
    vec2 rUv = vec2(uv.x * aspect + uv.y * slant, uv.y);
    float rain = 0.0;

    // Fast foreground drops
    vec2 p1 = rUv * vec2(140.0, 18.0) + vec2(0.0, time * 32.0);
    vec2 ip1 = floor(p1);
    vec2 fp1 = fract(p1);
    float h1 = hash21(ip1);
    if (h1 > (1.0 - intensity * 0.42)) {
      float drop = smoothstep(0.075, 0.0, abs(fp1.x - 0.5)) * smoothstep(0.0, 0.85, fp1.y);
      rain += drop * 0.55;
    }

    // Secondary misty layer
    vec2 p2 = rUv * vec2(260.0, 26.0) + vec2(0.0, time * 42.0);
    vec2 ip2 = floor(p2);
    vec2 fp2 = fract(p2);
    float h2 = hash21(ip2 + 54.12);
    if (h2 > (1.0 - intensity * 0.60)) {
      float drop = smoothstep(0.05, 0.0, abs(fp2.x - 0.5)) * smoothstep(0.0, 0.75, fp2.y);
      rain += drop * 0.35;
    }

    return clamp(rain, 0.0, 1.0);
  }

  // 5. Gentle Fluttering Snow
  float getSnow(vec2 uv, float aspect, float time, vec2 windDir, float intensity) {
    if (intensity < 0.02) return 0.0;
    float slant = windDir.x * 0.16;
    vec2 sUv = vec2(uv.x * aspect + uv.y * slant, uv.y);
    float snow = 0.0;

    // Foreground flakes
    vec2 p1 = sUv * vec2(42.0, 42.0);
    p1.y += time * 2.2;
    p1.x += sin(time * 2.5 + p1.y * 0.6) * 0.35;
    vec2 ip1 = floor(p1);
    vec2 fp1 = fract(p1) - 0.5;
    float h1 = hash21(ip1);
    if (h1 > (1.0 - intensity * 0.36)) {
      float r = mix(0.09, 0.20, fract(h1 * 9.1));
      snow += smoothstep(r, 0.0, length(fp1)) * 0.75;
    }

    // Background fine flakes
    vec2 p2 = sUv * vec2(84.0, 84.0);
    p2.y += time * 3.2;
    p2.x += cos(time * 3.0 + p2.y * 0.5) * 0.25;
    vec2 ip2 = floor(p2);
    vec2 fp2 = fract(p2) - 0.5;
    float h2 = hash21(ip2 + 78.4);
    if (h2 > (1.0 - intensity * 0.55)) {
      float r = mix(0.06, 0.13, fract(h2 * 4.3));
      snow += smoothstep(r, 0.0, length(fp2)) * 0.45;
    }

    return clamp(snow, 0.0, 1.0);
  }

  void main() {
    vec2 uv = vUv;
    float aspect = uResolution.x / max(1.0, uResolution.y);
    float h = uv.y;

    // 1. Base Sky Gradient (Day vs Night interpolated)
    vec3 dayZenith = getZenithColor(uSolarElevation);
    vec3 dayMid = getMidSkyColor(uSolarElevation);
    vec3 dayHorizon = getHorizonColor(uSolarElevation);
    vec3 clearDaySky = mix(mix(dayHorizon, dayMid, smoothstep(0.0, 0.45, h)), dayZenith, smoothstep(0.40, 1.0, h));

    vec3 clearNightSky = getNightSky(h);
    vec3 clearSky = mix(clearNightSky, clearDaySky, uIsDay);

    // Overcast desaturation (only active under dense cloud cover)
    vec3 overcastDay = vec3(0.55, 0.60, 0.66) * (0.65 + 0.35 * h);
    vec3 overcastNight = vec3(0.045, 0.052, 0.070) * (0.70 + 0.30 * h);
    vec3 overcastSky = mix(overcastNight, overcastDay, uIsDay);

    // Darken storm atmosphere for thunderstorms
    if (uRainIntensity > 0.6 || uLightning > 0.05) {
      vec3 stormDay = vec3(0.18, 0.20, 0.24) * (0.60 + 0.40 * h);
      vec3 stormNight = vec3(0.030, 0.035, 0.045);
      overcastSky = mix(overcastSky, mix(stormNight, stormDay, uIsDay), 0.75);
    }

    float overcastMix = smoothstep(0.45, 0.85, uCloudCover);
    vec3 skyColor = mix(clearSky, overcastSky, overcastMix * 0.82);

    // 2. Stars at Night (obscured naturally by clouds & daylight)
    float starDensity = getStars(uv, aspect);
    float starMask = (1.0 - uIsDay) * (1.0 - smoothstep(0.12, 0.65, uCloudCover)) * smoothstep(0.15, 0.75, h);
    skyColor += vec3(0.85, 0.90, 1.0) * starDensity * starMask;

    // 3. Approved Phase B.2 Luminous Solar Core & Natural Atmospheric Mie Corona
    float mieCorona = 0.0;
    vec3 sunCoronaCol = mix(vec3(1.0, 0.55, 0.15), vec3(1.0, 0.92, 0.68), clamp(uSolarElevation / 25.0, 0.0, 1.0));

    if (uIsDay > 0.02) {
      vec2 dSun = (uv - uSunPos) * vec2(aspect, 1.0);
      float distToSun = length(dSun);

      // Core Solar Disc (soft luminous core blending smoothly without a hard cookie-cutter circle)
      float solarDisc = smoothstep(0.042, 0.012, distToSun);

      // Forward-scattering Mie Corona (intense near disc, softens outward into broad atmospheric halo)
      mieCorona = exp(-distToSun * 4.2) * 0.65;
      float outerGlow = exp(-distToSun * 1.6) * 0.28;

      // Subtle Directional Sun Rays / Sunbeams (drifting natural solar glow)
      float sunAngle = atan(dSun.y, dSun.x);
      float rayMod = sin(sunAngle * 12.0 + uTime * 0.00010) * 0.5 + 0.5;
      rayMod *= sin(sunAngle * 22.0 - uTime * 0.00008) * 0.5 + 0.5;
      rayMod = pow(rayMod, 2.0);
      float sunRays = exp(-distToSun * 3.6) * rayMod * 0.35;

      // Authentic 22° Optical Ice Crystal Halo (active when cold/cirrus conditions support it)
      float halo = 0.0;
      vec3 haloCol = vec3(0.0);
      if (uHaloIntensity > 0.01) {
        float haloDist = abs(distToSun - 0.26);
        halo = smoothstep(0.028, 0.0, haloDist) * 0.32 * uHaloIntensity;
        haloCol = mix(vec3(1.0, 0.90, 0.82), vec3(0.86, 0.94, 1.0), clamp((distToSun - 0.24) / 0.04, 0.0, 1.0));
      }

      vec3 sunCoreCol = vec3(1.0, 1.0, 0.98);

      // Sun dimming under dense clouds
      float sunOcclusion = (1.0 - smoothstep(0.35, 0.80, uCloudCover)) * uIsDay;
      vec3 sunLight = (solarDisc * sunCoreCol * 1.8 +
                       (mieCorona + outerGlow) * sunCoronaCol +
                       sunRays * mix(sunCoronaCol, vec3(1.0), 0.5) +
                       halo * haloCol) * sunOcclusion;
      skyColor += sunLight;
    }

    // 4. Real Moon (Nighttime)
    if (uIsDay < 0.98 && uMoonVisible > 0.01) {
      vec2 dMoon = (uv - uMoonPos) * vec2(aspect, 1.0);
      float distToMoon = length(dMoon);
      float moonRadius = 0.034;

      if (distToMoon < moonRadius * 2.2) {
        vec2 mUv = dMoon / moonRadius;
        float rM = length(mUv);

        if (rM <= 1.0) {
          // Crater & maria shading on lunar surface
          float crater = sin(mUv.x * 9.0 + 1.2) * cos(mUv.y * 8.0 - 0.5) * 0.12
                       + sin(mUv.x * 19.0 - mUv.y * 14.0) * 0.06;
          vec3 moonSurface = vec3(0.92, 0.94, 0.97) - vec3(0.14, 0.15, 0.18) * clamp(crater + 0.12, 0.0, 1.0);

          // Real astronomical phase terminator
          float xCoord = mUv.x;
          float yBound = sqrt(max(0.0001, 1.0 - mUv.y * mUv.y));
          float terminator = (2.0 * uMoonPhase - 1.0) * yBound;

          float lit = 0.0;
          if (uMoonWaxing > 0.5) {
            lit = (uMoonPhase >= 0.5)
              ? ((xCoord >= terminator) ? 1.0 : 0.0)
              : ((xCoord >= terminator && xCoord >= 0.0) ? 1.0 : 0.0);
          } else {
            lit = (uMoonPhase >= 0.5)
              ? ((xCoord <= -terminator) ? 1.0 : 0.0)
              : ((xCoord <= -terminator && xCoord <= 0.0) ? 1.0 : 0.0);
          }

          float phaseAlpha = smoothstep(-0.06, 0.06, lit - 0.5);

          // Earthshine (unlit moon disc dimly visible against dark sky)
          vec3 earthshine = vec3(0.06, 0.08, 0.12) * (1.0 - phaseAlpha);
          vec3 litMoon = moonSurface * phaseAlpha;

          // Smooth anti-aliased edge
          float edgeAa = smoothstep(1.0, 0.93, rM);
          vec3 moonPixel = (litMoon + earthshine) * edgeAa;

          // Obscured by cloud cover
          float moonCloudOcclusion = 1.0 - smoothstep(0.25, 0.85, uCloudCover);
          skyColor = mix(skyColor, moonPixel, edgeAa * moonCloudOcclusion * uMoonVisible * (1.0 - uIsDay));
        }

        // Restrained lunar glow / halo
        float lunarHalo = exp(-distToMoon * 9.0) * 0.22 * uMoonPhase * uMoonVisible * (1.0 - uIsDay);
        float lunarOuter = exp(-distToMoon * 3.5) * 0.08 * uMoonPhase * uMoonVisible * (1.0 - uIsDay);
        skyColor += vec3(0.55, 0.65, 0.85) * (lunarHalo + lunarOuter) * (1.0 - smoothstep(0.35, 0.85, uCloudCover));
      }
    }

    // 5. High-Altitude Cirrus Cloud Layer (delicate moving feather wisps)
    float windSpeedFactor = clamp(uWindSpeed / 30.0, 0.2, 1.8);
    vec2 cirrusOffset = uWindDir * (uTime * 0.000035 * windSpeedFactor);
    vec2 cirrusUv = uv * vec2(1.1, 0.9) + cirrusOffset;
    vec4 cirrusTex = texture2D(tCirrus, fract(cirrusUv));

    // Procedural delicate micro-fibrils
    float fibratus = sin(cirrusUv.x * 28.0 + sin(cirrusUv.y * 20.0)) * 0.5 + 0.5;
    float cirrusThreshold = mix(0.75, 0.25, clamp(uCloudCover * 1.2, 0.0, 1.0));
    float cirrusAlpha = smoothstep(cirrusThreshold, cirrusThreshold + 0.35, cirrusTex.a * (0.86 + 0.14 * fibratus)) * 0.45;
    vec3 cirrusDay = mix(vec3(0.96, 0.97, 1.0), sunCoronaCol, mieCorona * 0.4);
    vec3 cirrusNight = vec3(0.20, 0.24, 0.35);
    vec3 cirrusColor = mix(cirrusNight, cirrusDay, uIsDay);
    skyColor = mix(skyColor, cirrusColor, cirrusAlpha * (1.0 - overcastMix * 0.5));

    // 6. Low-to-Mid Volumetric Cumulus Cloud Layer
    vec2 cumulusOffset = uWindDir * (uTime * 0.000075 * windSpeedFactor);
    vec2 cumulusUv = uv * vec2(1.5, 1.2) + cumulusOffset;
    vec4 cumulusTex = texture2D(tCumulus, fract(cumulusUv));

    float coverageThreshold = mix(0.90, 0.12, clamp(uCloudCover, 0.0, 1.0));
    float cloudDensity = smoothstep(coverageThreshold, coverageThreshold + 0.32, cumulusTex.a);

    // Directional rim lighting: sunward rim in daylight, moonlit rim at night
    vec2 toSun = normalize(uSunPos - uv + vec2(0.001));
    float sunRim = clamp(dot(toSun, vec2(0.6, 0.8)), 0.0, 1.0) * mieCorona * 1.4 * uIsDay;

    vec2 toMoon = normalize(uMoonPos - uv + vec2(0.001));
    float moonRim = clamp(dot(toMoon, vec2(0.5, 0.7)), 0.0, 1.0) * exp(-length((uv - uMoonPos) * vec2(aspect, 1.0)) * 6.0) * 0.45 * (1.0 - uIsDay) * uMoonVisible;

    float verticalShading = mix(0.72, 1.05, smoothstep(0.1, 0.9, uv.y));
    vec3 cloudDayBase = mix(vec3(0.78, 0.82, 0.88), vec3(0.98, 0.99, 1.0), verticalShading);
    cloudDayBase = mix(cloudDayBase, sunCoronaCol * 0.95, clamp((18.0 - uSolarElevation) / 20.0, 0.0, 0.45));

    vec3 cloudNightBase = mix(vec3(0.10, 0.13, 0.20), vec3(0.24, 0.28, 0.38), verticalShading);
    vec3 cloudBaseColor = mix(cloudNightBase, cloudDayBase, uIsDay);

    // Darken storm clouds for rain / thunderstorm
    if (uRainIntensity > 0.5) {
      cloudBaseColor *= mix(0.85, 0.45, (uRainIntensity - 0.5) * 2.0);
    }

    vec3 finalCloudColor = cloudBaseColor + sunCoronaCol * sunRim + vec3(0.70, 0.80, 1.0) * moonRim;
    skyColor = mix(skyColor, finalCloudColor, cloudDensity * 0.92);

    // 7. Thunderstorm Lightning (soft illumination of cloud deck)
    if (uLightning > 0.01) {
      vec3 lightningColor = vec3(0.70, 0.80, 1.0);
      skyColor += lightningColor * uLightning * (0.35 + 0.65 * cumulusTex.a);
    }

    // 8. Precipitation Streaks (Rain / Snow)
    float rain = getRain(uv, aspect, uTime * 0.001, uWindDir, uRainIntensity);
    if (rain > 0.01) {
      vec3 rainColor = mix(vec3(0.40, 0.45, 0.55), vec3(0.85, 0.90, 0.98), uIsDay);
      skyColor = mix(skyColor, rainColor, rain * 0.55);
    }

    float snow = getSnow(uv, aspect, uTime * 0.001, uWindDir, uSnowIntensity);
    if (snow > 0.01) {
      vec3 snowColor = mix(vec3(0.65, 0.70, 0.80), vec3(0.98, 0.99, 1.0), uIsDay);
      skyColor = mix(skyColor, snowColor, snow * 0.82);
    }

    // 9. Fog & Mist Diffusion (only when active fog is present)
    if (uFog > 0.02) {
      vec3 fogColor = mix(vec3(0.08, 0.10, 0.14), vec3(0.64, 0.68, 0.72), uIsDay);
      skyColor = mix(skyColor, fogColor, uFog * 0.72);
    }

    // 10. Subtle Temperature Atmospheric Tinting (preserving foreground readability)
    float tempFactor = clamp((uTemperature - 15.0) / 20.0, -1.0, 1.0);
    vec3 tempTint = mix(
      vec3(0.97, 0.99, 1.03), // Cold: crystalline sapphire tint (+3% blue)
      vec3(1.03, 1.00, 0.97), // Hot: warm solar amber glow (+3% warm)
      tempFactor * 0.5 + 0.5
    );
    skyColor *= tempTint;

    // 11. Subtle Atmospheric Vignette for depth and text legibility
    float vignette = smoothstep(1.3, 0.4, length((uv - 0.5) * vec2(1.0, 0.8)));
    skyColor = mix(skyColor * 0.92, skyColor, vignette);

    gl_FragColor = vec4(skyColor, 1.0);
  }
`;

/**
 * Robust visibility normalizer across provider differences (km vs meters).
 * Returns normalized visibility in meters (standard SI).
 */
export function normalizeVisibilityMeters(vis) {
  if (vis == null || typeof vis !== 'number' || Number.isNaN(vis) || vis <= 0) return 10000;
  // If explicitly passed in kilometers (e.g. <= 50), convert to meters
  if (vis <= 50) return Math.round(vis * 1000);
  return Math.round(vis);
}

export class DaylightSkyRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.disposed = false;
    this.animId = null;

    // Time tracking
    this.timeAccumulator = 0;
    this.lastTimestamp = performance.now();

    // Smoothed interpolation states
    this.currentElevation = 25.0;
    this.targetElevation = 25.0;
    this.currentIsDay = 1.0;
    this.targetIsDay = 1.0;
    this.currentCoverage = 0.2;
    this.targetCoverage = 0.2;
    this.currentWindSpeed = 10.0;
    this.targetWindSpeed = 10.0;
    this.currentWindDir = [0.85, 0.15];
    this.targetWindDir = [0.85, 0.15];

    // Moon states
    this.currentMoonPhase = 0.98;
    this.targetMoonPhase = 0.98;
    this.currentMoonWaxing = 1.0;
    this.targetMoonWaxing = 1.0;
    this.currentMoonVisible = 1.0;
    this.targetMoonVisible = 1.0;

    // Precipitation & Weather effects
    this.currentRainIntensity = 0.0;
    this.targetRainIntensity = 0.0;
    this.currentSnowIntensity = 0.0;
    this.targetSnowIntensity = 0.0;
    this.currentFog = 0.0;
    this.targetFog = 0.0;

    // Temperature & Atmospheric Halo states
    this.currentTemperature = 20.0;
    this.targetTemperature = 20.0;
    this.currentHaloIntensity = 0.0;
    this.targetHaloIntensity = 0.0;

    // Lightning scheduling for thunderstorms
    this.isThunderstorm = false;
    this.lightningPulse = 0.0;
    this.nextLightningTime = performance.now() + 3000 + Math.random() * 4000;
    this.lightningActiveUntil = 0;

    // OGL Context initialization with verified full-surface bounds
    const initW = canvas.clientWidth || (canvas.parentElement ? canvas.parentElement.clientWidth : 576) || 576;
    const initH = canvas.clientHeight || (canvas.parentElement ? canvas.parentElement.clientHeight : 340) || 340;
    const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 1.5);
    try {
      this.renderer = new Renderer({
        canvas,
        width: initW,
        height: initH,
        dpr,
        alpha: false,
        antialias: false,
        powerPreference: 'low-power',
      });
      this.gl = this.renderer.gl;
    } catch (err) {
      console.warn('[DaylightSkyRenderer] Failed to initialize WebGL context:', err);
      this.renderer = null;
      this.gl = null;
      return;
    }

    this.initScene();
    this.setupContextListeners();
  }

  initScene() {
    if (!this.gl) return;
    const gl = this.gl;

    // Fullscreen single triangle (more efficient than 2 quads, avoids diagonal raster seam)
    this.geometry = new Triangle(gl);

    // Textures: 1x1 placeholder pixels until images load
    this.cumulusTexture = new Texture(gl, {
      wrapS: gl.REPEAT,
      wrapT: gl.REPEAT,
      minFilter: gl.LINEAR,
      magFilter: gl.LINEAR,
    });
    this.cirrusTexture = new Texture(gl, {
      wrapS: gl.REPEAT,
      wrapT: gl.REPEAT,
      minFilter: gl.LINEAR,
      magFilter: gl.LINEAR,
    });

    // Seamlessly resolve textures across both Vite dev server and Electron file:// production protocol
    const baseHref = (typeof window !== 'undefined' && window.location?.href) ? window.location.href : 'http://localhost/';
    const cumulusUrl = new URL('./weather/cloud-cumulus.png', baseHref).href;
    const cirrusUrl = new URL('./weather/cloud-cirrus.png', baseHref).href;

    this.loadTexture(this.cumulusTexture, cumulusUrl);
    this.loadTexture(this.cirrusTexture, cirrusUrl);

    // Shader Program with full daylight, nighttime, and precipitation uniforms
    this.program = new Program(gl, {
      vertex: VERTEX_SHADER,
      fragment: FRAGMENT_SHADER,
      uniforms: {
        uResolution: { value: [this.canvas.width || 520, this.canvas.height || 352] },
        uTime: { value: 0 },
        uSolarElevation: { value: 25.0 },
        uSunPos: { value: [0.76, 0.65] },
        uIsDay: { value: 1.0 },
        uMoonPos: { value: [0.76, 0.62] },
        uMoonVisible: { value: 1.0 },
        uMoonPhase: { value: 0.98 },
        uMoonWaxing: { value: 1.0 },
        uCloudCover: { value: 0.2 },
        uWindDir: { value: [0.85, 0.15] },
        uWindSpeed: { value: 10.0 },
        uRainIntensity: { value: 0.0 },
        uSnowIntensity: { value: 0.0 },
        uLightning: { value: 0.0 },
        uFog: { value: 0.0 },
        uTemperature: { value: 20.0 },
        uHaloIntensity: { value: 0.0 },
        tCumulus: { value: this.cumulusTexture },
        tCirrus: { value: this.cirrusTexture },
      },
    });

    this.mesh = new Mesh(gl, { geometry: this.geometry, program: this.program });
  }

  loadTexture(targetTexture, url) {
    if (typeof Image === 'undefined') return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (this.disposed || !this.gl) return;
      targetTexture.image = img;
    };
    img.onerror = (e) => {
      console.warn(`[DaylightSkyRenderer] Failed to load cloud texture ${url}:`, e);
    };
    img.src = url;
  }

  setupContextListeners() {
    this.onContextLost = (e) => {
      e.preventDefault();
      console.warn('[DaylightSkyRenderer] WebGL Context Lost');
      if (this.animId) cancelAnimationFrame(this.animId);
      this.animId = null;
    };

    this.onContextRestored = () => {
      console.info('[DaylightSkyRenderer] WebGL Context Restored. Reinitializing scene.');
      this.initScene();
      this.start();
    };

    this.canvas.addEventListener('webglcontextlost', this.onContextLost, false);
    this.canvas.addEventListener('webglcontextrestored', this.onContextRestored, false);
  }

  setTelemetry({
    isDay = true,
    solarElevation = 25,
    cloudCover = null,
    windSpeed = 10,
    windDirectionDeg = null,
    weatherCode = 0,
    lunar = null,
    precip = 0,
    visibility = null,
    temperature = 20,
    forceHalo = false,
  }) {
    this.targetIsDay = isDay ? 1.0 : 0.0;

    if (typeof solarElevation === 'number') {
      this.targetElevation = solarElevation;
    } else {
      this.targetElevation = isDay ? 30.0 : -30.0;
    }

    if (typeof cloudCover === 'number') {
      this.targetCoverage = Math.max(0.0, Math.min(1.0, cloudCover / 100.0));
    } else if (typeof weatherCode === 'number') {
      if (weatherCode === 0) this.targetCoverage = 0.04;
      else if (weatherCode === 1) this.targetCoverage = 0.20;
      else if (weatherCode === 2) this.targetCoverage = 0.48;
      else if (weatherCode === 3) this.targetCoverage = 0.88;
      else if (weatherCode >= 51) this.targetCoverage = 0.94;
    }

    if (typeof windSpeed === 'number') {
      this.targetWindSpeed = Math.max(2.0, windSpeed);
    }
    if (typeof windDirectionDeg === 'number') {
      const rad = (windDirectionDeg * Math.PI) / 180;
      this.targetWindDir = [Math.cos(rad), Math.sin(rad)];
    }

    // Moon Astronomical Properties
    if (lunar) {
      if (typeof lunar.fractionIlluminated === 'number') {
        this.targetMoonPhase = Math.max(0.0, Math.min(1.0, lunar.fractionIlluminated));
      }
      if (lunar.waxing !== undefined) {
        this.targetMoonWaxing = lunar.waxing ? 1.0 : 0.0;
      }
      if (typeof lunar.altitude === 'number') {
        this.targetMoonVisible = lunar.altitude > 0 ? 1.0 : 0.0;
      } else {
        this.targetMoonVisible = !isDay ? 1.0 : 0.0;
      }
    } else {
      this.targetMoonVisible = !isDay ? 1.0 : 0.0;
    }

    // Severe Weather / Precipitation
    const code = Number(weatherCode) || 0;

    // Rain: WMO 51-67, 80-82, 95-99
    const isRain = (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || (code >= 95);
    if (isRain) {
      const p = typeof precip === 'number' && precip > 0 ? precip : 60;
      this.targetRainIntensity = Math.min(1.0, Math.max(0.35, p / 100.0));
    } else {
      this.targetRainIntensity = 0.0;
    }

    // Snow: WMO 71-77, 85-86
    const isSnow = (code >= 71 && code <= 77) || (code >= 85 && code <= 86);
    if (isSnow) {
      const p = typeof precip === 'number' && precip > 0 ? precip : 60;
      this.targetSnowIntensity = Math.min(1.0, Math.max(0.40, p / 100.0));
    } else {
      this.targetSnowIntensity = 0.0;
    }

    // Thunderstorm: WMO 95-99
    this.isThunderstorm = code >= 95;

    // Visibility Normalization (standard SI meters)
    const visMeters = normalizeVisibilityMeters(visibility);
    const isFog = code === 45 || code === 48 || visMeters < 2000;
    this.targetFog = isFog ? 0.75 : 0.0;

    // Temperature (for subtle color grading)
    if (typeof temperature === 'number' && !Number.isNaN(temperature)) {
      this.targetTemperature = temperature;
    }

    // Condition-gated Optical Ice Halo (22° parhelic halo)
    // Authentically supported when high-altitude hexagonal ice crystals are present in cold air (<= 14°C)
    // with clear/partly cloudy skies (cloud cover 4% to 45%), high solar elevation (> 15°), and good visibility (>= 8000m).
    let supportsIceHalo = Boolean(forceHalo);
    if (!supportsIceHalo && isDay && this.targetElevation > 15.0 && visMeters >= 8000) {
      if (this.targetCoverage >= 0.04 && this.targetCoverage <= 0.45 && this.targetTemperature <= 14.0) {
        supportsIceHalo = true;
      }
    }
    this.targetHaloIntensity = supportsIceHalo ? 1.0 : 0.0;
  }

  resize(width, height) {
    if (!this.renderer || !this.gl || width <= 0 || height <= 0) return;
    this.renderer.setSize(width, height);
    if (this.program?.uniforms?.uResolution) {
      this.program.uniforms.uResolution.value = [this.gl.drawingBufferWidth, this.gl.drawingBufferHeight];
    }
  }

  start() {
    if (this.animId || this.disposed || !this.renderer) return;

    const render = (now) => {
      if (this.disposed) return;

      const deltaMs = Math.min(now - this.lastTimestamp, 64);
      this.lastTimestamp = now;

      const reducedMotion = typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

      // Accumulate time seamlessly (reduced motion slows down clouds)
      const motionScale = reducedMotion ? 0.08 : 1.0;
      this.timeAccumulator += deltaMs * motionScale;

      // Smooth parametric lerp to avoid abrupt jumps across conditions
      this.currentElevation += (this.targetElevation - this.currentElevation) * 0.04;
      this.currentIsDay += (this.targetIsDay - this.currentIsDay) * 0.04;
      this.currentCoverage += (this.targetCoverage - this.currentCoverage) * 0.04;
      this.currentWindSpeed += (this.targetWindSpeed - this.currentWindSpeed) * 0.04;
      this.currentWindDir[0] += (this.targetWindDir[0] - this.currentWindDir[0]) * 0.04;
      this.currentWindDir[1] += (this.targetWindDir[1] - this.currentWindDir[1]) * 0.04;

      this.currentMoonPhase += (this.targetMoonPhase - this.currentMoonPhase) * 0.04;
      this.currentMoonWaxing += (this.targetMoonWaxing - this.currentMoonWaxing) * 0.04;
      this.currentMoonVisible += (this.targetMoonVisible - this.currentMoonVisible) * 0.04;

      this.currentRainIntensity += (this.targetRainIntensity - this.currentRainIntensity) * 0.05;
      this.currentSnowIntensity += (this.targetSnowIntensity - this.currentSnowIntensity) * 0.05;
      this.currentFog += (this.targetFog - this.currentFog) * 0.05;
      this.currentTemperature += (this.targetTemperature - this.currentTemperature) * 0.05;
      this.currentHaloIntensity += (this.targetHaloIntensity - this.currentHaloIntensity) * 0.05;

      // Restrained Thunderstorm Lightning Simulation
      let lightningIntensity = 0.0;
      if (this.isThunderstorm && !reducedMotion) {
        if (now > this.nextLightningTime) {
          this.lightningActiveUntil = now + 160;
          this.nextLightningTime = now + 4000 + Math.random() * 5000;
        }

        if (now < this.lightningActiveUntil) {
          const remaining = this.lightningActiveUntil - now;
          const pulse = Math.sin((remaining / 160) * Math.PI * 2.5);
          lightningIntensity = Math.max(0.0, pulse) * 0.65;
        }
      }

      // Calculate Screen Sun Position from solar elevation (-18° to 90°)
      const normElev = Math.max(0.0, Math.min(1.0, (this.currentElevation + 5.0) / 75.0));
      const sunY = 0.46 + normElev * 0.36;
      const sunX = 0.76;

      // Calculate Moon Screen Position
      const moonY = 0.62;
      const moonX = 0.76;

      if (this.program?.uniforms) {
        const u = this.program.uniforms;
        u.uTime.value = this.timeAccumulator;
        u.uSolarElevation.value = this.currentElevation;
        u.uSunPos.value = [sunX, sunY];
        u.uIsDay.value = this.currentIsDay;
        u.uMoonPos.value = [moonX, moonY];
        u.uMoonVisible.value = this.currentMoonVisible;
        u.uMoonPhase.value = this.currentMoonPhase;
        u.uMoonWaxing.value = this.currentMoonWaxing;
        u.uCloudCover.value = this.currentCoverage;
        u.uWindDir.value = this.currentWindDir;
        u.uWindSpeed.value = this.currentWindSpeed;
        u.uRainIntensity.value = this.currentRainIntensity;
        u.uSnowIntensity.value = this.currentSnowIntensity;
        u.uLightning.value = lightningIntensity;
        u.uFog.value = this.currentFog;
        u.uTemperature.value = this.currentTemperature;
        u.uHaloIntensity.value = this.currentHaloIntensity;
      }

      this.renderer.render({ scene: this.mesh });
      this.animId = requestAnimationFrame(render);
    };

    this.animId = requestAnimationFrame(render);
  }

  stop() {
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
  }

  destroy() {
    this.disposed = true;
    this.stop();

    if (this.canvas) {
      this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
      this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    }

    if (this.gl) {
      const ext = this.gl.getExtension('WEBGL_lose_context');
      if (ext) ext.loseContext();
      this.gl = null;
    }
    this.renderer = null;
  }
}
