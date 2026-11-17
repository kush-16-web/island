import { useEffect, useRef, useState } from 'react';
import { upgradeProviderArtUrl, enrichTrackMetadata } from '../lib/music/art-resolver.js';

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
    let graceTimeout = null;

    // Case 1: Session stopped or inactive -> clear artwork state immediately
    if (!isActive) {
      setDisplayArt(null);
      setIsUpgraded(false);
      setIsLoading(false);
      return () => {
        if (graceTimeout) clearTimeout(graceTimeout);
      };
    }

    // Case 2: Provider supplies rawArt
    if (rawArt) {
      // Check in-memory cache first
      const cached = highResCache.get(rawArt);
      if (cached) {
        setDisplayArt(cached);
        setIsUpgraded(cached !== rawArt);
        setIsLoading(false);
        return () => {
          if (graceTimeout) clearTimeout(graceTimeout);
        };
      }

      // Immediately display authentic raw art to prevent blank layout jumping
      setDisplayArt(rawArt);

      const upgradedUrl = upgradeProviderArtUrl(rawArt);
      let targetHdUrl = (upgradedUrl && upgradedUrl !== rawArt) ? upgradedUrl : null;

      // If rawArt is a downsampled base64 thumbnail from Windows SMTC, check YouTube ID
      if (!targetHdUrl && (rawArt.startsWith('data:') || rawArt.length < 500)) {
        if (media?.youtubeId) {
          targetHdUrl = `https://i.ytimg.com/vi/${media.youtubeId}/maxresdefault.jpg`;
        }
      }

      if (!targetHdUrl) {
        // Attempt background verified enrichment (guaranteed exact track match)
        if (title && artist) {
          enrichTrackMetadata(title, artist).then((enriched) => {
            if (seq !== reqSequenceRef.current || activeTrackRef.current !== trackKey) return;
            if (enriched?.artwork) {
              preloadImage(enriched.artwork).then((ok) => {
                if (seq !== reqSequenceRef.current || activeTrackRef.current !== trackKey) return;
                if (ok) {
                  setDisplayArt(enriched.artwork);
                  setIsUpgraded(true);
                  highResCache.set(rawArt, enriched.artwork);
                  highResCache.set(trackKey, enriched.artwork);
                }
              });
            }
          }).catch(() => {});
        }

        highResCache.set(rawArt, rawArt);
        highResCache.set(trackKey, rawArt);
        setIsUpgraded(false);
        setIsLoading(false);
        return () => {
          if (graceTimeout) clearTimeout(graceTimeout);
        };
      }

      // Preload upgraded high-res image in background
      setIsLoading(true);
      preloadImage(targetHdUrl).then((ok) => {
        if (seq !== reqSequenceRef.current || activeTrackRef.current !== trackKey) return;
        if (ok) {
          setDisplayArt(targetHdUrl);
          setIsUpgraded(true);
          highResCache.set(rawArt, targetHdUrl);
          highResCache.set(trackKey, targetHdUrl);
        } else {
          setDisplayArt(rawArt);
          setIsUpgraded(false);
          highResCache.set(rawArt, rawArt);
          highResCache.set(trackKey, rawArt);
        }
        setIsLoading(false);
      });
      return () => {
        if (graceTimeout) clearTimeout(graceTimeout);
      };
    }

    // Case 3: rawArt is null/empty for an active track
    // If we have cached art for this specific trackKey, use it immediately
    if (highResCache.has(trackKey)) {
      const cached = highResCache.get(trackKey);
      setDisplayArt(cached);
      setIsUpgraded(true);
      setIsLoading(false);
      return () => {
        if (graceTimeout) clearTimeout(graceTimeout);
      };
    }

    // Bounded transition: Keep current image briefly for at most 1200ms
    // so rapid track updates don't cause harsh flashes.
    setIsLoading(true);
    graceTimeout = setTimeout(() => {
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
          if (graceTimeout) clearTimeout(graceTimeout);
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
      if (graceTimeout) clearTimeout(graceTimeout);
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
