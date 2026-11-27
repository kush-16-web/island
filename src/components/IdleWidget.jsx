import React from 'react';
import { IOSWeatherIcon } from './weather/IOSWeatherIcon';

function formatClock(dateOrMs) {
  const d = dateOrMs instanceof Date ? dateOrMs : new Date(dateOrMs);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatDate(dateOrMs) {
  const d = dateOrMs instanceof Date ? dateOrMs : new Date(dateOrMs);
  const weekday = d.toLocaleDateString(undefined, { weekday: 'short' });
  const day = d.getDate();
  const month = d.toLocaleDateString(undefined, { month: 'short' });
  return `${weekday} ${day} ${month}`;
}

export function IdleWidget({
  type = 'none',
  now = Date.now(),
  weather = null,
  battery = { level: 85, charging: false },
  cpuPercent = 14,
  taskStats = { ratio: '2/7', completed: 2, total: 7 },
  activeTimer = null,
  compact = false,
}) {
  if (!type || type === 'none') return null;

  switch (type) {
    case 'clock':
      return (
        <span className="idle-widget idle-widget--clock idle__time" title="System Time">
          {formatClock(now)}
        </span>
      );

    case 'date':
      return (
        <span className="idle-widget idle-widget--date idle__date" title="Today">
          <svg
            className="idle-widget__icon"
            viewBox="0 0 16 16"
            width={12}
            height={12}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="2" y="3.5" width="12" height="10.5" rx="2.5" />
            <path d="M2 7h12" />
            <path d="M5 2v2.5M11 2v2.5" />
          </svg>
          <span>{compact ? new Date(now).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : formatDate(now)}</span>
        </span>
      );

    case 'weather': {
      const temp = weather && (weather.temperature != null || weather.temp != null)
        ? Math.round(weather.temperature ?? weather.temp)
        : null;
      const code = weather?.weatherCode ?? 0;
      const isDay = weather?.isDay ?? true;
      return (
        <span className="idle-widget idle-widget--weather idle__weather" title="Local Weather">
          <IOSWeatherIcon code={code} isDay={isDay} size={15} />
          <span className="idle-widget__temp">{temp != null ? `${temp}°` : '--°'}</span>
        </span>
      );
    }

    case 'battery': {
      const level = Math.max(0, Math.min(100, Math.round(battery?.level ?? 85)));
      const isCharging = Boolean(battery?.charging);
      const isLow = level <= 20 && !isCharging;
      return (
        <span
          className={`idle-widget idle-widget--battery ios-battery ${isCharging ? 'ios-battery--charging' : ''} ${isLow ? 'ios-battery--low' : ''}`}
          title={`Battery: ${level}%${isCharging ? ' (Charging)' : ''}`}
        >
          <span className="ios-battery__capsule">
            <span
              className="ios-battery__fill"
              style={{ width: `${Math.max(4, level)}%` }}
            />
            <span className={`ios-battery__label ${level >= 45 || isCharging ? 'ios-battery__label--dark' : 'ios-battery__label--light'}`}>
              {isCharging && (
                <svg
                  className="ios-battery__bolt"
                  viewBox="0 0 10 14"
                  width={5.5}
                  height={8}
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M5.5 0L0 7.5H4L3 14L10 5.5H5.5L6.5 0H5.5Z" />
                </svg>
              )}
              <span>{level}</span>
            </span>
            <span className="ios-battery__cap" />
          </span>
        </span>
      );
    }

    case 'timer': {
      const timerText = activeTimer
        ? (activeTimer.display || `${Math.floor(activeTimer.remaining / 60)}:${String(activeTimer.remaining % 60).padStart(2, '0')}`)
        : '--:--';
      return (
        <span className="idle-widget idle-widget--timer" title="Active Timer">
          <svg
            className="idle-widget__icon"
            viewBox="0 0 16 16"
            width={12}
            height={12}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="8" cy="8.5" r="5.5" />
            <path d="M8 5.5v3l2 1" />
            <path d="M7 1.5h2" />
          </svg>
          <span>{timerText}</span>
        </span>
      );
    }

    case 'cpu': {
      const cpu = Math.max(1, Math.min(100, Math.round(cpuPercent ?? 14)));
      return (
        <span className="idle-widget idle-widget--cpu" title={`CPU Usage: ${cpu}%`}>
          <svg
            className="idle-widget__icon"
            viewBox="0 0 16 16"
            width={12}
            height={12}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="3.5" y="3.5" width="9" height="9" rx="1.5" />
            <path d="M6 1.5v2M10 1.5v2M6 12.5v2M10 12.5v2M1.5 6h2M1.5 10h2M12.5 6h2M12.5 10h2" />
          </svg>
          <span>{cpu}%</span>
        </span>
      );
    }

    case 'tasks': {
      const ratio = taskStats?.ratio || '2/7';
      return (
        <span className="idle-widget idle-widget--tasks" title={`Tasks: ${taskStats?.completed ?? 2}/${taskStats?.total ?? 7} completed`}>
          <svg
            className="idle-widget__icon"
            viewBox="0 0 16 16"
            width={12}
            height={12}
            fill="none"
            stroke="#10b981"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M3 8.5l3.5 3.5 6.5-7" />
          </svg>
          <span>{ratio}</span>
        </span>
      );
    }

    default:
      return null;
  }
}

export default IdleWidget;
