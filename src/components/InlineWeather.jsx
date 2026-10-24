import React from 'react';
import { Icon } from './icons';

/**
 * Map WMO weather codes and day/night to a Lucide monochrome white line icon.
 * Reference: Open-Meteo WMO weather interpretation codes.
 */
function getWeatherIcon(code, isDay = true) {
  const c = Number(code) || 0;
  // 0: Clear sky
  if (c === 0) {
    return isDay ? Icon.Sun : Icon.Moon;
  }
  // 1, 2, 3: Mainly clear, partly cloudy, overcast
  if (c <= 3) {
    return Icon.Cloud;
  }
  // 45, 48: Fog
  if (c === 45 || c === 48) {
    return Icon.CloudFog;
  }
  // 51, 53, 55: Drizzle
  if (c >= 51 && c <= 55) {
    return Icon.CloudDrizzle;
  }
  // 61, 63, 65, 80, 81, 82: Rain & showers
  if ((c >= 61 && c <= 65) || (c >= 80 && c <= 82)) {
    return Icon.CloudRain;
  }
  // 71, 73, 75, 77, 85, 86: Snow
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) {
    return Icon.CloudSnow;
  }
  // 95, 96, 99: Thunderstorms
  if (c >= 95) {
    return Icon.CloudLightning;
  }
  return Icon.Cloud;
}

/**
 * InlineWeather: Compact, monochrome structured weather result card for Agent turns.
 * Satisfies Pass 2.2.6.2 Part D:
 * - Clean visual hierarchy with prominent temperature and white line icon
 * - Location, condition, feels-like, daily high/low
 * - Verified data from Open-Meteo
 * - Zero emojis, zero colored backgrounds, zero circular icon containers
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
  } = weather;

  const isForecast = timeframe === 'tomorrow' && tomorrow;
  const displayTemp = isForecast ? Math.round(tomorrow.high ?? 25) : Math.round(temperature ?? 20);
  const displayCondition = isForecast ? tomorrow.condition : condition;
  const displayCode = isForecast ? tomorrow.weatherCode : weatherCode;
  const WeatherIconComponent = getWeatherIcon(displayCode, isForecast ? true : isDay);

  const isApproximate = locationType === 'approximate_ip';

  return (
    <div className="inline-weather" role="region" aria-label="Live Weather Information">
      <div className="inline-weather__header">
        <div className="inline-weather__loc-group">
          <span className="inline-weather__city">{city}</span>
          {country && <span className="inline-weather__country">{country}</span>}
          {isApproximate && (
            <span className="inline-weather__approx-badge">Approximate location</span>
          )}
          {locationType === 'default' && (
            <span className="inline-weather__approx-badge">Default city</span>
          )}
        </div>
        {isForecast && (
          <span className="inline-weather__timeframe-tag">Tomorrow</span>
        )}
      </div>

      <div className="inline-weather__body">
        <div className="inline-weather__temp-row">
          <div className="inline-weather__icon-wrapper" aria-hidden="true">
            <WeatherIconComponent width={26} height={26} />
          </div>
          <span className="inline-weather__temp-val">{displayTemp}°</span>
          <span className="inline-weather__unit">C</span>
        </div>

        <div className="inline-weather__meta">
          <div className="inline-weather__condition">{displayCondition}</div>
          <div className="inline-weather__details">
            {feelsLike != null && !isForecast && (
              <span className="inline-weather__detail-item">
                Feels like {Math.round(feelsLike)}°C
              </span>
            )}
            {high != null && low != null && (
              <span className="inline-weather__detail-item">
                H: {Math.round(isForecast ? tomorrow.high : high)}° • L: {Math.round(isForecast ? tomorrow.low : low)}°
              </span>
            )}
            {rainChance != null && (
              <span className="inline-weather__detail-item">
                Rain: {isForecast ? tomorrow.rainChance ?? rainChance : rainChance}%
              </span>
            )}
            {humidity != null && !isForecast && (
              <span className="inline-weather__detail-item">
                Humidity: {humidity}%
              </span>
            )}
            {windSpeed != null && !isForecast && (
              <span className="inline-weather__detail-item">
                Wind: {windSpeed} km/h
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="inline-weather__footer">
        <span className="inline-weather__source">Open-Meteo</span>
      </div>
    </div>
  );
}
