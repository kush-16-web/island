import { useEffect, useRef, useState } from 'react';
import { upgradeProviderArtUrl, enrichTrackMetadata } from '../lib/art-resolver';

// In-memory cache for loaded high-res artwork URLs to make repeat views zero-latency
const highResCache = new Map();

/**
 * useHighResArt: Automatically resolves and preloads high-resolution artwork
 * for the currently playing track.
 *
 * Guarantees:
 * 1. Never shows a blank frame or white flash (maintains current art while preloading).
 * 2. Uses upgraded resolution (Spotify 640x640, Apple Music 1200x1200bb, YouTube maxresdefault, Google CDN =w1200-h1200).
 * 3. Preloads via background Image() before swapping display URL.
 * 4. Gracefully falls back to existing thumbnail if high-res fails or 404s.
 */
export function useHighResArt(media) {
  const rawArt = media?.art || null;
  const trackKey = `${media?.title || ''}__${media?.artist || ''}`;

  const [displayArt, setDisplayArt] = useState(() => {
    if (!rawArt) return null;
    return highResCache.get(rawArt) || rawArt;
  });
  const [isUpgraded, setIsUpgraded] = useState(() => {
    if (!rawArt) return false;
    const cached = highResCache.get(rawArt);
    return Boolean(cached && cached !== rawArt);
  });
  const [isLoading, setIsLoading] = useState(false);

  const activeArtRef = useRef(rawArt);
  activeArtRef.current = rawArt;

  const activeTrackRef = useRef(trackKey);
  activeTrackRef.current = trackKey;

  useEffect(() => {
    if (!rawArt) {
      // If no art provided, attempt enrichment via iTunes API if title is available
      if (media?.title) {
        let cancelled = false;
        setIsLoading(true);
        enrichTrackMetadata(media.title, media.artist || '').then((res) => {
          if (cancelled) return;
          if (res?.artwork && activeTrackRef.current === trackKey) {
            preloadImage(res.artwork).then((ok) => {
              if (cancelled) return;
              if (ok && activeTrackRef.current === trackKey) {
                setDisplayArt(res.artwork);
                setIsUpgraded(true);
                highResCache.set(trackKey, res.artwork);
              }
              setIsLoading(false);
            });
          } else {
            setIsLoading(false);
          }
        });
        return () => {
          cancelled = true;
        };
      }
      setDisplayArt(null);
      setIsUpgraded(false);
      setIsLoading(false);
      return;
    }

    // Check cache first
    const cached = highResCache.get(rawArt);
    if (cached) {
      setDisplayArt(cached);
      setIsUpgraded(cached !== rawArt);
      setIsLoading(false);
      return;
    }

    // Immediately show the current raw art to prevent blank frames or layout jumping
    setDisplayArt(rawArt);

    const upgradedUrl = upgradeProviderArtUrl(rawArt);
    if (!upgradedUrl || upgradedUrl === rawArt) {
      // Already at provider's base resolution
      highResCache.set(rawArt, rawArt);
      setIsUpgraded(false);
      setIsLoading(false);
      return;
    }

    // Preload upgraded high-res image in background
    let cancelled = false;
    setIsLoading(true);

    preloadImage(upgradedUrl).then((ok) => {
      if (cancelled) return;
      if (activeArtRef.current === rawArt) {
        if (ok) {
          setDisplayArt(upgradedUrl);
          setIsUpgraded(true);
          highResCache.set(rawArt, upgradedUrl);
        } else {
          // Fallback to raw art if upgraded URL returned 404
          setDisplayArt(rawArt);
          setIsUpgraded(false);
          highResCache.set(rawArt, rawArt);
        }
        setIsLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [rawArt, trackKey]);

  return {
    displayArt: displayArt || rawArt,
    isUpgraded,
    isLoading,
  };
}

/**
 * Preload an image URL safely in browser or Electron renderer
 */
function preloadImage(url) {
  if (typeof window === 'undefined' || typeof Image === 'undefined') {
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}
