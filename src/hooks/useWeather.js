import { useState, useEffect, useCallback, useRef } from 'react';
import { getCurrentWeather } from '../lib/weather';

const STORAGE_KEY = 'island_weather_cache';
const REFRESH_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

/**
 * useWeather: High-reliability real-time weather hook for Island.
 * Provides instant 0ms cached rendering on boot, with 15-minute background auto-refresh.
 */
export function useWeather(locationQuery = null) {
  const [weather, setWeather] = useState(() => {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return null;
  });

  const [loading, setLoading] = useState(!weather);
  const [error, setError] = useState(null);
  const fetchingRef = useRef(false);

  const fetchLatestWeather = useCallback(async (isManual = false) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    if (isManual) setLoading(true);

    try {
      const data = await getCurrentWeather(locationQuery, {
        isRetry: isManual,
        storage: typeof window !== 'undefined' ? window.localStorage : null,
      });

      if (data && data.ok) {
        setWeather(data);
        setError(null);
        if (typeof window !== 'undefined' && window.localStorage) {
          try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
            window.dispatchEvent(new CustomEvent('island:weather-updated', { detail: data }));
          } catch {}
        }
      } else if (data && !data.ok) {
        setError(data.error || 'Weather unavailable');
      }
    } catch (err) {
      console.warn('[useWeather] fetch error:', err);
      setError(err?.message || 'Failed to fetch weather');
    } finally {
      fetchingRef.current = false;
      setLoading(false);
    }
  }, [locationQuery]);

  // Initial load and periodic refresh
  useEffect(() => {
    const isStale = !weather || (weather.updatedAt && Date.now() - weather.updatedAt > 10 * 60 * 1000);
    if (isStale) {
      fetchLatestWeather(false);
    }

    const interval = setInterval(() => {
      fetchLatestWeather(false);
    }, REFRESH_INTERVAL_MS);

    const onOnline = () => fetchLatestWeather(false);
    const onExternalUpdate = (e) => {
      if (e.detail && e.detail.ok) {
        setWeather(e.detail);
      }
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('island:weather-updated', onExternalUpdate);

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('island:weather-updated', onExternalUpdate);
    };
  }, [fetchLatestWeather]);

  const refresh = useCallback(() => {
    return fetchLatestWeather(true);
  }, [fetchLatestWeather]);

  return { weather, loading, error, refresh };
}

export default useWeather;
