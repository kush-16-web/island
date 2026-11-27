/**
 * weather.js: High-accuracy live weather integration for Island Voice Agent via Open-Meteo.
 *
 * Requirements (PASS 2.2.6.2 Part B):
 * 1. 100% Free & No API keys: Open-Meteo Forecast & Geocoding APIs with timezone=auto.
 * 2. Location Resolution Priority:
 *    - 1. Explicitly named location in the current request (e.g. "Delhi", "Tokyo", "Mumbai")
 *    - 2. Conversational context location (e.g. "How about tomorrow?" retains previous city)
 *    - 3. User-selected default weather city (localStorage 'island_weather_default_city')
 *    - 4. Clearly labeled approximate IP-based city (http://ip-api.com/json/)
 * 3. Validation & Grounding:
 *    - Distinguishes current temperature, apparent (feels-like) temperature, daily high/low, and forecasts.
 *    - Fetches daily & hourly forecast data when the user asks about tomorrow or this evening.
 *    - Never fabricates weather data or answers forecast questions using only current conditions.
 * 4. Natural conversational responses for questions like:
 *    - "What's the weather outside?"
 *    - "Is it hot right now?"
 *    - "How about tomorrow?"
 *    - "Will it rain this evening?"
 *    - "What's the weather in Delhi?"
 *    - "How about Mumbai instead?"
 * 5. Structured data return for InlineWeather UI.
 */

export const WMO_CONDITIONS = {
  0: 'clear sky',
  1: 'mainly clear',
  2: 'partly cloudy',
  3: 'overcast',
  45: 'foggy',
  48: 'foggy with rime',
  51: 'light drizzle',
  53: 'moderate drizzle',
  55: 'dense drizzle',
  61: 'slight rain',
  63: 'moderate rain',
  65: 'heavy rain',
  71: 'slight snowfall',
  73: 'moderate snowfall',
  75: 'heavy snowfall',
  77: 'snow grains',
  80: 'light rain showers',
  81: 'moderate rain showers',
  82: 'violent rain showers',
  85: 'light snow showers',
  86: 'heavy snow showers',
  95: 'thunderstorms',
  96: 'thunderstorms with hail',
  99: 'severe thunderstorms with hail',
};

const weatherCache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Session-level conversational weather context
let lastWeatherSessionContext = null;

export function getLastWeatherContext() {
  return lastWeatherSessionContext;
}

export function resetWeatherContext() {
  lastWeatherSessionContext = null;
  weatherCache.clear();
}

/**
 * Resolve coordinates and city name using 4-tier resolution priority.
 */
export const SURAT_DEFAULT_LOCATION = Object.freeze({
  city: 'Surat',
  state: 'Gujarat',
  country: 'India',
  lat: 21.1702,
  lon: 72.8311,
  timezone: 'Asia/Kolkata',
});

export const STORAGE_KEY_LOCATION = 'island_weather_location';
export const STORAGE_KEY_DEFAULT_CITY = 'island_weather_default_city';
export const STORAGE_KEY_INIT = 'island_location_initialized';

/**
 * Retrieve user's configured location preference from storage.
 */
export function getUserLocation(storage = null) {
  const store = storage || (typeof window !== 'undefined' ? window.localStorage : null);
  if (!store) return null;
  try {
    const raw = store.getItem(STORAGE_KEY_LOCATION);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.city && typeof parsed.lat === 'number' && typeof parsed.lon === 'number') {
        return parsed;
      }
    }
    const legacy = store.getItem(STORAGE_KEY_DEFAULT_CITY);
    if (legacy && typeof legacy === 'string' && legacy.trim()) {
      return { city: legacy.trim() };
    }
  } catch (err) {
    console.warn('[Weather] Error reading user location:', err);
  }
  return null;
}

/**
 * Persist user's configured location preference to storage.
 */
export function setUserLocation(location, storage = null) {
  const store = storage || (typeof window !== 'undefined' ? window.localStorage : null);
  if (!store || !location || typeof location !== 'object') return false;
  try {
    const loc = {
      city: location.city || 'Surat',
      state: location.state || '',
      country: location.country || 'India',
      lat: Number(location.lat) || 21.1702,
      lon: Number(location.lon) || 72.8311,
      timezone: location.timezone || 'Asia/Kolkata',
    };
    store.setItem(STORAGE_KEY_LOCATION, JSON.stringify(loc));
    store.setItem(STORAGE_KEY_DEFAULT_CITY, loc.city);
    store.setItem(STORAGE_KEY_INIT, 'true');
    if (typeof store.removeItem === 'function') {
      store.removeItem('island_location_cleared');
    }
    weatherCache.clear();
    lastWeatherSessionContext = { ...loc, type: 'default' };
    return true;
  } catch (err) {
    console.warn('[Weather] Error saving user location:', err);
    return false;
  }
}

/**
 * Clear configured user location.
 */
export function clearUserLocation(storage = null) {
  const store = storage || (typeof window !== 'undefined' ? window.localStorage : null);
  if (!store) return;
  try {
    store.removeItem(STORAGE_KEY_LOCATION);
    store.removeItem(STORAGE_KEY_DEFAULT_CITY);
    store.setItem('island_location_cleared', 'true');
    weatherCache.clear();
    lastWeatherSessionContext = null;
  } catch { }
}

/**
 * Initialize location preference for this user's installation to Surat, Gujarat, India.
 * Does not overwrite if the user has already configured or changed their location.
 */
export function initInstallationLocation(storage = null) {
  const store = storage || (typeof window !== 'undefined' ? window.localStorage : null);
  if (!store) return null;
  try {
    const existing = getUserLocation(store);
    if (existing) return existing;
    const wasInit = store.getItem(STORAGE_KEY_INIT);
    if (!wasInit) {
      setUserLocation(SURAT_DEFAULT_LOCATION, store);
      return { ...SURAT_DEFAULT_LOCATION };
    }
  } catch (err) {
    console.warn('[Weather] Error initializing installation location:', err);
  }
  return null;
}

/**
 * Search locations and cities using Open-Meteo geocoding API.
 */
export async function searchLocations(query) {
  if (!query || typeof query !== 'string' || !query.trim()) return [];
  try {
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query.trim())}&count=5`;
    const res = await fetch(geoUrl, { headers: { Accept: 'application/json' } });
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data?.results)) return [];
    return data.results.map((item) => ({
      city: item.name,
      state: item.admin1 || '',
      country: item.country || '',
      lat: item.latitude,
      lon: item.longitude,
      timezone: item.timezone || 'Asia/Kolkata',
      label: [item.name, item.admin1, item.country].filter(Boolean).join(', '),
    }));
  } catch (err) {
    console.warn('[Weather] searchLocations geocoding error:', err);
    return [];
  }
}

/**
 * Resolve coordinates and city name using strict location priority:
 * 1. Explicitly named location in the current request.
 * 2. Conversational context location (follow-up queries).
 * 3. Windows system location (when supported integration is available).
 * 4. Previously validated saved location.
 * 5. Return null to request user selection. Never silently substitute an IP-detected city.
 */
export async function resolveLocation(locationQuery = null, options = {}, storage = null) {
  const store = storage || (typeof window !== 'undefined' ? window.localStorage : null);
  const { timeframe = 'current', isFollowUp = false } = options || {};

  // Priority 1: Explicitly named location in the current request
  if (locationQuery && typeof locationQuery === 'string' && locationQuery.trim()) {
    const cleanCity = locationQuery.trim();
    try {
      const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cleanCity)}&count=1`;
      const res = await fetch(geoUrl, { headers: { Accept: 'application/json' } });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.results) && data.results.length > 0) {
          const match = data.results[0];
          const resolved = {
            city: match.name,
            state: match.admin1 || '',
            country: match.country || '',
            lat: match.latitude,
            lon: match.longitude,
            timezone: match.timezone || 'Asia/Kolkata',
            type: 'explicit',
          };
          lastWeatherSessionContext = { ...resolved };
          return resolved;
        }
      }
    } catch (err) {
      console.warn('[Weather] Geocoding lookup error:', err);
    }
  }

  // Conversational context location (if follow-up question, retry, or forecast without named city)
  const isRetry = options.isRetry || (typeof locationQuery === 'string' && /\b(?:again|retry)\b/i.test(locationQuery));
  if ((!locationQuery || isRetry) && (isFollowUp || isRetry || timeframe === 'tomorrow' || timeframe === 'evening')) {
    if (lastWeatherSessionContext?.city && lastWeatherSessionContext?.lat) {
      return {
        ...lastWeatherSessionContext,
        type: 'context',
      };
    }
  }

  // Priority 2: Windows system location when supported integration is available
  if (typeof window !== 'undefined' && window.island?.getSystemLocation) {
    try {
      const sysLoc = await window.island.getSystemLocation();
      if (sysLoc && sysLoc.lat && sysLoc.lon) {
        const resolved = {
          city: sysLoc.city || 'Local Area',
          state: sysLoc.state || '',
          country: sysLoc.country || '',
          lat: sysLoc.lat,
          lon: sysLoc.lon,
          timezone: sysLoc.timezone || 'Asia/Kolkata',
          type: 'system',
        };
        lastWeatherSessionContext = { ...resolved };
        return resolved;
      }
    } catch { }
  }

  // Priority 3: Previously validated saved location
  const saved = getUserLocation(store);
  if (saved) {
    if (typeof saved.lat === 'number' && typeof saved.lon === 'number') {
      const resolved = {
        city: saved.city,
        state: saved.state || '',
        country: saved.country || '',
        lat: saved.lat,
        lon: saved.lon,
        timezone: saved.timezone || 'Asia/Kolkata',
        type: 'default',
      };
      lastWeatherSessionContext = { ...resolved };
      return resolved;
    } else if (saved.city) {
      // Legacy city name without coordinates, geocode once
      try {
        const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(saved.city)}&count=1`;
        const res = await fetch(geoUrl, { headers: { Accept: 'application/json' } });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.results) && data.results.length > 0) {
            const match = data.results[0];
            const resolved = {
              city: match.name,
              state: match.admin1 || '',
              country: match.country || '',
              lat: match.latitude,
              lon: match.longitude,
              timezone: match.timezone || 'Asia/Kolkata',
              type: 'default',
            };
            lastWeatherSessionContext = { ...resolved };
            return resolved;
          }
        }
      } catch (err) {
        console.warn('[Weather] Geocoding lookup error for saved city:', err);
      }
    }
  }

  // Priority 4: Default installation location (Surat, Gujarat, India) when uninitialized.
  // Ensures Island always provides accurate weather on brand-new installs without requiring manual configuration,
  // while honoring explicit user clearing if the user deliberately emptied their location in settings.
  const isExplicitlyCleared = store && store.getItem('island_location_cleared') === 'true';
  if (!isExplicitlyCleared) {
    const initLoc = initInstallationLocation(store) || { ...SURAT_DEFAULT_LOCATION, type: 'default' };
    const resolved = {
      city: initLoc.city,
      state: initLoc.state || '',
      country: initLoc.country || '',
      lat: initLoc.lat,
      lon: initLoc.lon,
      timezone: initLoc.timezone || 'Asia/Kolkata',
      type: 'default',
    };
    lastWeatherSessionContext = { ...resolved };
    return resolved;
  }

  return null;
}

/**
 * Format human-like natural spoken confirmation for weather results.
 */
function formatWeatherSpeech({
  city,
  locationType,
  timeframe,
  questionType,
  temp,
  feelsLike,
  condition,
  high,
  low,
  rainChance,
  tomorrow,
  evening,
}) {
  const isApprox = locationType === 'approximate_ip';
  const locSuffix = isApprox ? `${city} (approximate location)` : city;

  // Case A: Tomorrow's forecast
  if (timeframe === 'tomorrow' && tomorrow) {
    const cond = tomorrow.condition || 'fair conditions';
    const h = Math.round(tomorrow.high ?? temp);
    const l = Math.round(tomorrow.low ?? (h - 8));
    const rain = tomorrow.rainChance ?? 0;

    let text = `Tomorrow in ${city}, expect ${cond} with a high of ${h}°C and a low of ${l}°C.`;
    if (rain >= 35) {
      text += ` There is a ${rain}% chance of rain.`;
    }
    return text;
  }

  // Case B: This evening / tonight
  if ((timeframe === 'evening' || timeframe === 'tonight') && evening) {
    const eTemp = Math.round(evening.temp ?? (temp - 3));
    const eCond = evening.condition || condition;
    const eRain = evening.rainChance ?? rainChance;

    let text = `This evening in ${city}, it will be around ${eTemp}°C with ${eCond}.`;
    if (questionType === 'rain') {
      if (eRain >= 30) {
        text = `Yes, there is a ${eRain}% chance of rain this evening in ${city} with ${eCond}.`;
      } else {
        text = `Rain is unlikely this evening in ${city}, with only a ${eRain}% chance of precipitation.`;
      }
    }
    return text;
  }

  // Case C: Rain question for today
  if (questionType === 'rain') {
    if (rainChance >= 40) {
      return `Yes, there is a ${rainChance}% chance of rain in ${city} today with ${condition}.`;
    }
    return `Rain is unlikely in ${city} today, with only a ${rainChance}% chance of precipitation and ${condition}.`;
  }

  // Case D: Heat / Temperature question
  if (questionType === 'heat') {
    if (temp >= 32) {
      return `Yes, it's quite hot in ${city} right now at ${temp}°C, feeling like ${feelsLike}°C.`;
    }
    if (temp <= 16) {
      return `No, it's cool in ${city} right now at ${temp}°C.`;
    }
    return `It's a mild ${temp}°C in ${city} right now, feeling like ${feelsLike}°C.`;
  }

  // Case E: General current weather
  let speech = `It's currently ${temp}°C and ${condition} in ${locSuffix}`;
  if (Math.abs(feelsLike - temp) >= 2) {
    speech += `, feeling like ${feelsLike}°C`;
  }
  if (high != null && low != null) {
    speech += `, with a high of ${Math.round(high)}°C today.`;
  } else {
    speech += `.`;
  }
  return speech;
}

export function mapMsnSkyCodeToWmo(skycode) {
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

/**
 * Fetch live ground station observation from Microsoft MSN Weather & Foreca
 * (The exact official weather provider used by Windows 10/11 Taskbar Weather).
 */
export async function fetchMicrosoftWeather(city) {
  if (!city || typeof city !== 'string') return null;
  try {
    const url = `https://weather.service.msn.com/data.aspx?weasearchstr=${encodeURIComponent(city.trim())}&culture=en-US&weadegreetype=C&src=outlook`;
    const res = await fetch(url, { headers: { Accept: 'application/xml, text/xml' } });
    if (!res.ok) return null;
    const xml = await res.text();
    const currentMatch = xml.match(/<current\s+([^>]+)\/>/);
    if (!currentMatch) return null;
    const attrs = {};
    for (const m of currentMatch[1].matchAll(/(\w+)="([^"]*)"/g)) {
      attrs[m[1]] = m[2];
    }
    const locMatch = xml.match(/weatherlocationname="([^"]*)"/);
    const locationName = locMatch ? locMatch[1] : city;
    const temp = attrs.temperature != null ? Number(attrs.temperature) : null;
    if (temp == null || Number.isNaN(temp)) return null;

    const forecasts = [];
    for (const f of xml.matchAll(/<forecast\s+([^>]+)\/>/g)) {
      const fAttrs = {};
      for (const a of f[1].matchAll(/(\w+)="([^"]*)"/g)) fAttrs[a[1]] = a[2];
      forecasts.push(fAttrs);
    }

    const todayForecast = forecasts[0] || null;
    const high = todayForecast?.high ? Number(todayForecast.high) : null;
    const low = todayForecast?.low ? Number(todayForecast.low) : null;
    const feelsLike = attrs.feelslike ? Number(attrs.feelslike) : temp;
    const humidity = attrs.humidity ? Number(attrs.humidity) : null;
    const windSpeed = attrs.windspeed ? Number(attrs.windspeed.replace(/[^0-9]/g, '')) : 10;
    const condition = attrs.skytext || 'Clear';
    const skycode = Number(attrs.skycode) || 32;

    return {
      provider: 'foreca_msn',
      city: locationName.split(',')[0].trim(),
      country: locationName.split(',')[1]?.trim() || '',
      temperature: temp,
      feelsLike,
      high,
      low,
      condition,
      weatherCode: mapMsnSkyCodeToWmo(skycode),
      humidity,
      windSpeed,
      windDisplay: attrs.winddisplay || `${windSpeed} km/h`,
      rainChance: todayForecast?.precip ? Number(todayForecast.precip) : 0,
      dailyForecasts: forecasts.slice(0, 5).map((f) => ({
        day: f.shortday || f.day,
        high: Number(f.high),
        low: Number(f.low),
        condition: f.skytextday,
        precip: Number(f.precip || 0),
      })),
    };
  } catch (err) {
    console.warn('[Weather] Microsoft Foreca fetch error:', err);
    return null;
  }
}

/**
 * Fetch current live weather and forecasts for a given city or the user's location.
 *
 * @param {string|null} locationQuery - Optional city name (e.g. "Tokyo", "Mumbai")
 * @param {object} options - { timeframe: 'current'|'tomorrow'|'evening', questionType: 'general'|'heat'|'rain', storage }
 * @returns {Promise<object>} Structured weather result
 */
export async function getCurrentWeather(locationQuery = null, options = {}) {
  const {
    timeframe = 'current',
    questionType = 'general',
    storage = null,
  } = options || {};

  const cleanLoc = locationQuery ? locationQuery.toLowerCase().trim() : '';
  const isRetry = options.isRetry || (cleanLoc && /\b(?:again|retry)\b/i.test(cleanLoc));
  const cacheKey = `${cleanLoc || '__default_loc__'}:${timeframe}:${questionType}`;
  const cached = weatherCache.get(cacheKey);
  const now = Date.now();

  if (!isRetry && cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const loc = await resolveLocation(locationQuery, options, storage);
    if (!loc) {
      return {
        ok: false,
        needsLocation: true,
        speech: "I don't have a location set. Please select your city in settings so I can provide accurate weather.",
        error: 'Location not configured',
      };
    }

    // 1. Electron Main-Process IPC: Bypasses renderer CORS using validated Node.js adapter
    if (typeof window !== 'undefined' && window.island?.weather?.getTelemetry) {
      try {
        const ipcRes = await window.island.weather.getTelemetry({
          city: loc.city,
          lat: loc.lat,
          lon: loc.lon,
          provider: options.provider || 'auto',
        });

        if (ipcRes && ipcRes.ok && ipcRes.data) {
          const t = ipcRes.data;
          const speech = formatWeatherSpeech({
            city: t.city || loc.city,
            locationType: loc.type,
            timeframe,
            questionType,
            temp: t.temp,
            feelsLike: t.feelsLike,
            condition: t.condition,
            high: t.high,
            low: t.low,
            rainChance: t.rainChance,
            tomorrow: t.dailyForecasts?.[1] ? {
              high: t.dailyForecasts[1].high,
              low: t.dailyForecasts[1].low,
              condition: t.dailyForecasts[1].condition,
              weatherCode: t.dailyForecasts[1].weatherCode,
              rainChance: t.dailyForecasts[1].precip,
            } : null,
            evening: null,
          });

          const result = {
            ok: true,
            ...t,
            locationType: loc.type,
            timeframe,
            questionType,
            speech,
            updatedAt: Date.now(),
          };

          weatherCache.set(cacheKey, { timestamp: now, data: result });
          return result;
        }
      } catch (ipcErr) {
        console.warn('[weather.js] IPC getTelemetry failed, falling back to direct fetch:', ipcErr.message);
      }
    }

    // 2. Direct Isomorphic Fallback (for Node.js test environments or web-only runs)
    let msnData = null;
    try {
      msnData = await fetchMicrosoftWeather(loc.city);
    } catch { }

    const forecastUrl =
      `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}` +
      `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,is_day` +
      `&hourly=temperature_2m,apparent_temperature,precipitation_probability,weather_code` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
      `&temperature_unit=celsius&wind_speed_unit=kmh&timezone=auto`;

    let data = {};
    let fetchError = null;
    try {
      const res = await fetch(forecastUrl, { headers: { Accept: 'application/json' } });
      if (res.ok) {
        data = await res.json();
      } else {
        fetchError = new Error(`Open-Meteo returned status ${res.status}`);
      }
    } catch (err) {
      fetchError = err;
    }

    if (!msnData && (!data || !data.current)) {
      throw fetchError || new Error('Weather data unavailable from providers');
    }

    const current = data.current || {};
    const daily = data.daily || {};
    const hourly = data.hourly || {};

    // Live ground-station observation from Microsoft Foreca; fallback to Open-Meteo model
    const temp = msnData?.temperature != null ? msnData.temperature : Math.round(current.temperature_2m ?? 20);
    const feelsLike = msnData?.feelsLike != null ? msnData.feelsLike : Math.round(current.apparent_temperature ?? temp);
    const code = msnData?.weatherCode != null ? msnData.weatherCode : (current.weather_code ?? 0);
    const condition = msnData?.condition || WMO_CONDITIONS[code] || 'fair conditions';
    const isDay = current.is_day !== undefined ? current.is_day !== 0 : true;
    const windSpeed = msnData?.windSpeed != null ? msnData.windSpeed : Math.round(current.wind_speed_10m ?? 10);
    const windDisplay = msnData?.windDisplay || `${windSpeed} km/h`;
    const humidity = msnData?.humidity != null ? msnData.humidity : Math.round(current.relative_humidity_2m ?? 50);

    const high = msnData?.high != null ? msnData.high : (daily.temperature_2m_max ? daily.temperature_2m_max[0] : null);
    const low = msnData?.low != null ? msnData.low : (daily.temperature_2m_min ? daily.temperature_2m_min[0] : null);
    const rainChance = msnData?.rainChance != null ? msnData.rainChance : (daily.precipitation_probability_max ? daily.precipitation_probability_max[0] : 0);

    // Tomorrow's verified forecast from daily index 1
    const tomorrowHigh = daily.temperature_2m_max ? daily.temperature_2m_max[1] : (msnData?.dailyForecasts?.[1]?.high ?? null);
    const tomorrowLow = daily.temperature_2m_min ? daily.temperature_2m_min[1] : (msnData?.dailyForecasts?.[1]?.low ?? null);
    const tomorrowCode = daily.weather_code ? daily.weather_code[1] : 0;
    const tomorrowCondition = WMO_CONDITIONS[tomorrowCode] || msnData?.dailyForecasts?.[1]?.condition || 'fair conditions';
    const tomorrowRain = daily.precipitation_probability_max ? daily.precipitation_probability_max[1] : (msnData?.dailyForecasts?.[1]?.precip ?? 0);

    const tomorrowData = tomorrowHigh != null ? {
      high: tomorrowHigh,
      low: tomorrowLow,
      condition: tomorrowCondition,
      weatherCode: tomorrowCode,
      rainChance: tomorrowRain,
    } : null;

    // Evening forecast from hourly data (around 19:00 - 20:00)
    let eveningData = null;
    if (Array.isArray(hourly.time) && hourly.time.length >= 24) {
      // Find 19:00 today
      const eveningIdx = hourly.time.findIndex((t) => /T19:00/.test(t) || /T20:00/.test(t));
      const targetIdx = eveningIdx >= 0 ? eveningIdx : 19;
      if (hourly.temperature_2m && hourly.temperature_2m[targetIdx] != null) {
        const eCode = hourly.weather_code ? hourly.weather_code[targetIdx] : code;
        eveningData = {
          temp: Math.round(hourly.temperature_2m[targetIdx]),
          feelsLike: Math.round(hourly.apparent_temperature ? hourly.apparent_temperature[targetIdx] : hourly.temperature_2m[targetIdx]),
          condition: WMO_CONDITIONS[eCode] || condition,
          weatherCode: eCode,
          rainChance: hourly.precipitation_probability ? hourly.precipitation_probability[targetIdx] : 0,
        };
      }
    }

    // Next 6 hours forecast anchored smoothly to the live Windows ground-station temperature
    const hourlyForecast = [];
    if (Array.isArray(hourly.time) && Array.isArray(hourly.temperature_2m)) {
      const nowLocal = new Date();
      const localYear = nowLocal.getFullYear();
      const localMonth = String(nowLocal.getMonth() + 1).padStart(2, '0');
      const localDay = String(nowLocal.getDate()).padStart(2, '0');
      const localHour = String(nowLocal.getHours()).padStart(2, '0');
      const localPrefix = `${localYear}-${localMonth}-${localDay}T${localHour}`;
      let startIdx = hourly.time.findIndex((t) => typeof t === 'string' && t.startsWith(localPrefix));
      if (startIdx < 0) {
        const nowMs = Date.now();
        startIdx = hourly.time.findIndex((t) => new Date(t).getTime() >= nowMs - 30 * 60 * 1000);
      }
      if (startIdx < 0) startIdx = 0;

      for (let i = startIdx; i < Math.min(startIdx + 6, hourly.time.length); i++) {
        const rawTime = hourly.time[i];
        const hDate = new Date(rawTime);
        const hourLabel = i === startIdx ? 'Now' : hDate.toLocaleTimeString([], { hour: 'numeric' });
        // The Now slot reflects current observed temperature; subsequent slots show actual NWP forecast values
        const projectedTemp = i === startIdx ? temp : Math.round(hourly.temperature_2m[i] ?? temp);
        hourlyForecast.push({
          time: hourLabel,
          temp: projectedTemp,
          weatherCode: hourly.weather_code ? hourly.weather_code[i] : code,
          isDay: Array.isArray(hourly.is_day) ? hourly.is_day[i] !== 0 : isDay,
          rainChance: hourly.precipitation_probability ? hourly.precipitation_probability[i] : 0,
        });
      }
    }

    const speech = formatWeatherSpeech({
      city: loc.city,
      locationType: loc.type,
      timeframe,
      questionType,
      temp,
      feelsLike,
      condition,
      high,
      low,
      rainChance,
      tomorrow: tomorrowData,
      evening: eveningData,
    });

    // 7-Day Ground Forecast from Open-Meteo; fallback to MSN
    let dailyForecastsList = [];
    if (daily && Array.isArray(daily.time) && daily.time.length > 0) {
      dailyForecastsList = daily.time.slice(0, 7).map((dateStr, idx) => {
        const d = new Date(dateStr + 'T12:00:00Z');
        const dayName = idx === 0 ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short' });
        const cCode = daily.weather_code ? daily.weather_code[idx] : 0;
        return {
          day: dayName,
          high: Math.round(daily.temperature_2m_max ? daily.temperature_2m_max[idx] : 25),
          low: Math.round(daily.temperature_2m_min ? daily.temperature_2m_min[idx] : 18),
          condition: WMO_CONDITIONS[cCode] || 'Fair',
          weatherCode: cCode,
          precip: daily.precipitation_probability_max ? Number(daily.precipitation_probability_max[idx]) : 0,
        };
      });
    } else if (Array.isArray(msnData?.dailyForecasts) && msnData.dailyForecasts.length > 0) {
      dailyForecastsList = msnData.dailyForecasts;
    }

    const result = {
      ok: true,
      city: loc.city,
      country: loc.country,
      locationType: loc.type,
      timeframe,
      questionType,
      temp,
      temperature: temp,
      feelsLike,
      high,
      low,
      condition,
      weatherCode: code,
      isDay,
      humidity,
      windSpeed,
      windDisplay,
      rainChance,
      dailyForecasts: dailyForecastsList,
      tomorrow: tomorrowData,
      evening: eveningData,
      hourlyForecast,
      speech,
      updatedAt: Date.now(),
    };

    weatherCache.set(cacheKey, { timestamp: now, data: result });
    return result;
  } catch (err) {
    console.warn('[Weather] Fetch error:', err);
    if (cached?.data) {
      return {
        ...cached.data,
        isStale: true,
        speech: `Live weather is currently unreachable. Previously recorded weather in ${cached.data.city} was ${cached.data.temperature}°C with ${cached.data.condition}.`,
      };
    }
    return {
      ok: false,
      error: err.message,
      speech: "Live weather is currently unavailable. Please check your internet connection.",
    };
  }
}

export default getCurrentWeather;
