import { useEffect, useRef, useState } from 'react';
import { upgradeProviderArtUrl, enrichTrackMetadata } from '../lib/art-resolver';

// In-memory cache for loaded high-res artwork URLs to make repeat views zero-latency
const highResCache = new Map();

/**
 * useHighResArt: Authoritative resolution and caching of high-resolution artwork
 * for the currently playing media track.
 *
 * Guarantees (Phase 4):
 * 1. Consistent state between Compact player and Full Lyrics.
 * 2. Transient metadata gap bridging: Bounded grace window (1200ms) prevents blank flashes
 *    when artwork arrives slightly after track metadata.
 * 3. Never holds old song's artwork indefinitely under a new track title.
 * 4. Async race prevention: Request sequencing and monotonic token ensure old slow requests
 *    never overwrite newer tracks.
 * 5. Cleans up immediately when media session is stopped/inactive.
 */
export function useHighResArt(media) {
  const rawArt = media?.art || null;
  const title = media?.title || '';
  const artist = media?.artist || '';
  const provider = media?.provider || media?.app || '';
  const isActive = Boolean(media?.active && title);
  const trackKey = isActive ? `${title}__${artist}__${provider}` : '';

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

  const activeTrackRef = useRef(trackKey);
  const activeArtRef = useRef(rawArt);
  const reqSequenceRef = useRef(0);

  useEffect(() => {
    activeTrackRef.current = trackKey;
    activeArtRef.current = rawArt;
  }, [trackKey, rawArt]);

  useEffect(() => {
    const seq = ++reqSequenceRef.current;

    // Case 1: Session stopped or inactive -> clear artwork state immediately
    if (!isActive) {
      setDisplayArt(null);
      setIsUpgraded(false);
      setIsLoading(false);
      return;
    }

    // Case 2: Provider supplies rawArt
    if (rawArt) {
      // Check in-memory cache first
      const cached = highResCache.get(rawArt);
      if (cached) {
        setDisplayArt(cached);
        setIsUpgraded(cached !== rawArt);
        setIsLoading(false);
        return;
      }

      // Immediately display raw art to prevent blank layout jumping
      setDisplayArt(rawArt);

      const upgradedUrl = upgradeProviderArtUrl(rawArt);
      if (!upgradedUrl || upgradedUrl === rawArt) {
        highResCache.set(rawArt, rawArt);
        highResCache.set(trackKey, rawArt);
        setIsUpgraded(false);
        setIsLoading(false);
        return;
      }

      // Preload upgraded high-res image in background
      setIsLoading(true);
      preloadImage(upgradedUrl).then((ok) => {
        if (seq !== reqSequenceRef.current || activeTrackRef.current !== trackKey) return;
        if (ok) {
          setDisplayArt(upgradedUrl);
          setIsUpgraded(true);
          highResCache.set(rawArt, upgradedUrl);
          highResCache.set(trackKey, upgradedUrl);
        } else {
          setDisplayArt(rawArt);
          setIsUpgraded(false);
          highResCache.set(rawArt, rawArt);
          highResCache.set(trackKey, rawArt);
        }
        setIsLoading(false);
      });
      return;
    }

    // Case 3: rawArt is null/empty for an active track
    // If we have cached art for this specific trackKey, use it immediately
    if (highResCache.has(trackKey)) {
      const cached = highResCache.get(trackKey);
      setDisplayArt(cached);
      setIsUpgraded(true);
      setIsLoading(false);
      return;
    }

    // Bounded transition: Keep current image briefly for at most 1200ms
    // so rapid track updates don't cause harsh flashes.
    setIsLoading(true);
    let graceTimeout = setTimeout(() => {
      if (seq === reqSequenceRef.current && activeTrackRef.current === trackKey) {
        setDisplayArt(null);
        setIsUpgraded(false);
      }
    }, 1200);

    // Concurrently try online enrichment (iTunes API)
    enrichTrackMetadata(title, artist)
      .then((res) => {
        if (seq !== reqSequenceRef.current || activeTrackRef.current !== trackKey) return;
        if (res?.artwork) {
          clearTimeout(graceTimeout);
          preloadImage(res.artwork).then((ok) => {
            if (seq !== reqSequenceRef.current || activeTrackRef.current !== trackKey) return;
            if (ok) {
              setDisplayArt(res.artwork);
              setIsUpgraded(true);
              highResCache.set(trackKey, res.artwork);
            } else {
              setDisplayArt(null);
              setIsUpgraded(false);
            }
            setIsLoading(false);
          });
        } else {
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (seq === reqSequenceRef.current && activeTrackRef.current === trackKey) {
          setIsLoading(false);
        }
      });

    return () => {
      clearTimeout(graceTimeout);
    };
  }, [isActive, trackKey, rawArt, title, artist]);

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
