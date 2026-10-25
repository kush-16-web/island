import React from 'react';
import InlineWeather from '../InlineWeather';
import { Icon } from '../icons';

export default function WeatherCard({ weather }) {
  if (!weather || (weather.ok === false && !weather.temperature)) {
    return (
      <div className="structured-card structured-card--empty">
        <Icon.Cloud width={14} height={14} className="structured-card__icon" />
        <span className="structured-card__empty-text">
          {weather?.error || weather?.speech || 'Weather data unavailable.'}
        </span>
      </div>
    );
  }

  return (
    <div className="structured-card structured-card--weather" role="region" aria-label="Weather Details">
      <InlineWeather weather={weather} />
    </div>
  );
}
