import React from 'react';
import IOSWeatherIcon from './IOSWeatherIcon';

/**
 * Computes a smooth Catmull-Rom cubic Bezier path passing through all control points.
 */
function getCatmullRomSplinePath(points) {
  if (!points || points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? i : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2 < points.length ? i + 2 : i + 1];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

/**
 * WeatherSplineCurve: Hourly forecast strip with a continuous temperature spline curve.
 * Matches Apple Weather & Reference Image 3:
 * - 6 hourly columns (Time, Weather Icon, Temperature)
 * - Directly beneath: smooth SVG spline curve connecting dots at each data node
 * - Clean, continuous unified surface (no separate cards or borders!)
 */
export default function WeatherSplineCurve({
  hourlyData = [],
  className = '',
}) {
  // Take up to 6 hourly items (or default fallback if empty)
  const items = Array.isArray(hourlyData) && hourlyData.length > 0
    ? hourlyData.slice(0, 6)
    : [
        { time: 'Now', temp: 23, weatherCode: 0, isDay: false },
        { time: '1 PM', temp: 24, weatherCode: 0, isDay: false },
        { time: '2 PM', temp: 24, weatherCode: 0, isDay: false },
        { time: '3 PM', temp: 23, weatherCode: 0, isDay: false },
        { time: '4 PM', temp: 22, weatherCode: 0, isDay: false },
        { time: '5 PM', temp: 21, weatherCode: 0, isDay: false },
      ];

  const temps = items.map((it) => (typeof it.temp === 'number' ? it.temp : parseInt(it.temp, 10) || 20));
  const minTemp = Math.min(...temps);
  const maxTemp = Math.max(...temps);
  const tempRange = maxTemp - minTemp;

  // ViewBox coordinates precisely aligned to 6 column flex centers
  const svgWidth = 480;
  const svgHeight = 36;
  const numItems = Math.max(1, items.length);

  const points = items.map((it, idx) => {
    // Exact geometric column center: ((idx + 0.5) / numItems) * svgWidth
    const x = ((idx + 0.5) / numItems) * svgWidth;
    let y = svgHeight / 2;
    if (tempRange > 0) {
      // Inverted Y: higher temp = smaller y (higher on the canvas)
      // Generous 8px top and 8px bottom safety padding so curve peaks and dips never clip
      const ratio = (temps[idx] - minTemp) / tempRange;
      y = 8 + (1 - ratio) * (svgHeight - 16);
    }
    return { x, y, temp: temps[idx] };
  });

  const splinePath = getCatmullRomSplinePath(points);

  return (
    <div className={`weather-spline ${className}`.trim()}>
      {/* 6 Column forecast data strip */}
      <div className="weather-spline__columns">
        {items.map((item, idx) => (
          <div key={idx} className="weather-spline__col">
            <span className="weather-spline__time">{item.time}</span>
            <div className="weather-spline__icon-wrap">
              <IOSWeatherIcon
                code={item.weatherCode ?? 0}
                isDay={item.isDay ?? true}
                size={20}
              />
            </div>
            <span className="weather-spline__temp">{item.temp}°</span>
          </div>
        ))}
      </div>

      {/* Dynamic Temperature Spline SVG */}
      <div className="weather-spline__curve-container">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="weather-spline__svg"
          preserveAspectRatio="none"
        >
          {/* Subtle glow / gradient line */}
          <path
            d={splinePath}
            fill="none"
            stroke="rgba(255, 255, 255, 0.42)"
            strokeWidth="2"
            strokeLinecap="round"
          />

          {/* Node dots at each hour */}
          {points.map((p, idx) => (
            <g key={idx}>
              <circle
                cx={p.x}
                cy={p.y}
                r="3"
                fill="#ffffff"
                stroke="rgba(15, 23, 42, 0.6)"
                strokeWidth="1"
              />
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}
