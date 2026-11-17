import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import AmbientLiquidMetaballs from '../AmbientLiquidMetaballs';
import SongProgressBar from '../SongProgressBar';
import MusicVolumeControl from '../MusicVolumeControl';
import CompanionEyes from '../CompanionEyes';
import PrecisionLyricLine from '../PrecisionLyricLine';
import { useHighResArt } from '../../hooks/useHighResArt';
import { useLyrics } from '../../hooks/useLyrics';
import { extractCoverColor } from '../../lib/colorExtract';
import { Icon } from '../icons';
import './cinema-player.css';

const ATMOSPHERE_OPTIONS = [
  { id: 'dynamic', name: 'Liquid Metaballs' },
  { id: 'shards', name: 'Aero Shards' },
  { id: 'classic', name: 'Classic Aura' },
  { id: 'galaxy', name: 'Galaxy' },
  { id: 'ghost-fibers', name: 'Ghost Fibers' },
  { id: 'gradient-waves', name: 'Gradient Waves' },
  { id: 'light-rays', name: 'Light Rays' },
];

const CINEMA_LINE_HEIGHT = 84; // Vertical pitch for large cinematic lyrics

export default function CinemaPlayer() {
  const [media, setMedia] = useState(() => {
    try {
      const saved = localStorage.getItem('island_media_cache');
      return saved ? JSON.parse(saved) : { active: false };
    } catch {
      return { active: false };
    }
  });

  const [isPlaying, setIsPlaying] = useState(false);
  const [localNow, setLocalNow] = useState(Date.now);
  const [optimisticSeek, setOptimisticSeek] = useState(null); // { posMs, timestamp }

  // Volume state matching Island.jsx
  const [volume, setVolume] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = Number(localStorage.getItem('island_music_volume'));
      return Number.isFinite(saved) && saved > 0 && saved <= 100 ? saved : 75;
    }
    return 75;
  });
  const [isMuted, setIsMuted] = useState(false);
  const [volumeSupported, setVolumeSupported] = useState(true);
  const lastKnownVolumeRef = useRef(volume > 0 ? volume : 75);

  const [selectedEffect, setSelectedEffect] = useState(() => {
    try {
      return localStorage.getItem('island_metaballs_mode') || 'dynamic';
    } catch {
      return 'dynamic';
    }
  });
  const [showAtmosphereMenu, setShowAtmosphereMenu] = useState(false);
  const [isIdle, setIsIdle] = useState(false);

  const idleTimerRef = useRef(null);

  // High-Res Artwork resolution
  const { displayArt } = useHighResArt(media);

  // Dynamic Accent Color Extraction from Artwork
  const [extractedAccent, setExtractedAccent] = useState(null);

  useEffect(() => {
    const artSource = displayArt || media?.art;
    if (!artSource) {
      setExtractedAccent(null);
      return;
    }
    let cancelled = false;
    extractCoverColor(artSource, (col) => {
      if (!cancelled && col) {
        setExtractedAccent(col);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [displayArt, media?.art]);

  const accentColor = extractedAccent || media?.accentColor || media?.color || '#ffffff';

  // Microsecond smooth requestAnimationFrame ticker matching NowPlaying.jsx
  useEffect(() => {
    if (!isPlaying) return undefined;
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
  }, [isPlaying, media?.reportedAt, media?.positionMs]);

  // Clear optimistic seek once SMTC catches up or after 3s timeout
  useEffect(() => {
    if (optimisticSeek) {
      const diff = Math.abs((media?.positionMs || 0) - optimisticSeek.posMs);
      if (diff < 2000 || Date.now() - optimisticSeek.timestamp > 3000) {
        setOptimisticSeek(null);
      }
    }
  }, [media?.positionMs, optimisticSeek]);

  const basePosMs = Number.isFinite(media?.positionMs)
    ? media.positionMs
    : (Number(media?.positionSec) || Number(media?.position) || 0) * 1000;
  const reportedAtMs = Number.isFinite(media?.reportedAt)
    ? media.reportedAt
    : (Number(media?.updatedAt) || localNow);
  const effectiveDurationMs = Number.isFinite(media?.durationMs)
    ? media.durationMs
    : (Number(media?.durationSec) || Number(media?.duration) || 0) * 1000;
  const elapsed = isPlaying ? Math.max(0, localNow - reportedAtMs) : 0;
  const hasDuration = effectiveDurationMs > 0;
  const rawPosition = Math.min(hasDuration ? effectiveDurationMs : Infinity, Math.max(0, basePosMs + elapsed));

  let displayPositionMs = rawPosition;
  if (optimisticSeek && Date.now() - optimisticSeek.timestamp < 3000) {
    const optElapsed = isPlaying ? Date.now() - optimisticSeek.timestamp : 0;
    displayPositionMs = Math.min(hasDuration ? effectiveDurationMs : Infinity, Math.max(0, optimisticSeek.posMs + optElapsed));
  }

  // Real-time Synced Lyrics
  const [injectedLyrics, setInjectedLyrics] = useState(() => (typeof window !== 'undefined' && window.__mockLyricsData ? window.__mockLyricsData : null));
  const { lyricsData: realLyricsData, activeLineIndex: realActiveLineIndex } = useLyrics(media, displayPositionMs);
  const effectiveLyrics = (realLyricsData && realLyricsData.found && realLyricsData.lines?.length > 0)
    ? realLyricsData
    : (injectedLyrics || realLyricsData);
  const activeLineIndex = useMemo(() => {
    if (realActiveLineIndex >= 0 && (!injectedLyrics || (realLyricsData && realLyricsData.found))) {
      return realActiveLineIndex;
    }
    const l = effectiveLyrics?.lines;
    if (!l || l.length === 0) return -1;
    let idx = -1;
    for (let i = 0; i < l.length; i++) {
      const lineTime = typeof l[i].timeMs === 'number'
        ? l[i].timeMs
        : (Number(l[i].time) || 0) * 1000;
      if (lineTime <= displayPositionMs) {
        idx = i;
      } else {
        break;
      }
    }
    return idx;
  }, [realActiveLineIndex, effectiveLyrics, injectedLyrics, realLyricsData, displayPositionMs]);

  useEffect(() => {
    const handleMockLyrics = () => {
      if (window.__mockLyricsData) setInjectedLyrics(window.__mockLyricsData);
    };
    window.addEventListener('cinema:mock-lyrics', handleMockLyrics);
    return () => window.removeEventListener('cinema:mock-lyrics', handleMockLyrics);
  }, []);

  // Sync with main process media state
  useEffect(() => {
    if (window.island?.getState) {
      window.island.getState().then((s) => {
        if (s?.media) {
          setMedia(s.media);
          setIsPlaying(s.media.status === 'playing');
        }
      }).catch(() => {});
    }

    if (window.island?.on) {
      const unsubMedia = window.island.on('media', (m) => {
        if (m) {
          setMedia(m);
          setIsPlaying(m.status === 'playing');
        }
      });
      const unsubAura = window.island.on('aura:settings-changed', (s) => {
        if (s?.mode) setSelectedEffect(s.mode);
      });
      return () => {
        unsubMedia?.();
        unsubAura?.();
      };
    }
    return undefined;
  }, []);

  // Sync volume with main process
  useEffect(() => {
    if (window.island?.media?.getVolume) {
      window.island.media.getVolume().then((res) => {
        if (res && Number.isFinite(res.volume)) {
          setVolume(res.volume);
          if (res.volume > 0) lastKnownVolumeRef.current = res.volume;
          setIsMuted(Boolean(res.muted));
        }
      }).catch(() => {});
    }
    if (window.island?.on) {
      const unsub = window.island.on('media:volume-changed', (data) => {
        if (Number.isFinite(data?.volume)) {
          setVolume(data.volume);
          if (data.volume > 0) lastKnownVolumeRef.current = data.volume;
        }
        if (typeof data?.muted === 'boolean') {
          setIsMuted(data.muted);
        }
      });
      return () => unsub?.();
    }
    return undefined;
  }, []);

  const handleVolumeChange = useCallback((nextVal, meta = {}) => {
    const clamped = Math.max(0, Math.min(100, Math.round(Number(nextVal))));
    if (!Number.isFinite(clamped)) return;
    const prevKnown = lastKnownVolumeRef.current;
    setVolume(clamped);
    if (clamped > 0) {
      setIsMuted(false);
      lastKnownVolumeRef.current = clamped;
      if (typeof window !== 'undefined' && meta?.phase !== 'move') {
        localStorage.setItem('island_music_volume', String(clamped));
      }
    }
    if (window.island?.media?.setVolume) {
      window.island.media.setVolume(clamped).then((res) => {
        if (!res) return;
        if (res.coalesced) return;
        if (res.ok === false || res.supported === false) {
          setVolumeSupported(false);
          setVolume(prevKnown);
          return;
        }
        setVolumeSupported(true);
      }).catch(() => {});
    }
  }, []);

  const handleToggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      const restoreVol = lastKnownVolumeRef.current > 0 ? lastKnownVolumeRef.current : 75;
      if (!next) {
        setVolume(restoreVol);
      }
      window.island?.media?.setMute?.(next)?.catch?.(() => {});
      return next;
    });
  }, []);


  // Idle hide timer for mouse controls
  const resetIdleTimer = useCallback(() => {
    setIsIdle(false);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      setIsIdle(true);
      setShowAtmosphereMenu(false);
    }, 3500);
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', resetIdleTimer);
    window.addEventListener('keydown', resetIdleTimer);
    resetIdleTimer();
    return () => {
      window.removeEventListener('mousemove', resetIdleTimer);
      window.removeEventListener('keydown', resetIdleTimer);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [resetIdleTimer]);

  // Keyboard shortcuts (Escape / F11 to exit, Space to toggle, arrows to skip)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' || e.key === 'F11') {
        e.preventDefault();
        window.island?.closeCinema?.();
      } else if (e.key === ' ') {
        e.preventDefault();
        handleControl('playpause');
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleSkip(-5);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleSkip(5);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [displayPositionMs, isPlaying, effectiveDurationMs]);

  const handleControl = (action) => {
    if (action === 'playpause') {
      setIsPlaying((p) => !p);
    }
    if (window.island?.media?.control) {
      window.island.media.control(action);
    }
  };

  const handleSeek = (posSec) => {
    const targetMs = Math.max(0, Math.min(hasDuration ? effectiveDurationMs : Infinity, posSec * 1000));
    setOptimisticSeek({ posMs: targetMs, timestamp: Date.now() });
    if (window.island?.media?.seek) {
      window.island.media.seek(posSec);
    }
  };

  const handleSkip = (deltaSec) => {
    const targetMs = Math.max(0, Math.min(hasDuration ? effectiveDurationMs : Infinity, displayPositionMs + deltaSec * 1000));
    setOptimisticSeek({ posMs: targetMs, timestamp: Date.now() });
    if (window.island?.media?.seek) {
      window.island.media.seek(targetMs / 1000);
    }
  };

  const handleSelectAtmosphere = (id) => {
    setSelectedEffect(id);
    setShowAtmosphereMenu(false);
    try {
      localStorage.setItem('island_metaballs_mode', id);
      window.dispatchEvent(new CustomEvent('island:metaballs-mode-changed', { detail: id }));
      if (window.island?.setAuraSettings) {
        window.island.setAuraSettings({ mode: id });
      }
    } catch {}
  };

  const lines = effectiveLyrics?.lines || [];
  const hasLyrics = lines.length > 0;
  const hasActiveLine = activeLineIndex >= 0 && activeLineIndex < lines.length;
  const safeActiveIndex = hasActiveLine ? activeLineIndex : 0;

  const viewportRef = useRef(null);
  const rowRefs = useRef([]);
  const [reelY, setReelY] = useState(0);

  // Measure and align active row to center of viewport with smooth spring physics
  useEffect(() => {
    const measureAndCenter = () => {
      if (!viewportRef.current) return;
      const vpH = viewportRef.current.clientHeight || 420;
      const activeEl = rowRefs.current[safeActiveIndex];
      if (activeEl) {
        const activeMid = activeEl.offsetTop + activeEl.offsetHeight / 2;
        setReelY(vpH / 2 - activeMid);
      } else {
        setReelY(0);
      }
    };
    measureAndCenter();
    window.addEventListener('resize', measureAndCenter);
    return () => window.removeEventListener('resize', measureAndCenter);
  }, [safeActiveIndex, lines.length]);

  return (
    <div
      className={`cinema-container${isIdle ? ' is-idle' : ''}`}
      style={{ '--music-accent': accentColor }}
    >
      {/* 0. Fullscreen Ambient Album Art Blurred Background Layer */}
      {displayArt && (
        <div className="cinema-ambient-art" aria-hidden="true">
          <img src={displayArt} alt="" className="cinema-ambient-art__img" />
          <div className="cinema-ambient-art__overlay" />
        </div>
      )}

      {/* 1. Fullscreen Ambient Visualizer Canvas (Metaballs) */}
      <div className="cinema-canvas-layer" aria-hidden="true">
        <AmbientLiquidMetaballs
          mode={selectedEffect}
          accentColor={accentColor}
          isPlaying={isPlaying}
          blurPx={1.5}
          reactive={true}
          isLoopbackDisabled={false}
          originX={0.69}
          originY={0.50}
        />
      </div>
      <div className="cinema-canvas-scrim" aria-hidden="true" />

      {/* 2. Top Header Navigation */}
      <header className="cinema-header">
        <div className="cinema-brand">
          <div className="cinema-brand__eyes" title="Island Pet">
            <CompanionEyes size="sm" mood={isPlaying ? 'music' : 'idle'} animationsEnabled={true} />
          </div>
          <span className="cinema-brand__title">Cinema Mode</span>
        </div>

        <button
          type="button"
          className="cinema-exit-btn"
          onClick={() => window.island?.closeCinema?.()}
          title="Exit Fullscreen (Esc)"
        >
          <span className="cinema-exit-kbd">Esc</span>
        </button>
      </header>

      {/* 3. Main Split Stage */}
      <main className="cinema-stage">
        {/* Left Column: Artwork, Info, Atmosphere Dropdown, Big Controls */}
        <section className="cinema-left">
          <div className="cinema-cover-wrap">
            {displayArt ? (
              <img src={displayArt} alt={media?.title || 'Album artwork'} className="cinema-cover-img" />
            ) : (
              <div className="cinema-cover-img" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#131622' }}>
                <Icon.Music width={64} height={64} style={{ opacity: 0.3 }} />
              </div>
            )}
          </div>

          <div className="cinema-meta">
            <h1 className="cinema-title" title={media?.title || 'No Title'}>
              {media?.title || 'Waiting for music...'}
            </h1>
            <p className="cinema-artist" title={media?.artist || 'Unknown Artist'}>
              {media?.artist || 'Playback inactive'}
            </p>
          </div>

          {/* Atmosphere Visualizer Dropdown with Relevant Layers Icon */}
          <div className="cinema-atmosphere-row">
            <button
              type="button"
              className="cinema-atmosphere-btn"
              onClick={() => setShowAtmosphereMenu((prev) => !prev)}
            >
              <Icon.Layers width={14} height={14} />
              <span>
                Atmosphere: {ATMOSPHERE_OPTIONS.find((a) => a.id === selectedEffect)?.name || 'Custom'}
              </span>
              <span style={{ fontSize: '10px', opacity: 0.7 }}>▾</span>
            </button>

            {showAtmosphereMenu && (
              <div className="cinema-atmosphere-menu">
                {ATMOSPHERE_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={`cinema-atmosphere-item${selectedEffect === opt.id ? ' is-selected' : ''}`}
                    onClick={() => handleSelectAtmosphere(opt.id)}
                  >
                    <span>{opt.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Large Player Controls */}
          <div className="cinema-controls">
            {/* Smooth Seekable Progress Bar with Direct Seeking */}
            <div className="cinema-progress-row">
              <SongProgressBar
                positionMs={displayPositionMs}
                durationMs={effectiveDurationMs}
                playing={isPlaying}
                reportedAt={reportedAtMs}
                accentColor={accentColor}
                onSeek={(posSec) => handleSeek(posSec)}
                canSeek={media?.canSeek !== false}
                className="cinema-progress-bar"
              />
            </div>

            {/* Buttons Row */}
            <div className="cinema-buttons-row">
              <button
                type="button"
                className="cinema-btn"
                onClick={() => handleControl('previous')}
                title="Previous track"
              >
                <Icon.Prev width={20} height={20} />
              </button>

              <button
                type="button"
                className="cinema-btn"
                onClick={() => handleSkip(-5)}
                title="Rewind 5 seconds"
              >
                <Icon.Replay5 width={20} height={20} />
              </button>

              <button
                type="button"
                className="cinema-play-btn"
                onClick={() => handleControl('playpause')}
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Icon.Pause width={24} height={24} /> : <Icon.Play width={24} height={24} />}
              </button>

              <button
                type="button"
                className="cinema-btn"
                onClick={() => handleSkip(5)}
                title="Forward 5 seconds"
              >
                <Icon.Forward5 width={20} height={20} />
              </button>

              <button
                type="button"
                className="cinema-btn"
                onClick={() => handleControl('next')}
                title="Next track"
              >
                <Icon.Next width={20} height={20} />
              </button>
            </div>

            {/* Authentic Shared Pill Volume Control */}
            <div className="cinema-volume-row">
              <MusicVolumeControl
                volume={volume}
                muted={isMuted}
                supported={volumeSupported}
                onVolumeChange={handleVolumeChange}
                onToggleMute={handleToggleMute}
                className="cinema-volume-control"
              />
            </div>
          </div>
        </section>

        {/* Right Column: Centered Focused Lyrics Reel with Natural Line Wrapping */}
        <section className="cinema-right">
          {hasLyrics ? (
            <div className="cinema-lyrics-reel" ref={viewportRef}>
              <motion.div
                className="cinema-lyrics-reel__inner"
                animate={{ y: reelY }}
                transition={{ type: 'spring', stiffness: 220, damping: 28 }}
              >
                {lines.map((line, idx) => {
                  const isActive = hasActiveLine && idx === activeLineIndex;
                  const distance = hasActiveLine ? Math.abs(idx - activeLineIndex) : idx;
                  const isWordSynced = Boolean(line?.syncType === 'word' || (line?.words && line.words.length > 0));
                  let lineClass = 'cinema-lyric-line';
                  if (isWordSynced) lineClass += ' is-word-synced';
                  if (isActive) lineClass += ' is-active';
                  else if (distance === 1) lineClass += ' is-adjacent';
                  else lineClass += ' is-far';

                  return (
                    <div
                      key={line.id ?? line.timeMs ?? idx}
                      ref={(el) => { rowRefs.current[idx] = el; }}
                      className={`cinema-lyric-row${isActive ? ' is-active' : distance === 1 ? ' is-adjacent' : ' is-far'}`}
                      onClick={() => {
                        if (!isActive && typeof line.timeMs === 'number') {
                          handleSeek(line.timeMs / 1000);
                        }
                      }}
                    >
                      {isActive ? (
                        <PrecisionLyricLine
                          line={line}
                          currentPositionMs={displayPositionMs}
                          playing={isPlaying}
                          className={lineClass}
                        />
                      ) : (
                        <div className={lineClass}>
                          {line.text || '...'}
                        </div>
                      )}
                    </div>
                  );
                })}
              </motion.div>
            </div>
          ) : (
            <div className="cinema-lyrics-empty">
              <div className="cinema-lyrics-empty__icon">
                <Icon.Music width={24} height={24} />
              </div>
              <p className="cinema-lyrics-empty__title">
                {media?.active ? 'Enjoy the Atmosphere' : 'No Active Song'}
              </p>
              <p className="cinema-lyrics-empty__sub">
                {media?.active ? 'Synchronized lyrics unavailable for this track' : 'Play a track in YouTube Music or Spotify'}
              </p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
