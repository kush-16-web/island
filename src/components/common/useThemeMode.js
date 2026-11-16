import { useEffect, useRef, useState } from 'react';
import { extractCoverColor } from '../../lib/colorExtract';
import { hueFrom } from '../../lib/format';

// Genuine neutral graphite accent: crisp, high-contrast slate/zinc without purple/blue tint
const NEUTRAL_GRAPHITE_ACCENT = '#e2e8f0';

/**
 * useThemeMode: Authoritative Hook for Appearance Mode & Dynamic Album Palette Integration (Phase 1A.5B).
 * 
 * Manages:
 * 1. Mode: 'dynamic_frosted' (default) vs 'dark_frosted'
 * 2. Real-time extraction of album artwork color with fallback hue
 * 3. Immediate IPC broadcasting and cross-window synchronization
 * 4. Muted album tint wash on frosted window surface subordinate to backdrop blur
 * 5. Clean, instant fallback to neutral graphite when idle or in dark mode
 */
export function useThemeMode() {
  const [appearanceMode, setAppearanceModeState] = useState('dynamic_frosted');
  const [coverAccent, setCoverAccent] = useState(null);
  const [activeMedia, setActiveMedia] = useState(null);
  const currentArtRef = useRef(null);

  // 1. Initial Load of Appearance Mode
  useEffect(() => {
    if (window.island?.getAppearanceMode) {
      window.island.getAppearanceMode()
        .then((m) => {
          if (m) setAppearanceModeState(m);
        })
        .catch(() => {});
    } else if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('island_appearance_mode');
      if (saved) setAppearanceModeState(saved);
    }

    // Check existing media state if bridge provides it
    if (window.island?.getState) {
      window.island.getState()
        .then((s) => {
          if (s?.media) {
            setActiveMedia(s.media);
            processArt(s.media);
          }
        })
        .catch(() => {});
    }
  }, []);

  // 2. Process Album Artwork Extraction with Fallback
  const processArt = (media) => {
    if (!media || !media.active) {
      currentArtRef.current = null;
      setCoverAccent(null);
      return;
    }

    // If media has artwork, extract vibrant dominant color
    if (media.art) {
      if (currentArtRef.current === media.art) return;
      currentArtRef.current = media.art;

      extractCoverColor(media.art, (col) => {
        if (col) {
          setCoverAccent(col);
        } else {
          // Monochrome / black-and-white artwork: clean neutral graphite accent
          setCoverAccent(NEUTRAL_GRAPHITE_ACCENT);
        }
      });
      return;
    }

    // Active media without artwork (or before art loads): generate stable fallback hue
    currentArtRef.current = null;
    if (media.title || media.artist) {
      const fallbackCol = `hsl(${hueFrom(`${media.title || ''}${media.artist || ''}`)} 75% 65%)`;
      setCoverAccent(fallbackCol);
    } else {
      setCoverAccent(null);
    }
  };

  // 3. Listen to IPC Events
  useEffect(() => {
    if (!window.island?.on) return undefined;

    const unsubMode = window.island.on('appearance:mode-changed', (data) => {
      if (data?.mode) {
        setAppearanceModeState(data.mode);
      }
    });

    const unsubMedia = window.island.on('media', (m) => {
      setActiveMedia(m);
      processArt(m);
    });

    return () => {
      unsubMode?.();
      unsubMedia?.();
    };
  }, []);

  // 4. Set Mode Handler (persists and notifies)
  const setAppearanceMode = (newMode) => {
    const val = newMode === 'dark_frosted' ? 'dark_frosted' : 'dynamic_frosted';
    setAppearanceModeState(val);
    if (typeof window !== 'undefined') {
      localStorage.setItem('island_appearance_mode', val);
    }
    if (window.island?.setAppearanceMode) {
      window.island.setAppearanceMode(val);
    }
  };

  // Determine active accent & surfaces
  const isDynamic = appearanceMode === 'dynamic_frosted' || appearanceMode === 'dynamic-frosted';
  const hasAlbumColor = Boolean(isDynamic && coverAccent);
  const effectiveAccent = hasAlbumColor ? coverAccent : NEUTRAL_GRAPHITE_ACCENT;
  const albumColor = hasAlbumColor ? coverAccent : null;

  const windowStyle = {
    '--qg-accent': effectiveAccent,
    ...(hasAlbumColor ? {
      '--qg-album-color': albumColor,
      '--qg-bg-frosted': `color-mix(in srgb, ${albumColor} 12%, rgba(14, 16, 22, 0.70))`,
      '--qg-border': `color-mix(in srgb, ${albumColor} 20%, rgba(255, 255, 255, 0.08))`,
      '--qg-surface': `color-mix(in srgb, ${albumColor} 8%, rgba(22, 25, 34, 0.52))`,
      background: `color-mix(in srgb, ${albumColor} 12%, rgba(14, 16, 22, 0.70))`,
      borderColor: `color-mix(in srgb, ${albumColor} 20%, rgba(255, 255, 255, 0.08))`,
    } : {
      '--qg-album-color': 'transparent',
    }),
  };

  return {
    appearanceMode,
    setAppearanceMode,
    accentColor: effectiveAccent,
    albumColor,
    isDynamic,
    activeMedia,
    hasAlbumColor,
    windowStyle,
  };
}
