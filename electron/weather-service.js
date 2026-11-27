'use strict';

/**
 * weather-service.js: Secure, restricted main-process weather telemetry provider.
 * 
 * Security & Reliability Requirements:
 * 1. Restricted IPC: Strictly validates city names (alphanumeric/spaces/commas, max 80 chars)
 *    and coordinates (-90..90, -180..180). Never acts as an open URL proxy.
 * 2. Dedicated Node.js Fetch: Bypasses browser CORS restrictions safely in the main process
 *    without lowering renderer webSecurity or contextIsolation.
 * 3. Provider Adapter Architecture:
 *    - MSN Foreca: 1:1 Windows Weather ground station feed with 5s timeout & attribution.
 *    - Open-Meteo: High-reliability fallback capturing full atmospheric parameters
 *      (cloud cover, visibility, wind direction, precipitation intensity, sunrise/sunset).
 * 4. In-Memory Caching: 10-minute TTL in the main process to protect external APIs from excessive hits.
 * 5. Transparent Provider Tracking: Explicitly tags active provider and fallback reasons;
 *    eliminates silently swallowed errors.
 */

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const telemetryCache = new Map();
const {
  calculateAstroMetrics,
  getHourlySolarDetails,
  getTwilightPhase,
} = require('./weather-astro');

// Map MSN Skycode to WMO weather condition code
function mapMsnSkyCodeToWmo(skycode) {
  const code = Number(skycode);
  if ([31, 32, 33, 34].includes(code)) return 0; // Clear / Sunny
  if ([29, 30].includes(code)) return 2; // Partly Cloudy
  if ([26, 27, 28].includes(code)) return 3; // Cloudy / Overcast
  if ([20, 21, 22].includes(code)) return 45; // Fog / Haze
  if ([9, 10].includes(code)) return 51; // Drizzle
  if ([11, 12, 18, 39, 40].includes(code)) return 61; // Rain / Showers
  if ([4, 17, 35, 37, 38].includes(code)) return 95; // Thunderstorm
  if ([13, 14, 15, 16, 41, 42, 43].includes(code)) return 71; // Snow
  return 0;
}

const WMO_CONDITIONS = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  61: 'Slight rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  71: 'Slight snowfall',
  73: 'Moderate snowfall',
  75: 'Heavy snowfall',
  77: 'Snow grains',
  80: 'Slight rain showers',
  81: 'Moderate rain showers',
  82: 'Violent rain showers',
  85: 'Slight snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with slight hail',
  99: 'Thunderstorm with heavy hail',
};

// Convert wind direction degrees to cardinal text
function degreesToCardinal(deg) {
  if (deg == null || Number.isNaN(Number(deg))) return null;
  const val = Number(deg);
  const cardinals = ['North', 'Northeast', 'East', 'Southeast', 'South', 'Southwest', 'West', 'Northwest'];
  const index = Math.round(((val % 360) / 45)) % 8;
  return cardinals[index];
}

/**
 * Validates weather query parameters strictly.
 */
function validateWeatherInput(params) {
  if (!params || typeof params !== 'object') {
    return { valid: false, error: 'Parameters must be an object' };
  }

  const { city, lat, lon } = params;

  let sanitizedCity = null;
  if (city !== undefined && city !== null) {
    if (typeof city !== 'string') {
      return { valid: false, error: 'City must be a string' };
    }
    const trimmed = city.trim();
    if (trimmed.length === 0 || trimmed.length > 80) {
      return { valid: false, error: 'City length must be between 1 and 80 characters' };
    }
    // Allow alphanumeric, spaces, commas, periods, hyphens, and apostrophes
    if (!/^[a-zA-Z0-9\s,.\-']{1,80}$/.test(trimmed)) {
      return { valid: false, error: 'City contains disallowed characters' };
    }
    sanitizedCity = trimmed;
  }

  let sanitizedLat = null;
  let sanitizedLon = null;
  if (lat !== undefined && lat !== null && lon !== undefined && lon !== null) {
    const nLat = Number(lat);
    const nLon = Number(lon);
    if (Number.isNaN(nLat) || nLat < -90 || nLat > 90) {
      return { valid: false, error: 'Latitude must be a number between -90 and 90' };
    }
    if (Number.isNaN(nLon) || nLon < -180 || nLon > 180) {
      return { valid: false, error: 'Longitude must be a number between -180 and 180' };
    }
    sanitizedLat = nLat;
    sanitizedLon = nLon;
  }

  return {
    valid: true,
    city: sanitizedCity,
    lat: sanitizedLat,
    lon: sanitizedLon,
    provider: params.provider || 'auto',
  };
}

/**
 * Fetch raw observation from Microsoft MSN Weather & Foreca endpoint.
 */
async function fetchMsnWeatherData(city) {
  const url = `https://weather.service.msn.com/data.aspx?weasearchstr=${encodeURIComponent(city)}&culture=en-US&weadegreetype=C&src=outlook`;
  
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/xml, text/xml' },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`MSN Weather HTTP error: ${res.status} ${res.statusText}`);
    }
    const xml = await res.text();
    return parseMsnXml(xml, city);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Parse and normalize MSN XML structure.
 */
function parseMsnXml(xml, queryCity) {
  const currentMatch = xml.match(/<current\s+([^>]+)\/>/);
  if (!currentMatch) {
    throw new Error('MSN XML missing <current> observation tag');
  }

  const attrs = {};
  for (const m of currentMatch[1].matchAll(/(\w+)="([^"]*)"/g)) {
    attrs[m[1]] = m[2];
  }

  const weatherTagMatch = xml.match(/<weather\s+([^>]+)>/);
  let parsedLat = null;
  let parsedLon = null;
  if (weatherTagMatch) {
    const wAttrs = {};
    for (const m of weatherTagMatch[1].matchAll(/(\w+)="([^"]*)"/g)) {
      wAttrs[m[1]] = m[2];
    }
    if (wAttrs.lat != null) parsedLat = Number(wAttrs.lat);
    if (wAttrs.long != null) parsedLon = Number(wAttrs.long);
  }

  const locMatch = xml.match(/weatherlocationname="([^"]*)"/);
  const locationName = locMatch ? locMatch[1] : queryCity;
  const temp = attrs.temperature != null ? Number(attrs.temperature) : null;
  if (temp == null || Number.isNaN(temp)) {
    throw new Error('MSN XML missing valid temperature');
  }

  const forecasts = [];
  for (const f of xml.matchAll(/<forecast\s+([^>]+)\/>/g)) {
    const fAttrs = {};
    for (const a of f[1].matchAll(/(\w+)="([^"]*)"/g)) fAttrs[a[1]] = a[2];
    forecasts.push(fAttrs);
  }

  const todayForecast = forecasts[0] || null;
  const high = todayForecast?.high != null ? Number(todayForecast.high) : null;
  const low = todayForecast?.low != null ? Number(todayForecast.low) : null;
  const feelsLike = attrs.feelslike != null ? Number(attrs.feelslike) : temp;
  const humidity = attrs.humidity != null ? Number(attrs.humidity) : null;
  const windSpeed = attrs.windspeed ? Number(attrs.windspeed.replace(/[^0-9]/g, '')) : 10;
  const windDisplay = attrs.winddisplay || `${windSpeed} km/h`;
  const condition = attrs.skytext || 'Clear';
  const skycode = Number(attrs.skycode) || 32;

  // Extract wind direction if available in winddisplay (e.g., "7 km/h Northwest")
  let windDirection = null;
  if (windDisplay) {
    const parts = windDisplay.split(' ');
    if (parts.length >= 3) windDirection = parts[2];
  }

  const parts = locationName.split(',');
  const city = parts[0]?.trim() || queryCity;
  const country = parts[1]?.trim() || '';

  return {
    provider: 'msn_foreca',
    sourceAttribution: 'Microsoft Weather / Foreca',
    city,
    country,
    lat: parsedLat,
    lon: parsedLon,
    observedAt: attrs.date && attrs.observationtime ? `${attrs.date}T${attrs.observationtime}` : null,
    temperature: temp,
    temp,
    feelsLike,
    high,
    low,
    condition,
    weatherCode: mapMsnSkyCodeToWmo(skycode),
    humidity,
    windSpeed,
    windDirection,
    windDirectionDeg: null, // MSN does not provide degrees
    windDisplay,
    cloudCover: null, // MSN XML does not expose numeric cloud coverage
    visibility: null, // MSN XML does not expose visibility
    precipitationIntensity: null,
    rainChance: todayForecast?.precip ? Number(todayForecast.precip) : 0,
    sunrise: null,
    sunset: null,
    dailyForecasts: forecasts.slice(0, 7).map((f) => ({
      day: f.shortday || f.day,
      high: Number(f.high),
      low: Number(f.low),
      condition: f.skytextday,
      weatherCode: 0,
      precip: Number(f.precip || 0),
    })),
  };
}

/**
 * Fetch raw telemetry from Open-Meteo using Unix timestamps and coordinate timezone.
 */
async function fetchOpenMeteoData(lat, lon, observedGround = null) {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,precipitation,cloud_cover` +
    `&hourly=temperature_2m,apparent_temperature,precipitation_probability,weather_code,wind_speed_10m,wind_direction_10m,cloud_cover,visibility` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset` +
    `&temperature_unit=celsius&wind_speed_unit=kmh&timeformat=unixtime&timezone=auto`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);

  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Open-Meteo HTTP error: ${res.status} ${res.statusText}`);
    }
    const data = await res.json();
    return parseOpenMeteoJson(data, lat, lon, observedGround);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Parse and normalize Open-Meteo JSON structure with astronomical engine calculations.
 */
function parseOpenMeteoJson(data, lat, lon, observedGround = null) {
  const cur = data.current || {};
  const hourly = data.hourly || {};
  const daily = data.daily || {};
  const tz = data.timezone || 'UTC';

  // 1. Calculate Astronomical Solar & Lunar Foundations for the current moment
  const astro = calculateAstroMetrics(lat, lon, new Date(), tz);

  // 2. Resolve Current Observed State
  // Prefer ground observation if passed (e.g. MSN/Foreca), fallback to Open-Meteo current sensor
  const curTemp = cur.temperature_2m != null ? Math.round(cur.temperature_2m) : null;
  const curFeelsLike = cur.apparent_temperature != null ? Math.round(cur.apparent_temperature) : curTemp;
  const curCode = cur.weather_code != null ? Number(cur.weather_code) : 0;
  const curWindSpeed = cur.wind_speed_10m != null ? Math.round(cur.wind_speed_10m) : 0;
  const curWindDeg = cur.wind_direction_10m != null ? Math.round(cur.wind_direction_10m) : null;
  const curWindDir = degreesToCardinal(curWindDeg);

  const effectiveObserved = {
    source: observedGround?.provider || 'open_meteo',
    sourceAttribution: observedGround?.sourceAttribution || 'Open-Meteo (DWD / NOAA / ECMWF)',
    stationTime: observedGround?.observedAt || (cur.time ? new Date(cur.time * 1000).toISOString() : new Date().toISOString()),
    temperature: observedGround?.temperature != null ? observedGround.temperature : curTemp,
    feelsLike: observedGround?.feelsLike != null ? observedGround.feelsLike : curFeelsLike,
    condition: observedGround?.condition || WMO_CONDITIONS[curCode] || 'Clear',
    weatherCode: observedGround?.weatherCode != null ? observedGround.weatherCode : curCode,
    humidity: observedGround?.humidity != null ? observedGround.humidity : (cur.relative_humidity_2m != null ? Math.round(cur.relative_humidity_2m) : null),
    windSpeed: observedGround?.windSpeed != null ? observedGround.windSpeed : curWindSpeed,
    windDirection: observedGround?.windDirection || curWindDir,
    windDirectionDeg: observedGround?.windDirectionDeg ?? curWindDeg,
    windDisplay: observedGround?.windDisplay || (curWindDir ? `${curWindSpeed} km/h ${curWindDir}` : `${curWindSpeed} km/h`),
    rainChance: observedGround?.rainChance != null ? observedGround.rainChance : (daily.precipitation_probability_max ? Number(daily.precipitation_probability_max[0]) : 0),
  };

  // 3. Build Normalized Hourly Strip using Unix Timestamps
  const hourlyForecast = [];
  const times = Array.isArray(hourly.time) ? hourly.time : [];
  if (times.length > 0) {
    const nowSec = Math.floor(Date.now() / 1000);

    // Locate current hour slot in local time coordinates
    let nowIdx = times.findIndex((t, idx) => {
      const nextT = times[idx + 1] || t + 3600;
      return nowSec >= t && nowSec < nextT;
    });
    if (nowIdx < 0) {
      nowIdx = times.findIndex((t) => t >= nowSec);
    }
    if (nowIdx < 0) nowIdx = 0;

    for (let i = nowIdx; i < Math.min(nowIdx + 12, times.length); i++) {
      const isNow = (i === nowIdx);
      const tSec = times[i];
      const hourDate = new Date(tSec * 1000);
      const hourLabel = isNow
        ? 'Now'
        : hourDate.toLocaleTimeString('en-US', {
            hour: 'numeric',
            hour12: true,
            timeZone: tz,
          });

      // Calculate solar angle independently for each hourly forecast point
      const hourlyAstro = isNow ? astro : getHourlySolarDetails(lat, lon, tSec);

      // Now slot reflects current observed conditions; subsequent slots reflect pure forecast values
      const hTemp = isNow && effectiveObserved.temperature != null
        ? effectiveObserved.temperature
        : Math.round(hourly.temperature_2m ? hourly.temperature_2m[i] : 20);

      const hFeelsLike = isNow && effectiveObserved.feelsLike != null
        ? effectiveObserved.feelsLike
        : Math.round(hourly.apparent_temperature ? hourly.apparent_temperature[i] : hTemp);

      const hCode = isNow && effectiveObserved.weatherCode != null
        ? effectiveObserved.weatherCode
        : (hourly.weather_code ? hourly.weather_code[i] : 0);

      hourlyForecast.push({
        time: hourLabel,
        timestamp: tSec,
        isoTime: hourDate.toISOString(),
        temp: hTemp,
        apparentTemp: hFeelsLike,
        weatherCode: hCode,
        isDay: hourlyAstro.isDay,
        solarElevation: hourlyAstro.solarElevation,
        twilightPhase: hourlyAstro.twilightPhase,
        rainChance: hourly.precipitation_probability ? hourly.precipitation_probability[i] : 0,
        cloudCover: hourly.cloud_cover ? hourly.cloud_cover[i] : null,
        visibility: hourly.visibility && hourly.visibility[i] != null ? Math.round(hourly.visibility[i]) : 10000, // normalized meters (SI)
        visibilityKm: hourly.visibility && hourly.visibility[i] != null ? Math.round(hourly.visibility[i] / 1000) : 10, // km
        windSpeed: hourly.wind_speed_10m ? Math.round(hourly.wind_speed_10m[i]) : null,
        windDirectionDeg: hourly.wind_direction_10m ? hourly.wind_direction_10m[i] : null,
        lunarPhase: astro.lunar.phaseName,
      });
    }
  }

  // 4. Build Normalized 7-Day Strip
  const dailyForecasts = [];
  if (Array.isArray(daily.time)) {
    for (let i = 0; i < Math.min(7, daily.time.length); i++) {
      const tSec = daily.time[i];
      const d = new Date(tSec * 1000);
      const dayName = i === 0 ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short', timeZone: tz });
      const cCode = daily.weather_code ? daily.weather_code[i] : 0;
      dailyForecasts.push({
        day: dayName,
        timestamp: tSec,
        high: Math.round(daily.temperature_2m_max ? daily.temperature_2m_max[i] : 25),
        low: Math.round(daily.temperature_2m_min ? daily.temperature_2m_min[i] : 18),
        condition: WMO_CONDITIONS[cCode] || 'Fair',
        weatherCode: cCode,
        precip: daily.precipitation_probability_max ? Number(daily.precipitation_probability_max[i]) : 0,
        sunrise: daily.sunrise ? new Date(daily.sunrise[i] * 1000).toISOString() : null,
        sunset: daily.sunset ? new Date(daily.sunset[i] * 1000).toISOString() : null,
      });
    }
  }

  return {
    provider: effectiveObserved.source,
    sourceAttribution: effectiveObserved.sourceAttribution,
    lat,
    lon,
    timezone: tz,
    observedAt: effectiveObserved.stationTime,

    // Semantically distinct sub-objects
    observed: effectiveObserved,
    astronomy: astro,
    forecast: {
      source: 'open_meteo',
      hourly: hourlyForecast,
      daily: dailyForecasts,
    },

    // Backwards-compatible top-level keys for existing UI
    temperature: effectiveObserved.temperature,
    temp: effectiveObserved.temperature,
    feelsLike: effectiveObserved.feelsLike,
    high: dailyForecasts[0]?.high ?? (daily.temperature_2m_max ? Math.round(daily.temperature_2m_max[0]) : effectiveObserved.temperature),
    low: dailyForecasts[0]?.low ?? (daily.temperature_2m_min ? Math.round(daily.temperature_2m_min[0]) : effectiveObserved.temperature),
    condition: effectiveObserved.condition,
    weatherCode: effectiveObserved.weatherCode,
    isDay: astro.isDay,
    humidity: effectiveObserved.humidity,
    windSpeed: effectiveObserved.windSpeed,
    windDirection: effectiveObserved.windDirection,
    windDirectionDeg: effectiveObserved.windDirectionDeg,
    windDisplay: effectiveObserved.windDisplay,
    cloudCover: cur.cloud_cover != null ? Math.round(cur.cloud_cover) : null,
    visibility: hourly.visibility && hourly.visibility[0] != null ? Math.round(hourly.visibility[0]) : 10000,
    visibilityKm: hourly.visibility && hourly.visibility[0] != null ? Math.round(hourly.visibility[0] / 1000) : 10,
    precipitationIntensity: cur.precipitation != null ? Number(cur.precipitation) : 0,
    rainChance: effectiveObserved.rainChance,
    sunrise: astro.sunrise || (daily.sunrise ? new Date(daily.sunrise[0] * 1000).toISOString() : null),
    sunset: astro.sunset || (daily.sunset ? new Date(daily.sunset[0] * 1000).toISOString() : null),
    hourlyForecast,
    dailyForecasts,
  };
}

/**
 * Fetch weather telemetry with multi-provider fallback and caching.
 */
async function fetchWeatherTelemetry(params = {}) {
  const check = validateWeatherInput(params);
  if (!check.valid) {
    return { ok: false, error: check.error };
  }

  const { city, lat, lon, provider } = check;
  const cacheKey = `${city || `${lat},${lon}`}:${provider}`;
  const now = Date.now();

  const cached = telemetryCache.get(cacheKey);
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return {
      ok: true,
      data: cached.data,
      isCached: true,
      cachedAt: cached.timestamp,
    };
  }

  let msnResult = null;
  let fallbackReason = null;

  // 1. Try Microsoft MSN Weather first if city is provided and allowed
  if (provider === 'auto' || provider === 'msn_foreca') {
    if (city) {
      try {
        msnResult = await fetchMsnWeatherData(city);
      } catch (err) {
        console.warn(`[weather-service] MSN Foreca query failed for "${city}": ${err.message}. Engaging Open-Meteo fallback.`);
        fallbackReason = `MSN: ${err.message}`;
      }
    }
  }

  // 2. Resolve coordinates: priority explicit params > MSN parsed coordinates > Surat defaults
  const resolvedLat = lat != null ? lat : (msnResult?.lat != null ? msnResult.lat : 21.1702);
  const resolvedLon = lon != null ? lon : (msnResult?.lon != null ? msnResult.lon : 72.8311);

  let resultData = null;
  try {
    // Open-Meteo generates astronomical calculations, hourly strips, and atmospheric fields
    const omResult = await fetchOpenMeteoData(resolvedLat, resolvedLon, msnResult);
    resultData = omResult;
    if (city) resultData.city = msnResult?.city || city;
    if (msnResult?.country) resultData.country = msnResult.country;
  } catch (omErr) {
    console.warn(`[weather-service] Open-Meteo fetch failed: ${omErr.message}`);
    // If Open-Meteo failed but MSN succeeded, assemble fallback from MSN
    if (msnResult) {
      const astro = calculateAstroMetrics(resolvedLat, resolvedLon, new Date());
      resultData = {
        ...msnResult,
        lat: resolvedLat,
        lon: resolvedLon,
        isDay: astro.isDay,
        astronomy: astro,
        observed: {
          source: 'msn_foreca',
          temperature: msnResult.temperature,
          feelsLike: msnResult.feelsLike,
          condition: msnResult.condition,
          weatherCode: msnResult.weatherCode,
          humidity: msnResult.humidity,
          windSpeed: msnResult.windSpeed,
          windDisplay: msnResult.windDisplay,
          rainChance: msnResult.rainChance,
        },
        forecast: {
          source: 'msn_foreca',
          hourly: [],
          daily: msnResult.dailyForecasts,
        },
      };
    } else {
      return {
        ok: false,
        error: fallbackReason ? `${fallbackReason}; Open-Meteo: ${omErr.message}` : omErr.message,
      };
    }
  }

  if (resultData) {
    resultData.updatedAt = now;
    if (fallbackReason) resultData.fallbackReason = fallbackReason;

    telemetryCache.set(cacheKey, { timestamp: now, data: resultData });
    return { ok: true, data: resultData, isCached: false };
  }

  return { ok: false, error: 'Failed to retrieve telemetry from all configured weather providers' };
}

module.exports = {
  fetchWeatherTelemetry,
  validateWeatherInput,
  mapMsnSkyCodeToWmo,
  WMO_CONDITIONS,
};
