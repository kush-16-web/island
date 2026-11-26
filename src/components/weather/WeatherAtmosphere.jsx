import React, { useEffect, useRef } from 'react';
import { DaylightSkyRenderer } from './DaylightSkyRenderer';

/**
 * WeatherAtmosphere: Dynamic atmospheric background layer inspired by Apple Weather.
 * 
 * Living Daylight Architecture (Phase B):
 * - Day: Continuous atmospheric Rayleigh & Mie scattering shader via OGL WebGL,
 *   with dual-depth seamless cloud parallax and celestial solar lighting.
 * - Night: Preserves starry midnight atmosphere until Phase C.
 * - Performance: Automatically pauses when hidden, throttles resolution,
 *   and frees GPU contexts on unmount.
 */
export default function WeatherAtmosphere({
  code = 0,
  isDay = true,
  solarElevation = 25,
  cloudCover = null,
  windSpeed = 10,
  windDirectionDeg = null,
  twilightPhase = 'daylight',
  onRendererState = null,
  className = '',
}) {
  const containerRef = useRef(null);
  const glCanvasRef = useRef(null);
  const nightCanvasRef = useRef(null);
  const daylightRendererRef = useRef(null);

  const c = Number(code) || 0;
  const isDaytime = Boolean(isDay);

  // 1. Daylight OGL Atmosphere Lifecycle with Robust Full-Surface ResizeObserver
  useEffect(() => {
    if (!isDaytime) {
      if (daylightRendererRef.current) {
        daylightRendererRef.current.destroy();
        daylightRendererRef.current = null;
      }
      onRendererState?.({ active: false, type: 'night' });
      return;
    }

    const container = containerRef.current;
    const canvas = glCanvasRef.current;
    if (!canvas) return;

    let renderer = daylightRendererRef.current;
    if (!renderer) {
      try {
        renderer = new DaylightSkyRenderer(canvas);
        daylightRendererRef.current = renderer;
        onRendererState?.({ active: true, type: 'daylight-webgl' });
      } catch (err) {
        console.warn('[WeatherAtmosphere] DaylightSkyRenderer init failed, falling back to CSS:', err);
        onRendererState?.({ active: false, type: 'fallback' });
        return;
      }
    }

    // Set telemetry params
    renderer.setTelemetry({
      solarElevation: typeof solarElevation === 'number' ? solarElevation : 25,
      cloudCover,
      windSpeed,
      windDirectionDeg,
      weatherCode: c,
    });

    const syncDimensions = (wOverride, hOverride) => {
      if (!renderer || !canvas) return;
      const targetHost = container || canvas.parentElement || canvas;
      const hostRect = targetHost.getBoundingClientRect();
      const w = Math.round(wOverride || hostRect.width || canvas.clientWidth || targetHost.clientWidth || 576);
      const h = Math.round(hOverride || hostRect.height || canvas.clientHeight || targetHost.clientHeight || 340);
      if (w > 0 && h > 0) {
        renderer.resize(w, h);
      }
    };

    // Perform immediate synchronization
    syncDimensions();
    renderer.start();

    // ResizeObserver tracks internal Island drawer / notch layout expansion & tab switches
    let resizeObserver = null;
    if (typeof ResizeObserver !== 'undefined' && container) {
      resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect || {};
          if (width > 0 && height > 0) {
            syncDimensions(width, height);
          }
        }
      });
      resizeObserver.observe(container);
    }

    // Continuous RAF synchronization during initial Framer Motion morphing transition (400ms)
    let morphRafId = null;
    const morphStartTime = performance.now();
    const tickMorph = (now) => {
      syncDimensions();
      if (now - morphStartTime < 420) {
        morphRafId = requestAnimationFrame(tickMorph);
      }
    };
    morphRafId = requestAnimationFrame(tickMorph);

    const handleWindowResize = () => syncDimensions();
    window.addEventListener('resize', handleWindowResize);

    // Pause animation when tab or window is hidden
    const handleVisibility = () => {
      if (document.hidden) renderer.stop();
      else renderer.start();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (resizeObserver) resizeObserver.disconnect();
      if (morphRafId) cancelAnimationFrame(morphRafId);
      window.removeEventListener('resize', handleWindowResize);
      document.removeEventListener('visibilitychange', handleVisibility);
      if (renderer) {
        renderer.destroy();
        daylightRendererRef.current = null;
      }
    };
  }, [isDaytime]);

  // Update telemetry values on active renderer without re-creating WebGL context
  useEffect(() => {
    if (daylightRendererRef.current && isDaytime) {
      daylightRendererRef.current.setTelemetry({
        solarElevation: typeof solarElevation === 'number' ? solarElevation : 25,
        cloudCover,
        windSpeed,
        windDirectionDeg,
        weatherCode: c,
      });
    }
  }, [solarElevation, cloudCover, windSpeed, windDirectionDeg, c, isDaytime]);

  // 2. Nighttime Starfield Canvas (Preserved for Phase C)
  useEffect(() => {
    if (isDaytime) return;

    const canvas = nightCanvasRef.current;
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

    const starCount = 22;
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

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animId) cancelAnimationFrame(animId);
    };
  }, [isDaytime]);

  return (
    <div
      ref={containerRef}
      className={`weather-atmosphere weather-atmosphere--${isDaytime ? 'daylight' : 'night'} ${className}`.trim()}
      aria-hidden="true"
    >
      {/* Fallback CSS base gradient */}
      <div className="weather-atmosphere__base-gradient" />

      {/* Living Daylight WebGL Sky Layer */}
      {isDaytime ? (
        <>
          <canvas ref={glCanvasRef} className="weather-atmosphere__gl-canvas" />
          <div className="weather-atmosphere__scrim" />
        </>
      ) : (
        <>
          <div className="weather-atmosphere__glow" />
          <canvas ref={nightCanvasRef} className="weather-atmosphere__canvas" />
        </>
      )}
    </div>
  );
}
