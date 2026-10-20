import { useEffect, useRef, useState } from 'react';
import { formatTrackTime } from '../lib/format';
import { Icon } from './icons';
import MarqueeText from './MarqueeText';

/**
 * FullLyrics: Immersive YouTube Music / Apple Music style synchronized lyrics view.
 * Features smart auto-scrolling, word-level Karaoke mode (when supported),
 * manual scroll pause detection, line seeking on click, and interactive scrubbing progress bar.
 */
export default function FullLyrics({
  media,
  lyricsData,
  activeLineIndex,
  currentPositionMs,
  onClose,
  onControl,
  accentColor,
  onSeek,
  isFavorite = false,
  toggleFavorite,
}) {
  const [karaokeEnabled, setKaraokeEnabled] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const containerRef = useRef(null);
  const activeLineRef = useRef(null);
  const userScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef(null);
  const scrollAnimRef = useRef(null);

  // Bottom bar scrubbing state
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubPositionMs, setScrubPositionMs] = useState(null);
  const barRef = useRef(null);

  const lines = lyricsData?.lines || [];
  const isSynced = Boolean(lyricsData?.isSynced);
  const hasWordSync = Boolean(lyricsData?.hasWordSync);
  const playing = media?.status === 'playing';

  const isProgrammaticScrollRef = useRef(false);

  // Silky cubic-bezier auto-scroll (Apple Music fluid motion)
  useEffect(() => {
    if (!autoScroll || !isSynced) return;
    userScrollingRef.current = false;
    if (!containerRef.current || !activeLineRef.current) return;

    const container = containerRef.current;
    const activeEl = activeLineRef.current;

    const containerHeight = container.clientHeight;
    const activeOffset = activeEl.offsetTop;
    const activeHeight = activeEl.clientHeight;

    const targetScroll = Math.max(0, activeOffset - containerHeight / 2 + activeHeight / 2);

    if (scrollAnimRef.current) cancelAnimationFrame(scrollAnimRef.current);

    const start = container.scrollTop;
    const change = targetScroll - start;
    if (Math.abs(change) < 1) return;

    const startTime = performance.now();
    // Snappy responsive easing (fast response for lengthy or fast lyrics)
    const duration = Math.min(260, Math.max(160, Math.abs(change) * 0.7));
    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

    const step = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      container.scrollTop = start + change * easeOutCubic(progress);

      if (progress < 1) {
        scrollAnimRef.current = requestAnimationFrame(step);
      } else {
        scrollAnimRef.current = null;
        isProgrammaticScrollRef.current = false;
      }
    };

    isProgrammaticScrollRef.current = true;
    scrollAnimRef.current = requestAnimationFrame(step);

    return () => {
      if (scrollAnimRef.current) cancelAnimationFrame(scrollAnimRef.current);
    };
  }, [activeLineIndex]);

  // Detect user manual scroll to prevent fighting the user
  const handleScroll = () => {
    if (isProgrammaticScrollRef.current) return;
    userScrollingRef.current = true;
    clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      userScrollingRef.current = false;
    }, 2800);
  };

  const hasDuration = media?.durationMs > 0;
  const effectivePosition = isScrubbing && scrubPositionMs !== null ? scrubPositionMs : currentPositionMs;
  const pct = hasDuration ? Math.min(100, Math.max(0, (effectivePosition / media.durationMs) * 100)) : 0;

  // Scrubbing handlers for bottom bar
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
      if (finalMs !== null && onSeek) {
        onSeek(finalMs / 1000);
      }
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  };

  return (
    <div className="full-lyrics" style={{ '--lyric-accent': accentColor || 'var(--accent)' }}>

      {/* Top Header Controls */}
      <div className="full-lyrics__header">
        {/* Left: Album cover thumbnail + Title & Artist */}
        <div className="full-lyrics__track-info">
          {media?.art && (
            <div className="full-lyrics__thumb-wrap">
              <img src={media.art} alt="" className="full-lyrics__thumb-art" />
              {toggleFavorite && (
                <button
                  type="button"
                  className={`heart-btn heart-btn--thumb${isFavorite ? ' is-favorite' : ''}`}
                  onClick={toggleFavorite}
                  aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                  style={{ '--heart-color': accentColor || 'var(--music-accent, #ff3b69)' }}
                  title={isFavorite ? 'Favorited' : 'Favorite track'}
                >
                  {isFavorite ? (
                    <Icon.HeartSolid width={11} height={11} />
                  ) : (
                    <Icon.Heart width={11} height={11} />
                  )}
                </button>
              )}
            </div>
          )}
          <div className="full-lyrics__meta">
            <MarqueeText text={media?.title} className="full-lyrics__title" />
            <span className="full-lyrics__artist">{media?.artist}</span>
          </div>
        </div>

        {/* Center: Synced / Karaoke status & Auto-scroll toggle */}
        <div className="full-lyrics__center-status">
          {hasWordSync ? (
            <button
              type="button"
              className={`karaoke-toggle${karaokeEnabled ? ' is-active' : ''}`}
              onClick={() => setKaraokeEnabled((prev) => !prev)}
              aria-label="Toggle word-by-word karaoke highlighting"
              title="Syllable-level Karaoke Mode"
            >
              <span>Mic</span>
              <span className="badge">ELRC</span>
            </button>
          ) : isSynced ? (
            <button
              type="button"
              className={`karaoke-toggle${autoScroll ? ' is-active' : ''}`}
              onClick={() => setAutoScroll((prev) => !prev)}
              title={autoScroll ? 'Auto-scroll is ON (click to pause)' : 'Auto-scroll is paused (click to resume)'}
            >
              <span>{autoScroll ? 'Synced' : 'Scroll Free'}</span>
            </button>
          ) : (
            <div className="karaoke-toggle is-disabled" title="Showing plain unsynchronized lyrics">
              <span>Plain Lyrics</span>
            </div>
          )}
        </div>

        {/* Right: Back to Player button */}
        <button
          type="button"
          className="full-lyrics__back-btn"
          onClick={onClose}
          aria-label="Back to player"
        >
          <Icon.Chevron width={14} height={14} />
          <span>Player</span>
        </button>
      </div>

      {/* Scrolling Lyrics Reel */}
      <div
        ref={containerRef}
        className="full-lyrics__scroller"
        onScroll={handleScroll}
      >
        <div className="full-lyrics__padding-top" />

        {!isSynced && lines.length > 0 && (
          <div className="full-lyrics__unsynced-notice">
            <Icon.Music width={13} height={13} />
            <span>No synchronized lyrics available for this track</span>
          </div>
        )}

        {lines.length === 0 ? (
          <div className="full-lyrics__empty">
            <span>No lyrics available for this track.</span>
          </div>
        ) : (
          lines.map((line, idx) => {
            const isActive = isSynced && idx === activeLineIndex;
            const isPast = isSynced && idx < activeLineIndex;
            const isFuture = isSynced && idx > activeLineIndex;

            let lineClass = 'full-lyrics__line';
            if (!isSynced) lineClass += ' is-plain';
            else if (isActive) lineClass += ' is-active';
            else if (isPast) lineClass += ' is-past';
            else if (isFuture) lineClass += ' is-future';

            // Karaoke Mode word-by-word rendering
            const showWordKaraoke = isSynced && karaokeEnabled && hasWordSync && isActive && line.words && line.words.length > 0;

            return (
              <div
                key={line.id}
                ref={isActive ? activeLineRef : null}
                className={lineClass}
                onClick={() => {
                  if (isSynced && line.startTimeMs != null && onSeek) {
                    onSeek(line.startTimeMs / 1000);
                  }
                }}
                style={{ cursor: isSynced ? 'pointer' : 'default' }}
                title={isSynced ? 'Jump to this lyric' : undefined}
              >
                {showWordKaraoke ? (
                  <span className="karaoke-words">
                    {line.words.map((w, wIdx) => {
                      const isWordPast = effectivePosition >= w.endMs;
                      const isWordCurrent = effectivePosition >= w.startMs && effectivePosition < w.endMs;
                      let wordClass = 'k-word';
                      if (isWordPast) wordClass += ' is-sung';
                      else if (isWordCurrent) wordClass += ' is-active-word';
                      return (
                        <span key={wIdx} className={wordClass}>
                          {w.text}{' '}
                        </span>
                      );
                    })}
                  </span>
                ) : (
                  <span>{line.text}</span>
                )}
              </div>
            );
          })
        )}
        <div className="full-lyrics__padding-bottom" />
      </div>

      {/* Bottom Mini Playback Controls Bar with Scrubbing */}
      <div className="full-lyrics__bottom-bar">
        <div className="full-lyrics__progress">
          <span className="time-text">{formatTrackTime(effectivePosition)}</span>
          <div
            ref={barRef}
            className={`full-lyrics__bar${isScrubbing ? ' is-scrubbing' : ''}`}
            onPointerDown={handlePointerDown}
            role="slider"
            aria-label="Seek track position"
            style={{ cursor: 'pointer' }}
          >
            {hasDuration && (
              <div
                className="full-lyrics__fill"
                style={{ width: `${pct}%`, background: accentColor || 'var(--accent)' }}
              >
                <div className="full-lyrics__thumb" />
              </div>
            )}
          </div>
          <span className="time-text">
            {hasDuration ? formatTrackTime(media.durationMs) : 'Live'}
          </span>
        </div>

        <div className="full-lyrics__controls">
          <button
            type="button"
            className="icon-btn icon-btn--sm"
            aria-label="Previous track"
            onClick={() => onControl('previous')}
          >
            <Icon.Prev width={16} height={16} />
          </button>
          <button
            type="button"
            className="play-btn play-btn--sm"
            aria-label={playing ? 'Pause' : 'Play'}
            onClick={() => onControl('playpause')}
          >
            {playing ? <Icon.Pause width={16} height={16} /> : <Icon.Play width={16} height={16} />}
          </button>
          <button
            type="button"
            className="icon-btn icon-btn--sm"
            aria-label="Next track"
            onClick={() => onControl('next')}
          >
            <Icon.Next width={16} height={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
