import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatTrackTime } from '../lib/format';
import { Icon } from './icons';
import { Art } from './bits';
import audioCoordinator from '../lib/audio-coordinator';
import { upgradeProviderArtUrl } from '../lib/art-resolver';
import { getTrackLyricsPresentation } from '../lib/lyrics-style-engine';

const isReducedMotion =
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

// Shared-element FLIP transition parameters for album artwork
export const sharedLyricsTransition = {
  duration: 0.38,
  ease: [0.22, 1, 0.36, 1],
};

/**
 * FullLyrics: Compact 390px music & lyrics experience with stutter-free compositor transform glide.
 * - Single visual artwork layer handles travel via GPU-accelerated transform & borderRadius.
 * - Responsive full-width song title and artist with natural wrapping up to 2 lines.
 * - Restrained, clean dark-glass Concert tab isolated from Artwork presentation.
 * - Compact lyrics reel (70-85px) with 10px line separation and highlighted active line.
 * - Approved 6-button toolbar (Left: Heart, Music Note, Volume; Right: Prev, Play/Pause, Next).
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
  travelDelta = { x: -153, y: 2, scale: 64 / 126 },
  lyricsStyle = 'classic',
}) {
  const [activeTab, setActiveTab] = useState('artwork'); // 'artwork' | 'concert'
  const [showLyrics, setShowLyrics] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const [isClosing, setIsClosing] = useState(false);

  // Scroller refs & manual scroll detection
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

  // Volume control state
  const [volume, setVolume] = useState(() => audioCoordinator.getUserVolume());
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [isMuted, setIsMuted] = useState(() => audioCoordinator.getUserVolume() === 0);
  const prevVolumeRef = useRef(volume || 0.7);

  // High quality artwork upgrade
  const highQualityArt = upgradeProviderArtUrl(displayArt) || displayArt;

  // Track change artwork preloader
  const [displayedArt, setDisplayedArt] = useState(highQualityArt);
  const [glideDir, setGlideDir] = useState(1);
  const activeArtRef = useRef(highQualityArt);
  const loadTokenRef = useRef(0);
  const seed = `${media?.title || ''}${media?.artist || ''}`;
  const prevSeedRef = useRef(seed);

  // Initial mount flag to prevent unwanted entrance slide on first mount
  const isInitialMountRef = useRef(true);
  useEffect(() => {
    isInitialMountRef.current = false;
  }, []);

  // Subscribe to audioCoordinator volume
  useEffect(() => {
    const unsub = audioCoordinator.subscribe((state) => {
      if (state && typeof state.baseVolume === 'number') {
        setVolume(state.baseVolume);
        if (state.baseVolume > 0) prevVolumeRef.current = state.baseVolume;
        setIsMuted(state.baseVolume === 0);
      }
    });
    return unsub;
  }, []);

  const handleVolumeChange = (newVal) => {
    const clamped = Math.max(0, Math.min(1, newVal));
    setVolume(clamped);
    if (clamped > 0) prevVolumeRef.current = clamped;
    setIsMuted(clamped === 0);
    audioCoordinator.setUserVolume(clamped);
  };

  const toggleMute = () => {
    if (volume > 0) {
      prevVolumeRef.current = volume;
      handleVolumeChange(0);
    } else {
      handleVolumeChange(prevVolumeRef.current || 0.7);
    }
  };

  // Graceful close: trigger artwork return animation before invoking onClose
  const handleRequestClose = () => {
    if (isClosing) return;
    setIsClosing(true);
  };

  // Keyboard navigation: Escape key returns smoothly to player
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleRequestClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isClosing]);

  // Preload incoming artwork and keep previous cover visible until ready
  useEffect(() => {
    if (prevSeedRef.current !== seed) {
      setGlideDir(1);
      prevSeedRef.current = seed;
    }

    if (highQualityArt === displayedArt && highQualityArt === activeArtRef.current) {
      return;
    }

    if (!highQualityArt) {
      activeArtRef.current = null;
      setDisplayedArt(null);
      return;
    }

    const token = ++loadTokenRef.current;
    const img = new Image();
    img.src = highQualityArt;

    const commitArt = () => {
      if (token !== loadTokenRef.current) return;
      activeArtRef.current = highQualityArt;
      setDisplayedArt(highQualityArt);
    };

    if (img.complete) {
      commitArt();
    } else {
      img.onload = commitArt;
      img.onerror = () => {
        if (token === loadTokenRef.current) {
          activeArtRef.current = highQualityArt;
          setDisplayedArt(highQualityArt);
        }
      };
    }
  }, [highQualityArt, seed, displayedArt]);

  const lines = lyricsData?.lines || [];
  const isSynced = Boolean(lyricsData?.isSynced);
  const hasWordSync = Boolean(lyricsData?.hasWordSync);
  const playing = media?.status === 'playing';

  const lyricsPresentation = useMemo(
    () => getTrackLyricsPresentation(lines, seed, lyricsStyle),
    [lines, seed, lyricsStyle]
  );

  // Fluid cubic-bezier auto-scroll
  useEffect(() => {
    if (!showLyrics || !autoScroll || !isSynced || userScrollingRef.current) return;
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
    const duration = Math.min(300, Math.max(140, Math.abs(change) * 0.7));
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
  }, [activeLineIndex, autoScroll, isSynced, showLyrics]);

  // Detect user manual scroll to pause auto-scroll for 2.8s
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

  // Scrubbing pointer handlers
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

  const handleSkip = (seconds) => {
    const targetMs = Math.max(0, Math.min(hasDuration ? media.durationMs : Infinity, effectivePosition + seconds * 1000));
    if (onSeek) {
      onSeek(targetMs / 1000);
    }
  };

  return (
    <div
      className="full-lyrics"
      style={{
        '--lyric-accent': accentColor || 'var(--accent, #ff3b69)',
      }}
    >
      {/* 1. Top Bar: Segmented Tabs (Artwork / Concert) + Close Button */}
      <div className="full-lyrics__top-bar">
        <div className="full-lyrics__seg-control" role="tablist" aria-label="View selector">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'artwork'}
            className={`full-lyrics__seg-btn${activeTab === 'artwork' ? ' is-active' : ''}`}
            onClick={() => setActiveTab('artwork')}
          >
            <span>Artwork</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'concert'}
            className={`full-lyrics__seg-btn${activeTab === 'concert' ? ' is-active' : ''}`}
            onClick={() => setActiveTab('concert')}
          >
            <span>Concert</span>
          </button>
        </div>

        <button
          type="button"
          className="full-lyrics__close-btn"
          onClick={handleRequestClose}
          title="Return to Player (Esc)"
          aria-label="Return to player"
        >
          <Icon.Close width={12} height={12} />
        </button>
      </div>

      {/* Main Body */}
      {activeTab === 'concert' ? (
        /* Restrained, Minimal Concert Mode Placeholder */
        <div className="full-lyrics__concert-pane">
          <div className="full-lyrics__concert-msg-wrap">
            <span className="full-lyrics__concert-msg">Concert mode — coming later</span>
            <div className="full-lyrics__concert-track-meta">
              <span className="full-lyrics__concert-track-title">{media?.title || 'Now Playing'}</span>
              <span className="full-lyrics__concert-track-artist">{media?.artist || 'Unknown artist'}</span>
            </div>
          </div>
        </div>
      ) : (
        /* Approved Compact Artwork & Lyrics Layout */
        <div className={`full-lyrics__body${!showLyrics ? ' is-lyrics-hidden' : ''}`}>
          {/* Centered Artwork + Song Metadata */}
          <div className="full-lyrics__hero">
            {/* Square Artwork Frame with Single-Layer Compositor Transform Glide */}
            <motion.div
              layoutId="island-album-art-wrap"
              className={`full-lyrics__hero-art-wrap${!showLyrics ? ' full-lyrics__hero-art-wrap--large' : ''}`}
              initial={
                isReducedMotion
                  ? false
                  : {
                      x: travelDelta?.x ?? -153,
                      y: travelDelta?.y ?? 2,
                      scale: travelDelta?.scale ?? (64 / 126),
                      borderRadius: 24,
                    }
              }
              animate={
                isClosing
                  ? {
                      x: travelDelta?.x ?? -153,
                      y: travelDelta?.y ?? 2,
                      scale: travelDelta?.scale ?? (64 / 126),
                      borderRadius: 24,
                    }
                  : {
                      x: 0,
                      y: 0,
                      scale: 1,
                      borderRadius: !showLyrics ? 16 : 14,
                    }
              }
              transition={{
                duration: isReducedMotion ? 0.01 : 0.38,
                ease: [0.22, 1, 0.36, 1],
              }}
              onAnimationComplete={() => {
                if (isClosing) {
                  onClose?.();
                }
              }}
            >
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.div
                  key={displayedArt || seed}
                  className="full-lyrics__art-slide"
                  initial={
                    isInitialMountRef.current || isReducedMotion
                      ? false
                      : { opacity: 0, x: 24 * glideDir }
                  }
                  animate={{ opacity: 1, x: 0 }}
                  exit={isReducedMotion ? { opacity: 0 } : { opacity: 0, x: -24 * glideDir }}
                  transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                >
                  {displayedArt ? (
                    <motion.img
                      layoutId="island-album-art-img"
                      src={displayedArt}
                      alt={media?.title || 'Album artwork'}
                      className="full-lyrics__hero-art"
                      transition={sharedLyricsTransition}
                    />
                  ) : (
                    <Art src={null} seed={seed} size={showLyrics ? 126 : 152} radius={14} />
                  )}
                </motion.div>
              </AnimatePresence>
            </motion.div>

            {/* Song Title and Artist Underneath (Full available width, wraps naturally) */}
            <motion.div
              layoutId="island-track-meta"
              className="full-lyrics__hero-meta"
              transition={sharedLyricsTransition}
              animate={{ opacity: isClosing ? 0 : 1 }}
            >
              <div className="full-lyrics__hero-title" title={media?.title}>
                {media?.title || 'Unknown title'}
              </div>
              <div className="full-lyrics__hero-artist" title={media?.artist}>
                {media?.artist || 'Unknown artist'}
              </div>
            </motion.div>
          </div>

          {/* Compact Lyrics Viewport (70-85px) Beneath Artwork */}
          {showLyrics && (
            <motion.div
              className="full-lyrics__right"
              animate={{ opacity: isClosing ? 0 : 1 }}
              transition={{ duration: 0.2 }}
            >
              <div
                ref={containerRef}
                className="full-lyrics__scroller"
                onScroll={handleScroll}
              >
                <div className="full-lyrics__padding-top" />

                {!isSynced && lines.length > 0 && (
                  <div className="full-lyrics__unsynced-notice">
                    <Icon.Music width={11} height={11} />
                    <span>Plain lyrics (unsynchronized)</span>
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
                    const pres = lyricsPresentation[idx] || { style: lyricsStyle };

                    let lineClass = 'full-lyrics__line';
                    if (!isSynced) lineClass += ' is-plain';
                    else if (isActive) lineClass += ' is-active';
                    else if (isPast) lineClass += ' is-past';
                    else if (isFuture) lineClass += ' is-future';

                    const showWordKaraoke =
                      isSynced &&
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
                              if (
                                pres?.style === 'kinetic' &&
                                pres?.kineticEffect &&
                                pres?.targetWord &&
                                w.text.trim().toLowerCase() === pres.targetWord.trim().toLowerCase()
                              ) {
                                wordClass += ` k-fx-${pres.kineticEffect}`;
                              }
                              return (
                                <span key={wIdx} className={wordClass}>
                                  {w.text}{' '}
                                </span>
                              );
                            })}
                          </span>
                        ) : (
                          <span>
                            {pres?.style === 'kinetic' && pres?.kineticEffect && pres.targetWord ? (
                              (() => {
                                const raw = line.text || '';
                                const start = pres.startIndex != null ? pres.startIndex : raw.indexOf(pres.targetWord);
                                const end = pres.endIndex != null ? pres.endIndex : (start >= 0 ? start + pres.targetWord.length : -1);
                                if (start >= 0 && end > start) {
                                  const before = raw.slice(0, start);
                                  const target = raw.slice(start, end);
                                  const after = raw.slice(end);
                                  return (
                                    <>
                                      {before}
                                      <span className={`k-fx-${pres.kineticEffect}`}>{target}</span>
                                      {after}
                                    </>
                                  );
                                }
                                return raw;
                              })()
                            ) : (
                              line.text
                            )}
                          </span>
                        )}
                      </div>
                    );
                  })
                )}

                <div className="full-lyrics__padding-bottom" />
              </div>
            </motion.div>
          )}
        </div>
      )}

      {/* Bottom Region: Progress Bar & Approved 6-Button Toolbar */}
      <motion.div
        layoutId="island-progress-wrap"
        className="full-lyrics__bottom-bar"
        transition={sharedLyricsTransition}
        animate={{ opacity: isClosing ? 0 : 1 }}
      >
        {/* Playback progress and timestamps beneath lyrics */}
        <div className="full-lyrics__progress">
          <span className="time-text">{formatTrackTime(effectivePosition)}</span>
          <div
            ref={barRef}
            className={`full-lyrics__bar${isScrubbing ? ' is-scrubbing' : ''}`}
            onPointerDown={handlePointerDown}
            role="slider"
            aria-label="Seek track position"
            aria-valuemin={0}
            aria-valuemax={media?.durationMs || 100}
            aria-valuenow={effectivePosition}
            tabIndex={0}
            style={{ cursor: 'pointer' }}
          >
            {hasDuration && (
              <div
                className="full-lyrics__fill"
                style={{ width: `${pct}%`, background: accentColor || 'var(--lyric-accent, #ff3b69)' }}
              >
                <div className="full-lyrics__thumb" />
              </div>
            )}
          </div>
          <span className="time-text">
            {hasDuration ? formatTrackTime(media?.durationMs) : 'Live'}
          </span>
        </div>

        {/* Approved Six-Button Toolbar */}
        <div className="full-lyrics__controls-row">
          {/* Left: Heart (Favorite), Music Note (Show/Hide Lyrics), Volume */}
          <div className="full-lyrics__controls-left">
            {toggleFavorite && (
              <button
                type="button"
                className={`heart-btn heart-btn--bottom${isFavorite ? ' is-favorite' : ''}`}
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

            <button
              type="button"
              className={`lyrics-toggle-btn${showLyrics ? ' is-active' : ''}`}
              onClick={() => setShowLyrics((prev) => !prev)}
              title={showLyrics ? 'Hide Lyrics' : 'Show Lyrics'}
              aria-label={showLyrics ? 'Hide Lyrics' : 'Show Lyrics'}
            >
              <Icon.Music width={13} height={13} />
            </button>

            {/* Volume Button & Mini Popover Slider */}
            <div
              className="full-lyrics__vol-ctrl"
              onMouseEnter={() => setShowVolumeSlider(true)}
              onMouseLeave={() => setShowVolumeSlider(false)}
            >
              <button
                type="button"
                className={`icon-btn icon-btn--sm full-lyrics__vol-btn${isMuted ? ' is-muted' : ''}`}
                onClick={toggleMute}
                title={isMuted ? 'Unmute' : `Volume: ${Math.round(volume * 100)}%`}
                aria-label="Volume"
              >
                {isMuted ? <Icon.VolumeX width={13} height={13} /> : <Icon.Volume2 width={13} height={13} />}
              </button>
              {showVolumeSlider && (
                <div className="full-lyrics__vol-slider-wrap">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.02"
                    value={volume}
                    onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                    className="full-lyrics__vol-slider"
                    aria-label="Volume slider"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Right: Previous, Play/Pause, Next */}
          <div className="full-lyrics__controls-right">
            <button
              type="button"
              className="icon-btn icon-btn--sm"
              aria-label="Previous track"
              onClick={() => onControl('previous')}
              title="Previous"
            >
              <Icon.Prev width={14} height={14} />
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
              <Icon.Next width={14} height={14} />
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
