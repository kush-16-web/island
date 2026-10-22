import { useEffect, useRef, useState } from 'react';
import { formatTrackTime } from '../lib/format';
import { useLyrics } from '../hooks/useLyrics';
import { Art, Empty } from './bits';
import { Icon } from './icons';
import { island } from '../lib/bridge';
import MarqueeText from './MarqueeText';
import MiniLyrics from './MiniLyrics';
import FullLyrics from './FullLyrics';
import VideoPiP from './VideoPiP';
import FavoritesMenu from './FavoritesMenu';
import { isTrackFavorite, addFavorite, removeFavorite } from '../lib/favorites';
import { playFavoriteTrack } from '../lib/music-actions';

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

  // Automatically reset to cinema view for video/trailers, or standard player for music
  useEffect(() => {
    const nextMode = isVideoSource ? 'cinema' : 'player';
    setViewMode(nextMode);
    onLyricsViewChange?.(nextMode === 'player' ? false : nextMode);
  }, [isVideoSource, media.title]);
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

  // Notify parent of view mode change for dynamic height adjustment
  const handleSetViewMode = (mode) => {
    setViewMode(mode);
    onLyricsViewChange?.(mode === 'player' ? false : mode);
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
      addFavorite(media);
      setIsFavorite(true);
    }
  };

  const handlePlayFavoriteTrack = (item) => {
    return playFavoriteTrack(item, {
      media,
      onControl,
      onOpenUrl: (url) => window.island?.media?.openUrl?.(url),
      storage: typeof window !== 'undefined' ? window.localStorage : null,
    });
  };

  // Update view mode when active track or source changes
  useEffect(() => {
    handleSetViewMode(isVideoSource ? 'cinema' : 'player');
    setIsScrubbing(false);
    setScrubPositionMs(null);
  }, [media.title, media.artist, isVideoSource]);

  // If synchronized lyrics are found for this track, ensure we show the music/lyrics player
  useEffect(() => {
    if (lyricsData?.lines && lyricsData.lines.length > 0) {
      handleSetViewMode('player');
    }
  }, [lyricsData?.lines?.length]);

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

  if (!media.active) {
    return (
      <Empty
        icon={Icon.Music}
        title="Nothing playing"
        hint="Start audio or video in Spotify, your browser, or any media player and it will show up here."
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

  if (viewMode === 'lyrics') {
    return (
      <FullLyrics
        media={media}
        lyricsData={lyricsData}
        loading={loading}
        activeLineIndex={activeLineIndex}
        currentPositionMs={displayPosition}
        onControl={onControl}
        onClose={() => handleSetViewMode(isVideoSource ? 'cinema' : 'player')}
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

              <button
                type="button"
                className={`cinema-hud__switch-btn${showSongArt ? ' is-active' : ''}`}
                onClick={() => setShowSongArt((prev) => !prev)}
                title={showSongArt ? 'Switch to Studio Poster' : 'View Living Canvas Song Art'}
              >
                <Icon.Sparkles width={11} height={11} />
                <span>{showSongArt ? 'Poster' : 'Song Art'}</span>
              </button>

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

  // Standard Music Player View
  return (
    <div className="np">
      <div className="np__main">
        {/* Left Column: Cover + Title + Artist */}
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
          </div>
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
            onClick={() => handleSetViewMode('lyrics')}
          />

          <div className="np__right-tabs np__right-tabs--bottom">
            <button
              type="button"
              className={`np__tab-pill${viewMode === 'lyrics' ? ' is-active' : ''}`}
              onClick={() => handleSetViewMode('lyrics')}
              title="Open Synchronized Lyrics"
            >
              <Icon.Music width={11} height={11} />
              <span>Lyrics</span>
            </button>
            <button
              type="button"
              className={`np__tab-pill${viewMode === 'cinema' ? ' is-active' : ''}`}
              onClick={() => handleSetViewMode('cinema')}
              title="Switch to Fullscreen Cinema PiP"
            >
              <Icon.Video width={11} height={11} />
              <span>Cinema</span>
            </button>
            <button
              type="button"
              className={`np__tab-pill${viewMode === 'favorites' ? ' is-active' : ''}`}
              onClick={() => handleSetViewMode('favorites')}
              title="Open Favorites Menu"
            >
              <Icon.Heart width={11} height={11} filled={isFavorite} />
              <span>Favorites</span>
            </button>
          </div>
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
      </div>
    </div>
  );
}
