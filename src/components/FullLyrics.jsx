import { useEffect, useRef, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { formatTrackTime } from '../lib/format';
import { Icon } from './icons';
import MarqueeText from './MarqueeText';
import { Art } from './bits';

const isReducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

export const sharedLyricsTransition = isReducedMotion
  ? { duration: 0 }
  : { type: 'spring', stiffness: 280, damping: 28, mass: 0.85 };

/**
 * FullLyrics: Refined YouTube Music / Apple Music style synchronized lyrics experience.
 * Features:
 * - Shared album-art transition with mini-player via Framer Motion layoutId.
 * - Balanced two-column layout: Hero cover + metadata (left), full lyrics scroller (right).
 * - High-res artwork with zero blank-frame flashing.
 * - Fluid cubic-bezier auto-scroll with 2.8s user manual scroll pause detection.
 * - Word-level ELRC Karaoke mode when available.
 * - Pure plain lyrics fallback with clear notice (never fabricates timestamps).
 * - Click-to-seek on synced lines.
 * - Scrubbing progress bar and media controls.
 * - Keyboard navigation (Esc to return to player).
 */
export default function FullLyrics({
  media,
  displayArt,
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
  const isProgrammaticScrollRef = useRef(false);

  // Bottom bar scrubbing state
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubPositionMs, setScrubPositionMs] = useState(null);
  const barRef = useRef(null);

  const lines = lyricsData?.lines || [];
  const isSynced = Boolean(lyricsData?.isSynced);
  const hasWordSync = Boolean(lyricsData?.hasWordSync);
  const playing = media?.status === 'playing';
  const seed = `${media?.title || ''}${media?.artist || ''}`;

  // Keyboard navigation: Escape key returns smoothly to player
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Silky cubic-bezier auto-scroll (Apple Music fluid motion)
  useEffect(() => {
    if (!autoScroll || !isSynced || userScrollingRef.current) return;
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

    if (isReducedMotion) {
      container.scrollTop = targetScroll;
      return;
    }

    const startTime = performance.now();
    const duration = Math.min(320, Math.max(180, Math.abs(change) * 0.75));
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
  }, [activeLineIndex, autoScroll, isSynced]);

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

  // Scrubbing handlers for bottom progress bar
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
    <div
      className="full-lyrics"
      style={{
        '--lyric-accent': accentColor || 'var(--accent, #ff3b69)',
      }}
    >
      {/* Main Two-Column Body */}
      <div className="full-lyrics__body">
        {/* Left Column: Hero Cover Art + Metadata + Status */}
        <div className="full-lyrics__hero">
          <motion.div
            layoutId="island-album-art-wrap"
            className="full-lyrics__hero-art-wrap"
            transition={sharedLyricsTransition}
          >
            {displayArt ? (
              <motion.img
                layoutId="island-album-art-img"
                src={displayArt}
                alt=""
                className="full-lyrics__hero-art"
                transition={sharedLyricsTransition}
              />
            ) : (
              <Art src={null} seed={seed} size={92} radius={14} />
            )}

            {toggleFavorite && (
              <button
                type="button"
                className={`heart-btn heart-btn--hero${isFavorite ? ' is-favorite' : ''}`}
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
            )}
          </motion.div>

          <motion.div
            layoutId="island-track-meta"
            className="full-lyrics__hero-meta"
            transition={sharedLyricsTransition}
          >
            <MarqueeText text={media?.title || 'Unknown title'} className="full-lyrics__hero-title" />
            <MarqueeText text={media?.artist || 'Unknown artist'} className="full-lyrics__hero-artist" />
          </motion.div>

          {/* Sync / Karaoke status pill */}
          <div className="full-lyrics__hero-status">
            {hasWordSync ? (
              <button
                type="button"
                className={`karaoke-toggle${karaokeEnabled ? ' is-active' : ''}`}
                onClick={() => setKaraokeEnabled((prev) => !prev)}
                aria-label="Toggle word-by-word karaoke mode"
                title="Syllable-level Karaoke Mode"
              >
                <span className="dot" />
                <span>Karaoke</span>
              </button>
            ) : isSynced ? (
              <button
                type="button"
                className={`karaoke-toggle${autoScroll ? ' is-active' : ''}`}
                onClick={() => setAutoScroll((prev) => !prev)}
                title={autoScroll ? 'Auto-scroll ON (click to pause)' : 'Auto-scroll paused (click to resume)'}
              >
                <span className="dot" />
                <span>{autoScroll ? 'Synced' : 'Scroll Free'}</span>
              </button>
            ) : (
              <div className="karaoke-toggle is-plain-badge" title="Unsynchronized lyrics">
                <span>Plain Lyrics</span>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Top Bar + Scrolling Lyrics Reel */}
        <div className="full-lyrics__right">
          {/* Top navigation header */}
          <div className="full-lyrics__right-header">
            <span className="full-lyrics__section-label">
              {isSynced ? 'Synchronized Lyrics' : 'Full Lyrics'}
            </span>
            <button
              type="button"
              className="full-lyrics__back-btn"
              onClick={onClose}
              title="Return to Player (Esc)"
              aria-label="Return to player"
            >
              <Icon.Chevron width={11} height={11} />
              <span>Player</span>
            </button>
          </div>

          {/* Scrolling Lyrics Reel */}
          <motion.div
            ref={containerRef}
            className="full-lyrics__scroller"
            onScroll={handleScroll}
            initial={isReducedMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={isReducedMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
            transition={{ duration: 0.3, delay: 0.05 }}
          >
            <div className="full-lyrics__padding-top" />

            {!isSynced && lines.length > 0 && (
              <div className="full-lyrics__unsynced-notice">
                <Icon.Music width={12} height={12} />
                <span>No synchronized timestamps available for this track</span>
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

                // Syllable Karaoke Mode
                const showWordKaraoke =
                  isSynced &&
                  karaokeEnabled &&
                  hasWordSync &&
                  isActive &&
                  line.words &&
                  line.words.length > 0;

                return (
                  <div
                    key={line.id || `line-${idx}`}
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
                          const isWordCurrent =
                            effectivePosition >= w.startMs && effectivePosition < w.endMs;
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
          </motion.div>
        </div>
      </div>

      {/* Bottom Mini Playback Controls Bar with Scrubbing */}
      <motion.div
        layoutId="island-progress-wrap"
        className="full-lyrics__bottom-bar"
        transition={sharedLyricsTransition}
      >
        <div className="full-lyrics__progress">
          <span className="time-text">{formatTrackTime(effectivePosition)}</span>
          <div
            ref={barRef}
            className={`full-lyrics__bar${isScrubbing ? ' is-scrubbing' : ''}`}
            onPointerDown={handlePointerDown}
            role="slider"
            aria-label="Seek track position"
            aria-valuemin={0}
            aria-valuemax={media.durationMs || 100}
            aria-valuenow={effectivePosition}
            tabIndex={0}
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
            title="Previous"
          >
            <Icon.Prev width={16} height={16} />
          </button>
          <button
            type="button"
            className="play-btn play-btn--sm"
            aria-label={playing ? 'Pause' : 'Play'}
            onClick={() => onControl('playpause')}
            title={playing ? 'Pause' : 'Play'}
          >
            {playing ? <Icon.Pause width={16} height={16} /> : <Icon.Play width={16} height={16} />}
          </button>
          <button
            type="button"
            className="icon-btn icon-btn--sm"
            aria-label="Next track"
            onClick={() => onControl('next')}
            title="Next"
          >
            <Icon.Next width={16} height={16} />
          </button>
        </div>
      </motion.div>
    </div>
  );
}
