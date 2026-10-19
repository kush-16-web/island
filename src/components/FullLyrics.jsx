import { useEffect, useRef, useState } from 'react';
import { formatTrackTime } from '../lib/format';
import { Icon } from './icons';

/**
 * FullLyrics: Immersive YouTube Music style synchronized lyrics view.
 * Features smart auto-scrolling, word-level Karaoke mode (when supported),
 * manual scroll pause detection, line seeking, and bottom playback bar.
 */
export default function FullLyrics({
  media,
  lyricsData,
  activeLineIndex,
  currentPositionMs,
  onClose,
  onControl,
  accentColor,
}) {
  const [karaokeEnabled, setKaraokeEnabled] = useState(false);
  const containerRef = useRef(null);
  const activeLineRef = useRef(null);
  const userScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef(null);

  const lines = lyricsData?.lines || [];
  const hasWordSync = Boolean(lyricsData?.hasWordSync);
  const playing = media?.status === 'playing';

  // Smart auto-scroll to keep current line vertically centered
  useEffect(() => {
    if (userScrollingRef.current) return;
    if (!containerRef.current || !activeLineRef.current) return;

    const container = containerRef.current;
    const activeEl = activeLineRef.current;

    const containerHeight = container.clientHeight;
    const activeOffset = activeEl.offsetTop;
    const activeHeight = activeEl.clientHeight;

    const targetScroll = activeOffset - containerHeight / 2 + activeHeight / 2;

    container.scrollTo({
      top: Math.max(0, targetScroll),
      behavior: 'smooth',
    });
  }, [activeLineIndex]);

  // Handle manual scrolling: pause auto-scroll for 3.5s so user can read freely
  const handleScroll = () => {
    userScrollingRef.current = true;
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      userScrollingRef.current = false;
    }, 3500);
  };

  const hasDuration = media?.durationMs > 0;
  const pct = hasDuration ? Math.min(100, Math.max(0, (currentPositionMs / media.durationMs) * 100)) : 0;

  return (
    <div className="full-lyrics" style={{ '--lyric-accent': accentColor || 'var(--accent)' }}>
      {/* Top Header */}
      <div className="full-lyrics__header">
        <button
          type="button"
          className="full-lyrics__back-btn"
          onClick={onClose}
          aria-label="Back to player"
        >
          <Icon.Chevron width={16} height={16} style={{ transform: 'rotate(90deg)' }} />
          <span>Player</span>
        </button>

        <div className="full-lyrics__track-info">
          <span className="full-lyrics__title">{media?.title || 'Unknown Title'}</span>
          <span className="full-lyrics__artist">{media?.artist || 'Unknown Artist'}</span>
        </div>

        <button
          type="button"
          className={`karaoke-toggle${karaokeEnabled ? ' is-active' : ''}${!hasWordSync ? ' is-disabled' : ''}`}
          onClick={() => {
            if (hasWordSync) setKaraokeEnabled((prev) => !prev);
          }}
          title={
            hasWordSync
              ? karaokeEnabled
                ? 'Karaoke Mode Active (Word-by-word)'
                : 'Turn on Karaoke Mode'
              : 'Karaoke unavailable for this track (word timestamps not provided by LRCLIB)'
          }
        >
          <span className="karaoke-toggle__icon">🎤</span>
          <span className="karaoke-toggle__label">Karaoke</span>
        </button>
      </div>

      {/* Scrollable Synchronized Lyrics Body */}
      <div
        ref={containerRef}
        className="full-lyrics__scroller"
        onScroll={handleScroll}
      >
        <div className="full-lyrics__padding-top" />
        {lines.length === 0 ? (
          <div className="full-lyrics__empty">
            <span>No lyrics available</span>
          </div>
        ) : (
          lines.map((line, idx) => {
            const isActive = idx === activeLineIndex;
            const isPast = idx < activeLineIndex;
            const isFuture = idx > activeLineIndex;

            let lineClass = 'full-lyrics__line';
            if (isActive) lineClass += ' is-active';
            else if (isPast) lineClass += ' is-past';
            else if (isFuture) lineClass += ' is-future';

            // Karaoke Mode word-by-word rendering
            const showWordKaraoke = karaokeEnabled && hasWordSync && isActive && line.words && line.words.length > 0;

            return (
              <div
                key={line.id}
                ref={isActive ? activeLineRef : null}
                className={lineClass}
              >
                {showWordKaraoke ? (
                  <span className="karaoke-words">
                    {line.words.map((w, wIdx) => {
                      const isWordPast = currentPositionMs >= w.endMs;
                      const isWordCurrent = currentPositionMs >= w.startMs && currentPositionMs < w.endMs;
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

      {/* Bottom Mini Playback Controls Bar */}
      <div className="full-lyrics__bottom-bar">
        <div className="full-lyrics__progress">
          <span className="time-text">{formatTrackTime(currentPositionMs)}</span>
          <div className="full-lyrics__bar">
            {hasDuration && (
              <div
                className="full-lyrics__fill"
                style={{ width: `${pct}%`, background: accentColor || 'var(--accent)' }}
              />
            )}
          </div>
          <span className="time-text">
            {hasDuration ? `-${formatTrackTime(media.durationMs - currentPositionMs)}` : 'Live'}
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
            className="play-btn play-btn--mini"
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
