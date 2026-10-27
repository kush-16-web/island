import React from 'react';
import { Icon } from '../icons';

/**
 * Map WMO weather codes and day/night to clean Lucide monochrome line icons.
 */
function getWeatherIcon(code, isDay = true) {
  const c = Number(code) || 0;
  if (c === 0) return isDay ? Icon.Sun : Icon.Moon;
  if (c <= 3) return Icon.Cloud;
  if (c === 45 || c === 48) return Icon.CloudFog;
  if (c >= 51 && c <= 55) return Icon.CloudDrizzle;
  if ((c >= 61 && c <= 65) || (c >= 80 && c <= 82)) return Icon.CloudRain;
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return Icon.CloudSnow;
  if (c >= 95) return Icon.CloudLightning;
  return Icon.Cloud;
}

/**
 * InlineWeather: Minimal, elegant weather presentation for Island.
 * Adheres strictly to Pass 2.2.8.2:
 * - Reject CRM-style metric cards, borders around every number, and double-glass.
 * - Hierarchy:
 *   1. Location and weather condition
 *   2. Large temperature & subtle icon
 *   3. High/low & feels-like
 *   4. Compact forecast (if tomorrow/evening requested)
 *   5. Secondary humidity / wind (only real values, never missing zeroes)
 */
export default function InlineWeather({ weather }) {
  if (!weather || typeof weather !== 'object') return null;

  const {
    city = 'Your Area',
    country = '',
    locationType = 'explicit',
    timeframe = 'current',
    temperature,
    feelsLike,
    high,
    low,
    condition = 'Clear',
    weatherCode = 0,
    isDay = true,
    humidity,
    windSpeed,
    rainChance,
    tomorrow,
    evening,
  } = weather;

  const isForecast = timeframe === 'tomorrow' && tomorrow;
  const isEveningForecast = timeframe === 'evening' && evening;

  const displayTemp = isForecast
    ? Math.round(tomorrow.high ?? 20)
    : isEveningForecast
    ? Math.round(evening.temp ?? 20)
    : temperature != null
    ? Math.round(temperature)
    : null;

  const displayCondition = isForecast
    ? tomorrow.condition
    : isEveningForecast
    ? evening.condition
    : condition;

  const displayCode = isForecast
    ? tomorrow.weatherCode
    : isEveningForecast
    ? evening.weatherCode
    : weatherCode;

  const WeatherIcon = getWeatherIcon(displayCode, isForecast ? true : isDay);

  // Format high/low
  const effHigh = isForecast && tomorrow ? tomorrow.high : high;
  const effLow = isForecast && tomorrow ? tomorrow.low : low;
  const effFeelsLike = isForecast ? null : isEveningForecast && evening ? evening.feelsLike : feelsLike;

  return (
    <div className="minimal-weather" role="region" aria-label="Live Weather">
      {/* 1. Location */}
      <div className="minimal-weather__header">
        <div className="minimal-weather__location">
          <span className="minimal-weather__city">{city}</span>
          {country ? <span className="minimal-weather__country">, {country}</span> : null}
          {locationType === 'approximate_ip' && (
            <span className="minimal-weather__approx" title="Approximate IP location">approx</span>
          )}
        </div>
      </div>

      {/* 2. Large Temperature & Minimal Line Icon */}
      {displayTemp != null && (
        <div className="minimal-weather__hero">
          <span className="minimal-weather__temp">{displayTemp}°</span>
          <div className="minimal-weather__icon-wrap" aria-hidden="true">
            <WeatherIcon width={24} height={24} className="minimal-weather__icon" />
          </div>
        </div>
      )}

      {/* 3. Condition */}
      <div className="minimal-weather__condition">{displayCondition}</div>

      {/* 4. Feels Like, High, Low Editorial Sub-row */}
      {(effHigh != null || effLow != null || effFeelsLike != null) && (
        <div className="minimal-weather__sub-row">
          {effFeelsLike != null && <span>Feels {Math.round(effFeelsLike)}°</span>}
          {effFeelsLike != null && (effHigh != null || effLow != null) && <span className="minimal-weather__dot">·</span>}
          {effHigh != null && <span>High {Math.round(effHigh)}°</span>}
          {effHigh != null && effLow != null && <span className="minimal-weather__dot">·</span>}
          {effLow != null && <span>Low {Math.round(effLow)}°</span>}
        </div>
      )}

      {/* 5. Compact Hourly Row (if available) */}
      {Array.isArray(weather.hourly) && weather.hourly.length > 0 && (
        <div className="minimal-weather__hourly-strip">
          {weather.hourly.slice(0, 4).map((h, i) => {
            const HIcon = getWeatherIcon(h.weatherCode ?? displayCode, h.isDay ?? isDay);
            return (
              <div key={i} className="minimal-weather__hourly-item">
                <span className="minimal-weather__hourly-time">{h.time || (i === 0 ? 'Now' : `+${i * 2}h`)}</span>
                <HIcon width={16} height={16} className="minimal-weather__hourly-icon" />
                <span className="minimal-weather__hourly-temp">{Math.round(h.temp ?? h.temperature ?? displayTemp)}°</span>
              </div>
            );
          })}
        </div>
      )}

      {/* 6. Compact Tomorrow Forecast (if secondary timeframe available and no hourly) */}
      {(!weather.hourly || weather.hourly.length === 0) && !isForecast && tomorrow && (
        <div className="minimal-weather__forecast-row">
          <span className="minimal-weather__forecast-day">Tomorrow</span>
          <span className="minimal-weather__forecast-summary">
            {Math.round(tomorrow.high)}° / {Math.round(tomorrow.low)}° · {tomorrow.condition}
          </span>
        </div>
      )}

      {/* 7. Secondary Metrics (only non-null real data, no fake zeroes) */}
      {(humidity != null || windSpeed != null || (rainChance != null && rainChance > 0)) && (
        <div className="minimal-weather__meta-row">
          {humidity != null && (
            <span className="minimal-weather__metric">Humidity {humidity}%</span>
          )}
          {humidity != null && windSpeed != null && <span className="minimal-weather__dot">·</span>}
          {windSpeed != null && (
            <span className="minimal-weather__metric">Wind {windSpeed} km/h</span>
          )}
          {((humidity != null || windSpeed != null) && rainChance != null && rainChance > 0) && <span className="minimal-weather__dot">·</span>}
          {rainChance != null && rainChance > 0 && (
            <span className="minimal-weather__metric">Rain {rainChance}%</span>
          )}
        </div>
      )}
    </div>
  );
}
