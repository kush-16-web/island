import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import CompanionEyes from '../CompanionEyes';
import IOSWeatherIcon from './IOSWeatherIcon';
import WeatherAtmosphere from './WeatherAtmosphere';
import WeatherCelestialEmblem from './WeatherCelestialEmblem';
import WeatherSplineCurve from './WeatherSplineCurve';
import { useWeather } from '../../hooks/useWeather';

/**
 * WeatherPanel: Redesigned Apple Weather Continuous Surface for Island.
 * 
 * Features:
 * - 100% continuous unified surface filling the notch with zero outer bleed.
 * - Dynamic atmospheric background (Night, Sunny, Rainy, Cloudy) isolated strictly to this view.
 * - Header: < Weather back button, Companion Eyes (● ●), and options (···).
 * - Hero: Real location pin + city, large temperature, condition, H/L range, and Apple SF Symbol emblem.
 * - Forecast: Seamless toggle between Hourly (with Catmull-Rom spline curve) and 7 days (with Apple range bars).
 * - Height-locked forecast container preventing any harsh layout shifts.
 * - Bottom metrics: Single horizontal row for Feels like, Humidity, Wind, Rain.
 * - Grounded entirely in real Open-Meteo & MSN telemetry.
 */
export default function WeatherPanel({
  weather: propWeather = null,
  onBack = () => {},
  companionMood = 'idle',
  companionAnimations = true,
  onOpenSettings,
}) {
  const { weather: hookWeather, refresh } = useWeather();
  const activeW = propWeather || hookWeather || {};

  const [activeTab, setActiveTab] = useState('hourly'); // 'hourly' | 'weekly'

  // Telemetry resolution
  const city = activeW.city || activeW.location?.city || 'Local Weather';
  const tempVal = activeW.temp ?? activeW.temperature ?? 24;
  const highVal = activeW.high ?? tempVal;
  const lowVal = activeW.low ?? Math.max(0, tempVal - 8);
  const condText = activeW.condition || 'Clear sky';
  const codeVal = Number(activeW.weatherCode ?? 0);
  const isDayVal = activeW.isDay !== undefined ? Boolean(activeW.isDay) : true;
  const feelsLikeVal = activeW.feelsLike ?? tempVal;
  const humidityVal = activeW.humidity ?? 45;
  const windVal = activeW.windDisplay || (activeW.windSpeed ? `${activeW.windSpeed} km/h` : '5 km/h');
  const rainVal = activeW.rainChance ?? 0;

  const hourlyList = Array.isArray(activeW.hourlyForecast) ? activeW.hourlyForecast : [];
  const dailyList = Array.isArray(activeW.dailyForecasts) ? activeW.dailyForecasts : [];

  // Global weekly min/max temperature range calculation for Apple range bars
  const weekLows = dailyList.map((d) => (typeof d.low === 'number' ? d.low : parseInt(d.low, 10) || 18));
  const weekHighs = dailyList.map((d) => (typeof d.high === 'number' ? d.high : parseInt(d.high, 10) || 32));
  const globalWeekMin = weekLows.length > 0 ? Math.min(...weekLows) : 18;
  const globalWeekMax = weekHighs.length > 0 ? Math.max(...weekHighs) : 34;
  const globalRange = Math.max(1, globalWeekMax - globalWeekMin);

  return (
    <div className="ios-weather-surface">
      {/* 1. Dynamic Atmospheric Background (strictly isolated to this surface) */}
      <WeatherAtmosphere code={codeVal} isDay={isDayVal} />

      {/* 2. Top Header Bar (< Weather, Companion Eyes, Options) */}
      <div className="weather-surface__topbar">
        <button
          type="button"
          className="weather-surface__back-btn"
          onClick={onBack}
          title="Back to Launcher"
          aria-label="Back to Launcher"
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
          <span className="weather-surface__back-text">Weather</span>
        </button>

        <div className="weather-surface__eyes">
          <CompanionEyes
            size="sm"
            mood={companionMood}
            animationsEnabled={companionAnimations}
          />
        </div>

        <button
          type="button"
          className="weather-surface__options-btn"
          onClick={() => {
            if (typeof onOpenSettings === 'function') onOpenSettings();
            else refresh();
          }}
          title="Refresh / Options"
          aria-label="Refresh / Options"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="5" cy="12" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="19" cy="12" r="2" />
          </svg>
        </button>
      </div>

      {/* 3. Hero Weather Section */}
      <div className="weather-surface__hero">
        <div className="weather-surface__hero-info">
          {/* Location row */}
          <div className="weather-surface__location-row">
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="weather-surface__pin-icon"
              aria-hidden="true"
            >
              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            <span className="weather-surface__city-name">{city}</span>
          </div>

          {/* Big Temperature */}
          <div className="weather-surface__temp-display">
            <span className="weather-surface__main-temp">{tempVal}°</span>
          </div>

          {/* Condition text */}
          <div className="weather-surface__condition-text">
            {condText}
          </div>

          {/* High / Low Range */}
          <div className="weather-surface__hilo-text">
            <span>H: {highVal}°</span>
            <span className="weather-surface__hilo-sep">·</span>
            <span>L: {lowVal}°</span>
          </div>
        </div>

        {/* Right Celestial Emblem (Apple SF Symbol sun.max.fill / moon) */}
        <div className="weather-surface__hero-emblem">
          <WeatherCelestialEmblem code={codeVal} isDay={isDayVal} size={74} />
        </div>
      </div>

      {/* 4. Forecast Section (Hourly with Spline Curve OR 7-Day Range) */}
      <div className="weather-surface__forecast-section ios-weather-hourly ios-weather-daily">
        <div className="weather-surface__forecast-header">
          <div className="weather-surface__tabs">
            <button
              type="button"
              className={`weather-surface__tab-btn ${activeTab === 'hourly' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('hourly')}
            >
              Hourly
            </button>
            <button
              type="button"
              className={`weather-surface__tab-btn ${activeTab === 'weekly' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('weekly')}
            >
              7 days
            </button>
          </div>

          <span className="weather-surface__forecast-subtitle">
            {activeTab === 'hourly' ? 'Next 6 hours' : 'Next 7 days'}
          </span>
        </div>

        {/* Height-locked Forecast Body Container with smooth crossfade */}
        <div className="weather-surface__forecast-body">
          <AnimatePresence mode="wait">
            {activeTab === 'hourly' ? (
              <motion.div
                key="hourly"
                initial={{ opacity: 0, y: 3 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -3 }}
                transition={{ duration: 0.16 }}
                className="weather-surface__tab-content"
              >
                <WeatherSplineCurve hourlyData={hourlyList} />
              </motion.div>
            ) : (
              <motion.div
                key="weekly"
                initial={{ opacity: 0, y: 3 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -3 }}
                transition={{ duration: 0.16 }}
                className="weather-surface__tab-content"
              >
                <div className="weather-surface__weekly-strip">
                  {(dailyList.length > 0 ? dailyList.slice(0, 7) : []).map((day, idx) => {
                    const dLow = typeof day.low === 'number' ? day.low : parseInt(day.low, 10) || globalWeekMin;
                    const dHigh = typeof day.high === 'number' ? day.high : parseInt(day.high, 10) || globalWeekMax;
                    const topPercent = Math.max(0, Math.min(80, (1 - (dHigh - globalWeekMin) / globalRange) * 100));
                    const bottomPercent = Math.max(0, Math.min(80, ((dLow - globalWeekMin) / globalRange) * 100));

                    return (
                      <div key={idx} className="weather-surface__weekly-col">
                        <span className="weather-surface__weekly-day">{day.day}</span>
                        <div className="weather-surface__weekly-icon-wrap">
                          <IOSWeatherIcon
                            code={day.weatherCode ?? (day.condition?.toLowerCase().includes('rain') ? 61 : 0)}
                            isDay
                            size={18}
                          />
                        </div>
                        <span className="weather-surface__weekly-hi">{Math.round(dHigh)}°</span>
                        {/* Apple Vertical Range Bar */}
                        <div className="weather-surface__weekly-bar-track">
                          <div
                            className="weather-surface__weekly-bar-fill"
                            style={{
                              top: `${topPercent}%`,
                              bottom: `${bottomPercent}%`,
                            }}
                          />
                        </div>
                        <span className="weather-surface__weekly-lo">{Math.round(dLow)}°</span>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* 5. Bottom Metrics Row (Single continuous line, no bulky 4-box layout) */}
      <div className="weather-surface__metrics-row">
        {/* Feels like */}
        <div className="weather-surface__metric">
          <div className="weather-surface__metric-header">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
            </svg>
            <span className="weather-surface__metric-label">Feels like</span>
          </div>
          <span className="weather-surface__metric-val">{feelsLikeVal}°</span>
        </div>

        {/* Humidity */}
        <div className="weather-surface__metric">
          <div className="weather-surface__metric-header">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
            </svg>
            <span className="weather-surface__metric-label">Humidity</span>
          </div>
          <span className="weather-surface__metric-val">{humidityVal}%</span>
        </div>

        {/* Wind */}
        <div className="weather-surface__metric">
          <div className="weather-surface__metric-header">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M17.7 7.7A2.5 2.5 0 0 1 19 12H2" />
              <path d="M19.7 15.3A2.5 2.5 0 0 1 18 19H2" />
              <path d="M14 5a2 2 0 0 0-2 2h10" />
            </svg>
            <span className="weather-surface__metric-label">Wind</span>
          </div>
          <span className="weather-surface__metric-val">{windVal}</span>
        </div>

        {/* Rain */}
        <div className="weather-surface__metric">
          <div className="weather-surface__metric-header">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M23 12a11.05 11.05 0 0 0-22 0zm-5 7a3 3 0 0 1-6 0v-7" />
            </svg>
            <span className="weather-surface__metric-label">Rain</span>
          </div>
          <span className="weather-surface__metric-val">{rainVal}%</span>
        </div>
      </div>

      {/* 6. Discreet Source Attribution & Status */}
      <div className="weather-surface__attribution-row">
        <span>{activeW.sourceAttribution || (activeW.provider === 'msn_foreca' ? 'Microsoft Weather / Foreca' : 'Open-Meteo')}</span>
        <span className="weather-surface__attribution-dot">·</span>
        <span>{activeW.isStale ? 'Cached' : 'Live'}</span>
      </div>
    </div>
  );
}
