import React, { useEffect, useRef } from 'react';
import { DaylightSkyRenderer } from './DaylightSkyRenderer';

/**
 * WeatherAtmosphere: Dynamic atmospheric background layer inspired by Apple Weather.
 * 
 * Living Atmosphere Architecture:
 * - Unified full-surface WebGL rendering via OGL for Day, Sunset, Twilight, Night,
 *   Stars, Real Moon, Clouds, Rain, Snow, Lightning, and Fog.
 * - Continuous smooth interpolation across weather states without context teardowns.
 * - Single celestial & environmental ownership: all atmospheric phenomena rendered inside canvas.
 * - Robust ResizeObserver + RAF synchronization across Island layout transitions.
 * - Fallback: graceful degradation to static CSS gradient and SVG emblem if WebGL fails.
 * - Performance: auto-pauses when hidden, caps DPR at 1.5, cleans up GPU context on unmount.
 */
export default function WeatherAtmosphere({
  code = 0,
  isDay = true,
  solarElevation = 25,
  cloudCover = null,
  windSpeed = 10,
  windDirectionDeg = null,
  twilightPhase = 'daylight',
  lunar = null,
  precip = 0,
  visibility = 10000,
  temperature = 20,
  forceHalo = false,
  onRendererState = null,
  className = '',
}) {
  const containerRef = useRef(null);
  const glCanvasRef = useRef(null);
  const rendererRef = useRef(null);

  const c = Number(code) || 0;
  const isDaytime = Boolean(isDay);

  // 1. WebGL Living Atmosphere Lifecycle with Full-Surface ResizeObserver
  useEffect(() => {
    const container = containerRef.current;
    const canvas = glCanvasRef.current;
    if (!canvas) return;

    let renderer = rendererRef.current;
    if (!renderer) {
      try {
        renderer = new DaylightSkyRenderer(canvas);
        rendererRef.current = renderer;
        onRendererState?.({ active: true, type: isDaytime ? 'daylight-webgl' : 'night-webgl' });
      } catch (err) {
        console.warn('[WeatherAtmosphere] Renderer init failed, falling back to CSS:', err);
        onRendererState?.({ active: false, type: 'fallback' });
        return;
      }
    }

    // Set telemetry params
    renderer.setTelemetry({
      isDay: isDaytime,
      solarElevation: typeof solarElevation === 'number' ? solarElevation : (isDaytime ? 25 : -30),
      cloudCover,
      windSpeed,
      windDirectionDeg,
      weatherCode: c,
      lunar,
      precip,
      visibility,
      temperature,
      forceHalo,
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

    // Continuous RAF synchronization during initial Framer Motion morphing transition (420ms)
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

    // Pause animation when tab or window is hidden to save GPU cycles
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
        rendererRef.current = null;
      }
    };
  }, []);

  // 2. Smoothly Update Telemetry on Active Renderer without Context Re-creation
  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setTelemetry({
        isDay: isDaytime,
        solarElevation: typeof solarElevation === 'number' ? solarElevation : (isDaytime ? 25 : -30),
        cloudCover,
        windSpeed,
        windDirectionDeg,
        weatherCode: c,
        lunar,
        precip,
        visibility,
      });
      onRendererState?.({ active: true, type: isDaytime ? 'daylight-webgl' : 'night-webgl' });
    }
  }, [isDaytime, solarElevation, cloudCover, windSpeed, windDirectionDeg, c, lunar, precip, visibility]);

  return (
    <div
      ref={containerRef}
      className={`weather-atmosphere weather-atmosphere--${isDaytime ? 'daylight' : 'night'} ${className}`.trim()}
      aria-hidden="true"
    >
      {/* Coherent Fallback CSS base gradient when WebGL unavailable */}
      <div className="weather-atmosphere__base-gradient" />

      {/* Living Atmospheric WebGL Sky Surface */}
      <canvas ref={glCanvasRef} className="weather-atmosphere__gl-canvas" />

      {/* Atmospheric depth scrim */}
      <div className="weather-atmosphere__scrim" />
    </div>
  );
}
