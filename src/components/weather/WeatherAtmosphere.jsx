import React, { useEffect, useRef } from 'react';

/**
 * WeatherAtmosphere: Dynamic atmospheric background layer inspired by Apple Weather.
 * 
 * 4 Distinct Atmospheric Archetypes:
 * 1. Night: Deep midnight indigo tones, subtle lunar atmospheric glow, gently twinkling stars.
 * 2. Sunny (Day): Daylight sky atmosphere, soft slowly moving solar diffusion.
 * 3. Rainy: Slate-blue atmospheric depth, subtle falling rain streaks at a natural angle.
 * 4. Cloudy: Slowly drifting soft cloud mist gradient layers.
 * 
 * Performance & Isolation:
 * - Strictly isolated inside the weather container via pointer-events: none and overflow: hidden.
 * - Animation frame loop starts on mount and cancels immediately on unmount.
 * - Zero GPU/CPU overhead when the weather panel is closed.
 */
export default function WeatherAtmosphere({
  code = 0,
  isDay = true,
  className = '',
}) {
  const canvasRef = useRef(null);

  // Map condition code to atmospheric archetype
  const c = Number(code) || 0;
  let atmosphereType = 'night';

  if (!isDay) {
    atmosphereType = 'night';
  } else if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82) || c >= 95) {
    atmosphereType = 'rainy';
  } else if (c === 2 || c === 3 || c === 45 || c === 48) {
    atmosphereType = 'cloudy';
  } else {
    atmosphereType = 'sunny';
  }

  // Canvas particle animations (rain drops or night stars)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId = null;
    let width = (canvas.width = canvas.offsetWidth || 500);
    let height = (canvas.height = canvas.offsetHeight || 340);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = canvas.offsetWidth || 500;
      height = canvas.height = canvas.offsetHeight || 340;
    };
    window.addEventListener('resize', handleResize);

    // RAIN PARTICLES
    if (atmosphereType === 'rainy') {
      const dropCount = 42;
      const drops = Array.from({ length: dropCount }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        length: 8 + Math.random() * 12,
        speed: 4 + Math.random() * 5,
        alpha: 0.15 + Math.random() * 0.25,
      }));

      const renderRain = () => {
        ctx.clearRect(0, 0, width, height);
        ctx.strokeStyle = '#93c5fd';
        ctx.lineWidth = 1.2;
        ctx.lineCap = 'round';

        for (let i = 0; i < drops.length; i++) {
          const d = drops[i];
          ctx.beginPath();
          ctx.globalAlpha = d.alpha;
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(d.x + 1.5, d.y + d.length);
          ctx.stroke();

          d.y += d.speed;
          d.x += 0.8;
          if (d.y > height) {
            d.y = -d.length;
            d.x = Math.random() * width;
          }
        }

        animId = requestAnimationFrame(renderRain);
      };

      animId = requestAnimationFrame(renderRain);
    }

    // NIGHT STARS (subtle twinkling dots)
    if (atmosphereType === 'night') {
      const starCount = 20;
      const stars = Array.from({ length: starCount }, () => ({
        x: Math.random() * width,
        y: Math.random() * (height * 0.75),
        radius: 0.7 + Math.random() * 1.1,
        alpha: 0.2 + Math.random() * 0.6,
        alphaSpeed: 0.008 + Math.random() * 0.012,
        growing: Math.random() > 0.5,
      }));

      const renderStars = () => {
        ctx.clearRect(0, 0, width, height);

        for (let i = 0; i < stars.length; i++) {
          const s = stars[i];
          if (s.growing) {
            s.alpha += s.alphaSpeed;
            if (s.alpha >= 0.8) s.growing = false;
          } else {
            s.alpha -= s.alphaSpeed;
            if (s.alpha <= 0.15) s.growing = true;
          }

          ctx.beginPath();
          ctx.globalAlpha = s.alpha;
          ctx.fillStyle = '#ffffff';
          ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
          ctx.fill();
        }

        animId = requestAnimationFrame(renderStars);
      };

      animId = requestAnimationFrame(renderStars);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animId) cancelAnimationFrame(animId);
    };
  }, [atmosphereType]);

  return (
    <div
      className={`weather-atmosphere weather-atmosphere--${atmosphereType} ${className}`.trim()}
      aria-hidden="true"
    >
      {/* Dynamic atmospheric gradient layers */}
      <div className="weather-atmosphere__base-gradient" />
      <div className="weather-atmosphere__glow" />

      {/* Slowly drifting cloud layers for cloudy condition */}
      {atmosphereType === 'cloudy' && (
        <div className="weather-atmosphere__clouds">
          <div className="weather-atmosphere__cloud-layer weather-atmosphere__cloud-layer--1" />
          <div className="weather-atmosphere__cloud-layer weather-atmosphere__cloud-layer--2" />
        </div>
      )}

      {/* Atmospheric particle canvas (stars or rain) */}
      {(atmosphereType === 'rainy' || atmosphereType === 'night') && (
        <canvas ref={canvasRef} className="weather-atmosphere__canvas" />
      )}
    </div>
  );
}
