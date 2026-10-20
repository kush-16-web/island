import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchLyrics, findActiveLyricIndex } from '../lib/lyrics';

const DEFAULT_VOCAL_LEAD_MS = 250;

/**
 * useLyrics: Custom hook to fetch and synchronize lyrics for the active media track.
 * Applies a 250ms vocal lead offset to compensate for human transcription latency,
 * and supports custom user latency calibration.
 */
export function useLyrics(media, currentPositionMs, userOffsetMs) {
  const [lyricsData, setLyricsData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [offsetMs, setOffsetMs] = useState(() => {
    if (typeof userOffsetMs === 'number') return userOffsetMs;
    try {
      const saved = localStorage.getItem('island_lyrics_offset');
      return saved !== null ? Number(saved) : 0;
    } catch {
      return 0;
    }
  });

  useEffect(() => {
    if (typeof userOffsetMs === 'number') {
      setOffsetMs(userOffsetMs);
    }
    const onOffsetChanged = () => {
      try {
        const saved = localStorage.getItem('island_lyrics_offset');
        setOffsetMs(saved !== null ? Number(saved) : 0);
      } catch {}
    };
    window.addEventListener('island:lyrics-offset-changed', onOffsetChanged);
    return () => window.removeEventListener('island:lyrics-offset-changed', onOffsetChanged);
  }, [userOffsetMs]);

  const trackKey = useMemo(() => {
    if (!media || !media.active || !media.title) return '';
    return `${media.title}|${media.artist || ''}`;
  }, [media?.active, media?.title, media?.artist]);

  const activeTrackRef = useRef('');

  useEffect(() => {
    if (!trackKey) {
      setLyricsData(null);
      setLoading(false);
      activeTrackRef.current = '';
      return;
    }

    if (activeTrackRef.current === trackKey) return;
    activeTrackRef.current = trackKey;

    let cancelled = false;
    setLoading(true);

    const durationSec = media.durationMs ? media.durationMs / 1000 : 0;
    fetchLyrics({
      title: media.title,
      artist: media.artist,
      durationSec,
    }).then((res) => {
      if (cancelled) return;
      setLyricsData(res);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [trackKey, media?.durationMs]);

  const activeLineIndex = useMemo(() => {
    if (!lyricsData || !lyricsData.lines || lyricsData.lines.length === 0) return -1;
    const effectivePos = Math.max(0, currentPositionMs + DEFAULT_VOCAL_LEAD_MS + offsetMs);
    return findActiveLyricIndex(lyricsData.lines, effectivePos);
  }, [lyricsData, currentPositionMs, offsetMs]);

  return {
    lyricsData,
    loading,
    activeLineIndex,
    hasLyrics: Boolean(lyricsData?.found && lyricsData?.lines?.length > 0),
    isSynced: Boolean(lyricsData?.isSynced),
    hasWordSync: Boolean(lyricsData?.hasWordSync),
    instrumental: Boolean(lyricsData?.instrumental),
  };
}
