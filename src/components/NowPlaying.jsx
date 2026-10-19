import { useEffect, useRef, useState } from 'react';
import { formatTrackTime } from '../lib/format';
import { useLyrics } from '../hooks/useLyrics';
import { Art, Empty } from './bits';
import { Icon } from './icons';
import { island } from '../lib/bridge';
import MarqueeText from './MarqueeText';
import MiniLyrics from './MiniLyrics';
import FullLyrics from './FullLyrics';

export default function NowPlaying({
  media,
  platform,
  onControl,
  accentColor,
  onLyricsViewChange,
}) {
  const [viewMode, setViewMode] = useState('player'); // 'player' | 'lyrics'
  const playing = media.status === 'playing';
  const [localNow, setLocalNow] = useState(Date.now);

  // Scrubbing & optimistic seek state
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubPositionMs, setScrubPositionMs] = useState(null);
  const [optimisticSeek, setOptimisticSeek] = useState(null); // { posMs, timestamp }
  const barRef = useRef(null);

  useEffect(() => {
    if (!playing) return;
    const interval = setInterval(() => setLocalNow(Date.now()), 200);
    return () => clearInterval(interval);
  }, [playing, media.reportedAt, media.positionMs]);

  // Clear optimistic seek once SMTC catches up or after 3s timeout
  useEffect(() => {
    if (optimisticSeek) {
      const diff = Math.abs(media.positionMs - optimisticSeek.posMs);
      if (diff < 2000 || Date.now() - optimisticSeek.timestamp > 3000) {
        setOptimisticSeek(null);
      }
    }
  }, [media.positionMs, optimisticSeek]);

  const elapsed = playing ? Math.max(0, localNow - media.reportedAt) : 0;
  const hasDuration = media.durationMs > 0;
  const rawPosition = Math.min(hasDuration ? media.durationMs : Infinity, Math.max(0, media.positionMs + elapsed));
  
  // Use scrubbing or optimistic seek position so the UI tracks user gesture with 0ms lag
  let displayPosition = rawPosition;
  if (isScrubbing && scrubPositionMs !== null) {
    displayPosition = scrubPositionMs;
  } else if (optimisticSeek && Date.now() - optimisticSeek.timestamp < 3000) {
    const optElapsed = playing ? Date.now() - optimisticSeek.timestamp : 0;
    displayPosition = Math.min(hasDuration ? media.durationMs : Infinity, Math.max(0, optimisticSeek.posMs + optElapsed));
  }

  const pct = hasDuration ? Math.min(100, Math.max(0, (displayPosition / media.durationMs) * 100)) : 0;
  const seed = `${media.title}${media.artist}`;

  // Fetch and synchronize lyrics using current playback position
  const { lyricsData, loading, activeLineIndex } = useLyrics(media, displayPosition);

  // Notify parent of view mode change for dynamic height adjustment
  const handleSetViewMode = (mode) => {
    setViewMode(mode);
    onLyricsViewChange?.(mode === 'lyrics');
  };

  // Favorite track state
  const trackKey = `${media.title || ''}|${media.artist || ''}`;
  const [isFavorite, setIsFavorite] = useState(() => {
    try {
      const favs = JSON.parse(localStorage.getItem('island_fav_tracks') || '{}');
      return Boolean(favs[trackKey]);
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      const favs = JSON.parse(localStorage.getItem('island_fav_tracks') || '{}');
      setIsFavorite(Boolean(favs[trackKey]));
    } catch {
      setIsFavorite(false);
    }
  }, [trackKey]);

  const toggleFavorite = (e) => {
    e.stopPropagation();
    try {
      const favs = JSON.parse(localStorage.getItem('island_fav_tracks') || '{}');
      const next = !isFavorite;
      if (next) favs[trackKey] = { title: media.title, artist: media.artist, addedAt: Date.now() };
      else delete favs[trackKey];
      localStorage.setItem('island_fav_tracks', JSON.stringify(favs));
      setIsFavorite(next);
    } catch {}
  };

  // Reset to player view if active track changes
  useEffect(() => {
    handleSetViewMode('player');
    setIsScrubbing(false);
    setScrubPositionMs(null);
  }, [media.title, media.artist]);

  // Scrubbing handlers
  const calculatePositionFromPointer = (e) => {
    if (!hasDuration || !barRef.current) return null;
    const rect = barRef.current.getBoundingClientRect();
    const clickX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const ratio = rect.width > 0 ? clickX / rect.width : 0;
    return Math.round(ratio * media.durationMs);
  };

  const handlePointerDown = (e) => {
    if (!hasDuration || e.button !== 0) return;
    const targetMs = calculatePositionFromPointer(e);
    if (targetMs === null) return;
    setIsScrubbing(true);
    setScrubPositionMs(targetMs);

    const onPointerMove = (ev) => {
      const ms = calculatePositionFromPointer(ev);
      if (ms !== null) setScrubPositionMs(ms);
    };

    const onPointerUp = (ev) => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      const finalMs = calculatePositionFromPointer(ev);
      setIsScrubbing(false);
      setScrubPositionMs(null);
      if (finalMs !== null) {
        setOptimisticSeek({ posMs: finalMs, timestamp: Date.now() });
        island?.media?.seek?.(finalMs / 1000);
      }
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  };

  if (!media.active) {
    return (
      <Empty
        icon="♪"
        title="Nothing playing"
        hint="Start audio or video in Spotify, your browser, or any media player and it will show up here."
      />
    );
  }

  if (viewMode === 'lyrics') {
    return (
      <FullLyrics
        media={media}
        lyricsData={lyricsData}
        loading={loading}
        activeLineIndex={activeLineIndex}
        currentPositionMs={displayPosition}
        onControl={onControl}
        onClose={() => handleSetViewMode('player')}
        accentColor={accentColor}
        isFavorite={isFavorite}
        toggleFavorite={toggleFavorite}
        onSeek={(posSec) => {
          setOptimisticSeek({ posMs: posSec * 1000, timestamp: Date.now() });
          island?.media?.seek?.(posSec);
        }}
      />
    );
  }

  return (
    <div className="np">
      <div className="np__main">
        {/* Left Column: Cover + Title + Artist + App chip */}
        <div className="np__left">
          <div className="np__cover-wrap">
            <Art src={media.art} seed={seed} size={64} radius={12} />
            <button
              type="button"
              className={`heart-btn heart-btn--overlay${isFavorite ? ' is-favorite' : ''}`}
              onClick={toggleFavorite}
              aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
              style={{ '--heart-color': accentColor || 'var(--music-accent, #ff3b69)' }}
              title={isFavorite ? 'Favorited' : 'Favorite track'}
            >
              {isFavorite ? (
                <Icon.HeartSolid width={13} height={13} />
              ) : (
                <Icon.Heart width={13} height={13} />
              )}
            </button>
          </div>
          <div className="np__meta">
            <MarqueeText text={media.title} className="np__title" />
            <MarqueeText text={media.artist || 'Unknown artist'} className="np__artist" />
            {media.app && <span className="chip-app">{media.app}</span>}
          </div>
        </div>

        {/* Right Column: Mini Lyrics take all remaining horizontal space! */}
        <div className="np__right">
          <MiniLyrics
            lyricsData={lyricsData}
            loading={loading}
            activeLineIndex={activeLineIndex}
            accentColor={accentColor}
            onClick={() => handleSetViewMode('lyrics')}
          />
        </div>
      </div>

      <div className="np__bottom">
        <div className="np__progress">
          <span className="np__time-text">{formatTrackTime(displayPosition)}</span>
          <div
            ref={barRef}
            className={`np__bar${isScrubbing ? ' is-scrubbing' : ''}`}
            onPointerDown={handlePointerDown}
            role="slider"
            aria-label="Seek track position"
            aria-valuemin={0}
            aria-valuemax={media.durationMs || 100}
            aria-valuenow={displayPosition}
            tabIndex={0}
          >
            {hasDuration && (
              <div
                className="np__fill"
                style={{
                  width: `${pct}%`,
                  background: accentColor || 'var(--accent)',
                }}
              >
                <div className="np__thumb" />
              </div>
            )}
          </div>
          <span className="np__time-text">
            {hasDuration ? formatTrackTime(media.durationMs) : 'Live'}
          </span>
        </div>

        <div className="np__controls">
          <button type="button" className="icon-btn" aria-label="Previous track" onClick={() => onControl('previous')}>
            <Icon.Prev width={20} height={20} />
          </button>
          <button type="button" className="play-btn" aria-label={playing ? 'Pause' : 'Play'} onClick={() => onControl('playpause')}>
            {playing ? <Icon.Pause width={20} height={20} /> : <Icon.Play width={20} height={20} />}
          </button>
          <button type="button" className="icon-btn" aria-label="Next track" onClick={() => onControl('next')}>
            <Icon.Next width={20} height={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
