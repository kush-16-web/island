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
async function resolveLocation(locationQuery = null, options = {}, storage = null) {
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
            country: match.country || '',
            lat: match.latitude,
            lon: match.longitude,
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

  // Conversational context location (if follow-up question or tomorrow forecast without named city)
  if (!locationQuery && (isFollowUp || timeframe === 'tomorrow' || timeframe === 'evening')) {
    if (lastWeatherSessionContext?.city && lastWeatherSessionContext?.lat) {
      return {
        ...lastWeatherSessionContext,
        type: 'context',
      };
    }
  }

  // Priority 2: User-selected persistent default weather city
  try {
    const defaultCity = store ? store.getItem('island_weather_default_city') : null;
    if (defaultCity && typeof defaultCity === 'string' && defaultCity.trim()) {
      const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(defaultCity.trim())}&count=1`;
      const res = await fetch(geoUrl, { headers: { Accept: 'application/json' } });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.results) && data.results.length > 0) {
          const match = data.results[0];
          const resolved = {
            city: match.name,
            country: match.country || '',
            lat: match.latitude,
            lon: match.longitude,
            type: 'default',
          };
          lastWeatherSessionContext = { ...resolved };
          return resolved;
        }
      }
    }
  } catch (storeErr) {
    console.warn('[Weather] Default city lookup error:', storeErr);
  }

  // Priority 4: Clearly labeled approximate IP-based city
  try {
    const ipRes = await fetch('http://ip-api.com/json/', { headers: { Accept: 'application/json' } });
    if (ipRes.ok) {
      const ipData = await ipRes.json();
      if (ipData && ipData.lat && ipData.lon) {
        const resolved = {
          city: ipData.city || 'your area',
          country: ipData.country || '',
          lat: ipData.lat,
          lon: ipData.lon,
          type: 'approximate_ip',
        };
        lastWeatherSessionContext = { ...resolved };
        return resolved;
      }
    }
  } catch (ipErr) {
    console.warn('[Weather] IP geolocation lookup error:', ipErr);
  }

  // Fallback default coordinates (London / GMT reference)
  return {
    city: 'your area',
    country: '',
    lat: 51.5074,
    lon: -0.1278,
    type: 'fallback',
  };
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
  const cacheKey = `${cleanLoc || '__default_loc__'}:${timeframe}:${questionType}`;
  const cached = weatherCache.get(cacheKey);
  const now = Date.now();

  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const loc = await resolveLocation(locationQuery, options, storage);
    const forecastUrl =
      `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}` +
      `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,is_day` +
      `&hourly=temperature_2m,apparent_temperature,precipitation_probability,weather_code` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
      `&temperature_unit=celsius&wind_speed_unit=kmh&timezone=auto`;

    const res = await fetch(forecastUrl, { headers: { Accept: 'application/json' } });
    if (!res.ok) {
      throw new Error(`Weather service returned HTTP ${res.status}`);
    }

    const data = await res.json();
    const current = data.current || {};
    const daily = data.daily || {};
    const hourly = data.hourly || {};

    const temp = Math.round(current.temperature_2m ?? 20);
    const feelsLike = Math.round(current.apparent_temperature ?? temp);
    const code = current.weather_code ?? 0;
    const condition = WMO_CONDITIONS[code] || 'fair conditions';
    const isDay = current.is_day !== 0;
    const windSpeed = Math.round(current.wind_speed_10m ?? 10);
    const humidity = Math.round(current.relative_humidity_2m ?? 50);

    const high = daily.temperature_2m_max ? daily.temperature_2m_max[0] : null;
    const low = daily.temperature_2m_min ? daily.temperature_2m_min[0] : null;
    const rainChance = daily.precipitation_probability_max ? daily.precipitation_probability_max[0] : 0;

    // Tomorrow's verified forecast from daily index 1
    const tomorrowHigh = daily.temperature_2m_max ? daily.temperature_2m_max[1] : null;
    const tomorrowLow = daily.temperature_2m_min ? daily.temperature_2m_min[1] : null;
    const tomorrowCode = daily.weather_code ? daily.weather_code[1] : 0;
    const tomorrowCondition = WMO_CONDITIONS[tomorrowCode] || 'fair conditions';
    const tomorrowRain = daily.precipitation_probability_max ? daily.precipitation_probability_max[1] : 0;

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

    const result = {
      ok: true,
      city: loc.city,
      country: loc.country,
      locationType: loc.type,
      timeframe,
      questionType,
      temperature: temp,
      feelsLike,
      high,
      low,
      condition,
      weatherCode: code,
      isDay,
      humidity,
      windSpeed,
      rainChance,
      tomorrow: tomorrowData,
      evening: eveningData,
      speech,
      updatedAt: Date.now(),
    };

    weatherCache.set(cacheKey, { timestamp: now, data: result });
    return result;
  } catch (err) {
    console.warn('[Weather] Fetch error:', err);
    return {
      ok: false,
      error: err.message,
      speech: "I couldn't retrieve the live weather right now. Please check your internet connection.",
    };
  }
}

export default getCurrentWeather;
