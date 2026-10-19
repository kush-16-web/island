import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchLyrics, findActiveLyricIndex } from '../lib/lyrics';

/**
 * useLyrics: Custom hook to fetch and synchronize lyrics for the active media track.
 */
export function useLyrics(media, currentPositionMs) {
  const [lyricsData, setLyricsData] = useState(null);
  const [loading, setLoading] = useState(false);
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
    return findActiveLyricIndex(lyricsData.lines, currentPositionMs);
  }, [lyricsData, currentPositionMs]);

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
