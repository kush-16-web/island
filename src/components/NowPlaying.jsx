import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, LayoutGroup } from 'framer-motion';
import { formatTrackTime } from '../lib/format';
import { useLyrics } from '../hooks/useLyrics';
import { useHighResArt } from '../hooks/useHighResArt';
import { Art, Empty } from './bits';
import { Icon } from './icons';
import { island } from '../lib/bridge';
import MarqueeText from './MarqueeText';
import MiniLyrics from './MiniLyrics';
import FullLyrics, { sharedLyricsTransition } from './FullLyrics';
import VideoPiP from './VideoPiP';
import FavoritesMenu from './FavoritesMenu';
import { isTrackFavorite, addFavorite, removeFavorite, healFavoriteWithExactId } from '../lib/favorites';
import { playFavoriteTrack, getFriendlyProviderName } from '../lib/music-actions';
import {
  getLyricsStyle,
  setLyricsStyle,
  LYRICS_STYLES,
  getLyricsLayout,
  setLyricsLayout,
  LYRICS_LAYOUTS,
} from '../lib/lyrics-style-engine';

// Living Canvas fine-art mode is dormant during Pass 2.2.6 while building toward Cinema Mode
const ENABLE_CANVAS_ART = false;

export default function NowPlaying({
  media,
  platform,
  onControl,
  accentColor,
  onLyricsViewChange,
  videoStream,
  videoStreamActive,
  youtubeId,
}) {
  const { displayArt } = useHighResArt(media);
  // Music sources: dedicated music apps, YouTube Music, or any song with lyrics
  const isMusicApp = Boolean(
    media.app && /spotify|apple music|itunes|tidal|deezer|foobar|amazon music|pandora|qobuz|winamp/i.test(media.app)
  );

  // Video sessions: dedicated video players, Netflix, or explicit video playback type
  const isVideoSession = Boolean(
    media.playbackType === 'Video' ||
    (media.app && /netflix|vlc|mpv|potplayer/i.test(media.app)) ||
    (media.title && /trailer|official trailer|teaser|netflix/i.test(media.title))
  );

  const isVideoSource = !isMusicApp && (
    isVideoSession ||
    Boolean(media.app && /chrome|edge|brave|firefox/i.test(media.app) && !media.artist && /trailer|clip|gameplay|val|official video|watch\?v=/i.test(media.title || ''))
  );

  const [viewMode, setViewMode] = useState(() => (isVideoSource ? 'cinema' : 'player'));
  const [showSongArt, setShowSongArt] = useState(false);
  const [hudVisible, setHudVisible] = useState(true);
  const hudTimerRef = useRef(null);

  const handleUserActivity = () => {
    setHudVisible(true);
    if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
    hudTimerRef.current = setTimeout(() => {
      setHudVisible(false);
    }, 2800);
  };

  const handleMouseLeave = () => {
    if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
    setHudVisible(false);
  };

  useEffect(() => {
    return () => {
      if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
    };
  }, []);

  // Video source transition: only switch to cinema if a dedicated video source begins
  // and user is not currently in Full Lyrics
  const prevIsVideoSourceRef = useRef(isVideoSource);
  useEffect(() => {
    if (isVideoSource && !prevIsVideoSourceRef.current) {
      if (viewMode !== 'lyrics') {
        handleSetViewMode('cinema');
      }
    }
    prevIsVideoSourceRef.current = isVideoSource;
  }, [isVideoSource, viewMode]);
  const playing = media.status === 'playing';
  const [localNow, setLocalNow] = useState(Date.now);

  // Scrubbing & optimistic seek state
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubPositionMs, setScrubPositionMs] = useState(null);
  const [optimisticSeek, setOptimisticSeek] = useState(null); // { posMs, timestamp }
  const barRef = useRef(null);

  useEffect(() => {
    if (!playing) return undefined;
    let animId;
    let lastTick = 0;
    const tick = () => {
      const now = Date.now();
      if (now - lastTick >= 20) {
        lastTick = now;
        setLocalNow(now);
      }
      animId = requestAnimationFrame(tick);
    };
    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
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

  const npContainerRef = useRef(null);
  const playerCoverRef = useRef(null);
  const popoverRef = useRef(null);
  const [isSourceCoverHidden, setIsSourceCoverHidden] = useState(false);
  const [travelDelta, setTravelDelta] = useState({ x: -153, y: 2, scale: 64 / 126 });

  // Safety: whenever viewMode is not 'lyrics', ensure source cover is NEVER hidden
  useEffect(() => {
    if (viewMode !== 'lyrics' && isSourceCoverHidden) {
      setIsSourceCoverHidden(false);
    }
  }, [viewMode, isSourceCoverHidden]);

  // Notify parent of view mode change for dynamic height adjustment
  const handleSetViewMode = (mode) => {
    if (mode !== 'lyrics') {
      setIsSourceCoverHidden(false);
    }
    setViewMode(mode);
    onLyricsViewChange?.(mode === 'player' ? false : mode);
  };

  // Lyrics Appearance & Layout State (floating/normal, classic/kinetic)
  const [lyricsStyle, setLyricsStyleState] = useState(getLyricsStyle);
  const [lyricsLayout, setLyricsLayoutState] = useState(getLyricsLayout);
  const [showLyricsStylePopover, setShowLyricsStylePopover] = useState(false);

  useEffect(() => {
    if (!showLyricsStylePopover) return;
    const handleOutsideClick = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setShowLyricsStylePopover(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setShowLyricsStylePopover(false);
      }
    };
    window.addEventListener('pointerdown', handleOutsideClick);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handleOutsideClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showLyricsStylePopover]);

  const handleSelectLyricsStyle = (newStyle) => {
    setLyricsStyleState(newStyle);
    setLyricsStyle(newStyle);
  };

  const handleSelectLyricsLayout = (newLayout) => {
    setLyricsLayoutState(newLayout);
    setLyricsLayout(newLayout);
  };

  const openFullLyricsWithGlide = () => {
    let delta = { x: -153, y: 2, scale: 64 / 126 };
    if (playerCoverRef.current && npContainerRef.current) {
      const p = playerCoverRef.current.getBoundingClientRect();
      const c = npContainerRef.current.getBoundingClientRect();
      if (p.width > 0 && c.width > 0) {
        // Measure source position relative to common container
        const srcLeft = p.left - c.left;
        const srcTop = p.top - c.top;
        // In FullLyrics, top navbar is hidden so FullLyrics starts at container top
        // Destination artwork is 126px wide, centered in container
        const destLeft = (c.width - 126) / 2;
        // Destination top in FullLyrics: 8px padding + 26px top-bar + 4px margin = 38px
        const destTop = 38;
        delta = {
          x: Math.round(srcLeft - destLeft),
          y: Math.round(srcTop - destTop),
          scale: Math.max(0.2, Math.min(1, p.width / 126)),
        };
      }
    }
    setTravelDelta(delta);
    setIsSourceCoverHidden(true);
    handleSetViewMode('lyrics');
  };

  // Unified favorite track state
  const [isFavorite, setIsFavorite] = useState(() => isTrackFavorite(media));

  useEffect(() => {
    setIsFavorite(isTrackFavorite(media));
    const handleFavChange = () => {
      setIsFavorite(isTrackFavorite(media));
    };
    window.addEventListener('island:favorites-changed', handleFavChange);
    return () => window.removeEventListener('island:favorites-changed', handleFavChange);
  }, [media.title, media.artist]);

  // Listen for navigation events (e.g. from Jadu "show_favorites")
  useEffect(() => {
    const handleNav = (e) => {
      if (e.detail?.viewMode === 'favorites') {
        handleSetViewMode('favorites');
      }
    };
    window.addEventListener('island:navigate', handleNav);
    return () => window.removeEventListener('island:navigate', handleNav);
  }, []);

  const toggleFavorite = (e) => {
    e.stopPropagation();
    if (isFavorite) {
      removeFavorite(media);
      setIsFavorite(false);
    } else {
      const isSpotify =
        (media.app || '').toLowerCase().includes('spotify') ||
        (media.rawAppId || '').toLowerCase().includes('spotify');
      addFavorite(media, null, isSpotify ? null : companionState);
      setIsFavorite(true);
    }
  };

  const [companionState, setCompanionState] = useState(() => (typeof window !== 'undefined' && window.__islandCompanionState) || null);
  const [playbackFeedback, setPlaybackFeedback] = useState(null);

  useEffect(() => {
    if (window.island?.companion?.getStatus) {
      window.island.companion
        .getStatus()
        .then((status) => {
          setCompanionState(status);
          if (typeof window !== 'undefined') window.__islandCompanionState = status;
        })
        .catch(() => {});
    }

    const unsubStatus = window.island?.on?.('companion:status-changed', (data) => {
      const nextStatus = data?.info || data;
      setCompanionState(nextStatus);
      if (typeof window !== 'undefined') window.__islandCompanionState = nextStatus;
    });

    const unsubPlayback = window.island?.on?.('companion:playback-state', (data) => {
      if (data?.event === 'playing') {
        setPlaybackFeedback({ state: 'confirmed_playing', text: 'Confirmed playing' });
        if (data.videoId && (data.title || data.raw?.title)) {
          const trackTitle = data.title || data.raw?.title;
          healFavoriteWithExactId(trackTitle, data.videoId);
        }
      } else if (data?.event === 'autoplay_blocked') {
        setPlaybackFeedback({ state: 'autoplay_blocked', text: 'Autoplay blocked by browser. Click Play in YouTube Music.' });
      } else if (data?.event === 'failed') {
        setPlaybackFeedback({ state: 'failed', text: data.error || 'Playback failed' });
      }
    });

    return () => {
      unsubStatus?.();
      unsubPlayback?.();
    };
  }, []);

  const handlePlayFavoriteTrack = (item) => {
    const res = playFavoriteTrack(item, {
      media,
      companion: companionState,
      onControl,
      onOpenUrl: (url) => window.island?.media?.openUrl?.(url),
      onDispatchCompanion: (cmd) => {
        try {
          const p = window.island?.companion?.dispatchCommand?.(cmd);
          if (p && typeof p.catch === 'function') {
            p.catch((err) => console.warn('[NowPlaying] dispatchCommand error:', err.message));
          }
          return p;
        } catch (e) {
          return null;
        }
      },
      storage: typeof window !== 'undefined' ? window.localStorage : null,
    });

    if (res && res.playbackState) {
      const providerName = getFriendlyProviderName(item.provider);
      if (res.playbackState === 'playback_requested') {
        setPlaybackFeedback({ state: 'playback_requested', text: `Requesting ${item.title} on ${providerName}...` });
      } else if (res.playbackState === 'opening_provider') {
        setPlaybackFeedback({ state: 'opening_provider', text: `Opening ${item.title} in ${providerName}...` });
      }
    }
    return res;
  };

  // Reset scrubbing and optimistic seek on track change without altering player view navigation
  useEffect(() => {
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

  if (viewMode === 'favorites') {
    return (
      <FavoritesMenu
        onPlayTrack={handlePlayFavoriteTrack}
        onClose={() => handleSetViewMode(isVideoSource ? 'cinema' : 'player')}
        accentColor={accentColor}
      />
    );
  }

  // If not in full lyrics mode and media is inactive, show empty state.
  // Full Lyrics stays mounted during track changes and transient metadata gaps.
  if (!media.active && viewMode !== 'lyrics') {
    let emptyTitle = 'Nothing playing';
    let emptyHint = 'Start audio or video in Spotify, your browser, or any media player and it will show up here.';

    if (playbackFeedback?.state === 'autoplay_blocked') {
      emptyTitle = 'Autoplay Paused';
      emptyHint = 'YouTube Music loaded the song, but your browser requires a single click to start audio. Please click Play in YouTube Music.';
    } else if (playbackFeedback?.state === 'playback_requested') {
      emptyTitle = 'Connecting to Player...';
      emptyHint = playbackFeedback.text;
    } else if (playbackFeedback?.state === 'opening_provider') {
      emptyTitle = 'Opening Provider...';
      emptyHint = playbackFeedback.text;
    }

    return (
      <Empty
        icon={Icon.Music}
        title={emptyTitle}
        hint={emptyHint}
        action={
          <button
            type="button"
            className="fav-browse-btn"
            onClick={() => handleSetViewMode('favorites')}
            title="Browse and play your saved favorites"
          >
            <Icon.Heart width={12} height={12} filled style={{ color: accentColor || 'var(--music-accent, #ff3b69)' }} />
            <span>Browse Favorites</span>
          </button>
        }
      />
    );
  }

  const handleSkip = (seconds) => {
    const targetMs = Math.max(0, Math.min(hasDuration ? media.durationMs : Infinity, displayPosition + seconds * 1000));
    setOptimisticSeek({ posMs: targetMs, timestamp: Date.now() });
    island?.media?.seek?.(targetMs / 1000);
  };

  // Widescreen Cinema PiP Player (YouTube Fullscreen HUD: Full video with overlay title & controls)
  if (viewMode === 'cinema') {
    return (
      <div
        className={`cinema-pip cinema-pip--yt-hud${hudVisible ? ' is-hud-visible' : ''}`}
        onMouseMove={handleUserActivity}
        onMouseEnter={handleUserActivity}
        onMouseLeave={handleMouseLeave}
      >
        <div className="cinema-pip__stage">
          <VideoPiP
            media={media}
            accentColor={accentColor}
            displayPosition={displayPosition}
            youtubeId={youtubeId || media?.youtubeId}
            stream={videoStream}
            streamActive={videoStreamActive}
            showSongArt={showSongArt}
          />

          {/* YouTube Fullscreen Style Top Overlay */}
          <div className="cinema-hud__top">
            <div className="cinema-hud__meta">
              <MarqueeText text={media.title} className="cinema-hud__title" />
              <div className="cinema-hud__subrow">
                <span className="cinema-hud__app">{media.app || 'YouTube'}</span>
                {media.artist && <span className="cinema-hud__dot">•</span>}
                {media.artist && <span className="cinema-hud__artist">{media.artist}</span>}
              </div>
            </div>

            <div className="cinema-hud__actions">
              <button
                type="button"
                className={`heart-btn heart-btn--hud${isFavorite ? ' is-favorite' : ''}`}
                onClick={toggleFavorite}
                aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                style={{ '--heart-color': accentColor || 'var(--music-accent, #ff3b69)' }}
                title={isFavorite ? 'Favorited' : 'Favorite'}
              >
                {isFavorite ? <Icon.HeartSolid width={13} height={13} /> : <Icon.Heart width={13} height={13} />}
              </button>

              {ENABLE_CANVAS_ART && (
                <button
                  type="button"
                  className={`cinema-hud__switch-btn${showSongArt ? ' is-active' : ''}`}
                  onClick={() => setShowSongArt((prev) => !prev)}
                  title={showSongArt ? 'Switch to Studio Poster' : 'View Living Canvas Song Art'}
                >
                  <Icon.Sparkles width={11} height={11} />
                  <span>{showSongArt ? 'Poster' : 'Song Art'}</span>
                </button>
              )}

              <button
                type="button"
                className="cinema-hud__switch-btn"
                onClick={() => handleSetViewMode('player')}
                title="Switch to Music View"
              >
                <Icon.Music width={11} height={11} />
                <span>Music View</span>
              </button>
            </div>
          </div>

          {/* YouTube Fullscreen Style Bottom Overlay */}
          <div className="cinema-hud__bottom">
            <div className="np__progress np__progress--hud">
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

            <div className="np__controls np__controls--hud">
              <button type="button" className="icon-btn icon-btn--hud" aria-label="Previous track" onClick={() => onControl('previous')} title="Previous">
                <Icon.Prev width={18} height={18} />
              </button>
              <button type="button" className="icon-btn icon-btn--hud icon-btn--skip" aria-label="Rewind 5 seconds" onClick={() => handleSkip(-5)} title="Rewind 5s">
                <Icon.Replay5 width={20} height={20} />
              </button>
              <button type="button" className="play-btn play-btn--hud" aria-label={playing ? 'Pause' : 'Play'} onClick={() => onControl('playpause')}>
                {playing ? <Icon.Pause width={22} height={22} /> : <Icon.Play width={22} height={22} />}
              </button>
              <button type="button" className="icon-btn icon-btn--hud icon-btn--skip" aria-label="Forward 5 seconds" onClick={() => handleSkip(5)} title="Forward 5s">
                <Icon.Forward5 width={20} height={20} />
              </button>
              <button type="button" className="icon-btn icon-btn--hud" aria-label="Next track" onClick={() => onControl('next')} title="Next">
                <Icon.Next width={18} height={18} />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Shared Music Player & Full Lyrics Views with FLIP Layout Transitions & Position Glider
  return (
    <div
      ref={npContainerRef}
      className="np-outer-wrapper"
      style={{ position: 'relative', width: '100%', height: '100%' }}
    >
      <LayoutGroup id="nowplaying-lyrics-group">
        <AnimatePresence mode="popLayout" initial={false}>
          {viewMode === 'lyrics' ? (
            <motion.div
              key="lyrics-view"
              className="np-view-wrapper np-view-wrapper--lyrics"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.28 }}
            >
              <FullLyrics
                media={media}
                displayArt={displayArt}
                lyricsData={lyricsData}
                loading={loading}
                activeLineIndex={activeLineIndex}
                currentPositionMs={displayPosition}
                onControl={onControl}
                onClose={() => {
                  setIsSourceCoverHidden(false);
                  handleSetViewMode(isVideoSource ? 'cinema' : 'player');
                }}
                accentColor={accentColor}
                isFavorite={isFavorite}
                toggleFavorite={toggleFavorite}
                travelDelta={travelDelta}
                lyricsStyle={lyricsStyle}
                onLyricsStyleChange={setLyricsStyleState}
                lyricsLayout={lyricsLayout}
                onLyricsLayoutChange={setLyricsLayoutState}
                onSeek={(posSec) => {
                  setOptimisticSeek({ posMs: posSec * 1000, timestamp: Date.now() });
                  island?.media?.seek?.(posSec);
                }}
              />
            </motion.div>
          ) : (
            <motion.div
              key="player-view"
              className="np-view-wrapper np-view-wrapper--player"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.28 }}
            >
              <div className="np" ref={npContainerRef}>
                <div className="np__main">
                  {/* Left Column: Cover + Title + Artist */}
                  <div className="np__left">
                    <motion.div
                      ref={playerCoverRef}
                      layoutId="island-album-art-wrap"
                      className="np__cover-wrap np__cover-wrap--clickable"
                      transition={sharedLyricsTransition}
                      onClick={() => handleSetViewMode('cinema')}
                      role="button"
                      tabIndex={0}
                      aria-label="Open Cinema Mode"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleSetViewMode('cinema');
                        }
                      }}
                      style={{
                        opacity: isSourceCoverHidden ? 0 : 1,
                      }}
                    >
                      {displayArt ? (
                        <motion.img
                          layoutId="island-album-art-img"
                          src={displayArt}
                          alt=""
                          className="np__cover-img"
                          transition={sharedLyricsTransition}
                        />
                      ) : (
                        <Art src={null} seed={seed} size={64} radius={12} />
                      )}
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
                    </motion.div>
                    <motion.div
                      layoutId="island-track-meta"
                      className="np__meta"
                      transition={sharedLyricsTransition}
                    >
                      <MarqueeText text={media.title} className="np__title" />
                      <MarqueeText text={media.artist || 'Unknown artist'} className="np__artist" />
                    </motion.div>
                  </div>

                  {/* Right Column: Mini Lyrics + Tab pills at bottom-right */}
                  <div className="np__right">
                    <MiniLyrics
                      lyricsData={lyricsData}
                      loading={loading}
                      activeLineIndex={activeLineIndex}
                      currentPositionMs={displayPosition}
                      playing={playing}
                      accentColor={accentColor}
                      onClick={openFullLyricsWithGlide}
                      lyricsStyle={lyricsStyle}
                      trackSeed={seed}
                    />

                    <div className="np__right-tabs np__right-tabs--bottom">
                      <div className="np__lyrics-popover-anchor" ref={popoverRef}>
                        <button
                          type="button"
                          className={`np__tab-pill${showLyricsStylePopover ? ' is-active' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowLyricsStylePopover((prev) => !prev);
                          }}
                          title="Choose lyrics appearance"
                          aria-label="Choose lyrics appearance"
                        >
                          <Icon.Music width={11} height={11} />
                          <span>Lyrics</span>
                        </button>
                        {showLyricsStylePopover && (
                          <div
                            className="np__lyrics-popover"
                            role="dialog"
                            aria-label="Lyrics appearance selector"
                            style={{
                              '--popover-accent': accentColor || 'var(--accent, #ff3b69)',
                            }}
                          >
                            <div className="np__lyrics-popover-header">Lyrics Layout</div>
                            <button
                              type="button"
                              className={`np__lyrics-popover-option${lyricsLayout === LYRICS_LAYOUTS.FLOATING ? ' is-active' : ''}`}
                              onClick={() => handleSelectLyricsLayout(LYRICS_LAYOUTS.FLOATING)}
                            >
                              <div className="np__lyrics-option-info">
                                <span className="np__lyrics-option-title">Floating</span>
                                <span className="np__lyrics-option-desc">Cinematic typography around artwork</span>
                              </div>
                            </button>
                            <button
                              type="button"
                              className={`np__lyrics-popover-option${lyricsLayout === LYRICS_LAYOUTS.NORMAL ? ' is-active' : ''}`}
                              onClick={() => handleSelectLyricsLayout(LYRICS_LAYOUTS.NORMAL)}
                            >
                              <div className="np__lyrics-option-info">
                                <span className="np__lyrics-option-title">Normal</span>
                                <span className="np__lyrics-option-desc">Classic synchronized scrolling</span>
                              </div>
                            </button>

                            <div className="np__lyrics-popover-header" style={{ marginTop: '6px' }}>Typography</div>
                            <button
                              type="button"
                              className={`np__lyrics-popover-option${lyricsStyle === LYRICS_STYLES.CLASSIC ? ' is-active' : ''}`}
                              onClick={() => handleSelectLyricsStyle(LYRICS_STYLES.CLASSIC)}
                            >
                              <div className="np__lyrics-option-info">
                                <span className="np__lyrics-option-title">Classic</span>
                                <span className="np__lyrics-option-desc">Original clean typography</span>
                              </div>
                            </button>
                            <button
                              type="button"
                              className={`np__lyrics-popover-option${lyricsStyle === LYRICS_STYLES.KINETIC ? ' is-active' : ''}`}
                              onClick={() => handleSelectLyricsStyle(LYRICS_STYLES.KINETIC)}
                            >
                              <div className="np__lyrics-option-info">
                                <span className="np__lyrics-option-title">Kinetic</span>
                                <span className="np__lyrics-option-desc">Meaning-aware subtle effects</span>
                              </div>
                            </button>
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        className={`np__tab-pill${viewMode === 'favorites' ? ' is-active' : ''}`}
                        onClick={() => handleSetViewMode('favorites')}
                        title="Open Favorites Menu"
                      >
                        <Icon.Library width={11} height={11} />
                        <span>Favorites</span>
                      </button>
                    </div>
                  </div>
                </div>

                <motion.div
                  layoutId="island-progress-wrap"
                  className="np__bottom"
                  transition={sharedLyricsTransition}
                >
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
                    <button type="button" className="icon-btn" aria-label="Previous track" onClick={() => onControl('previous')} title="Previous">
                      <Icon.Prev width={18} height={18} />
                    </button>
                    <button type="button" className="icon-btn icon-btn--skip" aria-label="Rewind 5 seconds" onClick={() => handleSkip(-5)} title="Rewind 5s">
                      <Icon.Replay5 width={20} height={20} />
                    </button>
                    <button type="button" className="play-btn" aria-label={playing ? 'Pause' : 'Play'} onClick={() => onControl('playpause')}>
                      {playing ? <Icon.Pause width={20} height={20} /> : <Icon.Play width={20} height={20} />}
                    </button>
                    <button type="button" className="icon-btn icon-btn--skip" aria-label="Forward 5 seconds" onClick={() => handleSkip(5)} title="Forward 5s">
                      <Icon.Forward5 width={20} height={20} />
                    </button>
                    <button type="button" className="icon-btn" aria-label="Next track" onClick={() => onControl('next')} title="Next">
                      <Icon.Next width={18} height={18} />
                    </button>
                  </div>
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </LayoutGroup>

    </div>
  );
}
