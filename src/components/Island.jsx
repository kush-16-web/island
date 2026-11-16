import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useIsland } from '../hooks/useIsland';
import { useNow } from '../hooks/useNow';
import { useLyrics } from '../hooks/useLyrics';
import { startChime, stopChime } from '../lib/chime';
import { extractCoverColor } from '../lib/colorExtract';
import { formatAlarmTime, formatClock, formatRemaining, hueFrom } from '../lib/format';
import {
  NOTCH_STATES,
  NOTCH_EVENTS,
  HUB_W,
  transitionNotchState,
  evaluateNotchVisibility,
  computeNotchDimensions,
} from '../lib/notch-state';
import { MOTION, getMotionTransition } from '../lib/motion';
import { getIdleNotchPrefs, resolveIdleDisplayFlags } from '../lib/idle-prefs';
import { useThemeMode } from './common/useThemeMode';
import { Art, Avatar, Equalizer, Ring, kindColor } from './bits';
import CompanionEyes from './CompanionEyes';
import MusicVolumeControl from './MusicVolumeControl';
import PrecisionLyricLine from './PrecisionLyricLine';
import Hub from './Hub';
import { Icon } from './icons';
import AmbientLiquidMetaballs from './AmbientLiquidMetaballs';
import { useVideoAmbient, isVideoMedia } from '../hooks/useVideoAmbient';
import { useRealtimeVoice } from '../hooks/useRealtimeVoice';
import { getAssistantName } from '../lib/assistant';

const SIZE = {
  idle: { w: 200, h: 36 },
  voice: { w: 220, h: 38 },
  timer: { w: 196, h: 38 },
  media: { w: 220, h: 38 },
  both: { w: 260, h: 38 },
  toast: { w: 384, h: 66 },
  ring: { w: 404, h: 94 },
};

const NOTCH_TRANSITION = MOTION.notch;

function View({ w, h, className = '', children }) {
  return (
    <div className={`view ${className}`} style={{ width: w, height: h }}>
      {children}
    </div>
  );
}

function CompactView({ mode, media, nextTimer, now, musicColor, playing, width }) {
  const showMedia = mode === 'media' || mode === 'both';
  const showTimer = mode === 'timer' || mode === 'both';
  const isBoth = mode === 'both';
  const remaining = nextTimer ? nextTimer.fireAt - now : 0;
  const fraction = nextTimer ? remaining / nextTimer.durationMs : 0;
  const middle = showMedia ? media.title : nextTimer && nextTimer.label;
  return (
    <View w={width} h={SIZE[mode].h} className={`compact ${isBoth ? 'compact--both' : ''}`}>
      {showMedia ? (
        <Art src={media.art} seed={`${media.title}${media.artist}`} size={26} radius={8} />
      ) : (
        <Ring fraction={fraction} size={22} color="var(--c-timer)" />
      )}
      <span className="compact__title">{middle}</span>
      {isBoth && (
        <div className="compact__mid-eq">
          <Equalizer color={musicColor} playing={playing} />
        </div>
      )}
      {showTimer ? (
        <span className="compact__time">{formatRemaining(remaining)}</span>
      ) : (
        <Equalizer color={musicColor} playing={playing} />
      )}
    </View>
  );
}

function CompactVoiceView({ voice, width }) {
  const assistantName = getAssistantName();
  let dotClass = 'is-listening';
  let stateLabel = 'Listening';

  if (voice.status === 'understanding' || voice.status === 'thinking' || voice.status === 'processing') {
    dotClass = 'is-thinking';
    stateLabel = 'Understanding';
  } else if (voice.status === 'acknowledging') {
    dotClass = 'is-speaking';
    stateLabel = 'Opening';
  } else if (voice.status === 'executing' || voice.status === 'awaiting_result') {
    dotClass = 'is-thinking';
    stateLabel = 'Connecting player';
  } else if (voice.status === 'completed') {
    dotClass = 'is-speaking';
    stateLabel = 'Playing';
  } else if (voice.status === 'needs_user_action') {
    dotClass = 'is-cooldown';
    stateLabel = 'Action needed';
  } else if (voice.status === 'failed' || voice.status === 'error') {
    dotClass = 'is-error';
    stateLabel = 'Failed';
  } else if (voice.status === 'speaking') {
    dotClass = 'is-speaking';
    stateLabel = 'Speaking';
  } else if (voice.status === 'preparing_speech') {
    dotClass = 'is-thinking';
    stateLabel = 'Preparing';
  } else if (voice.status === 'connecting') {
    dotClass = 'is-connecting';
    stateLabel = 'Connecting';
  } else if (voice.status === 'cooldown') {
    dotClass = 'is-cooldown';
    stateLabel = 'Resting';
  }

  return (
    <View w={width} h={SIZE.voice.h} className="compact compact--voice">
      <span className={`compact-voice-dot ${dotClass}`} />
      <div className="compact-voice-bars">
        {Array.from({ length: 6 }).map((_, i) => (
          <span
            key={i}
            className={`compact-voice-bar ${dotClass}`}
            style={{
              height: `${Math.max(4, Math.round((voice.waveformData?.[i * 2] || 0.1) * 22))}px`,
            }}
          />
        ))}
      </div>
      <span className="compact__title">{assistantName}: {stateLabel}</span>
    </View>
  );
}

function ToastView({ toast }) {
  return (
    <View w={SIZE.toast.w} h={SIZE.toast.h} className="toast">
      <Avatar app={toast.app} kind={toast.kind} size={40} />
      <div className="toast__text">
        <div className="toast__title">{toast.title}</div>
        {toast.body && <div className="toast__body">{toast.body}</div>}
      </div>
    </View>
  );
}

function RingView({ ring, actions }) {
  const { item, kind } = ring;
  const isAlarm = kind === 'alarm';
  const title = item.label || (isAlarm ? 'Alarm' : 'Timer');
  const sub = isAlarm ? formatAlarmTime(item.time) : item.snoozed ? 'Snooze is over' : "Time's up";
  return (
    <View w={SIZE.ring.w} h={SIZE.ring.h} className="ringing">
      <div className={`ringing__icon ${isAlarm ? 'is-alarm' : 'is-timer'}`}>
        {isAlarm ? <Icon.Bell width={18} height={18} /> : <Icon.Timer width={18} height={18} />}
      </div>
      <div className="ringing__text">
        <div className="ringing__title">{title}</div>
        <div className="ringing__sub">{sub}</div>
      </div>
      <div className="ringing__actions">
        <button type="button" className="btn btn--soft" onClick={() => actions.snoozeRing(ring)}>
          {isAlarm ? 'Snooze 5 min' : '+1 min'}
        </button>
        <button type="button" className="btn btn--hot" onClick={() => actions.dismissRing(ring.key)}>
          Stop
        </button>
      </div>
    </View>
  );
}

function HoverPreviewView({
  mode,
  media,
  playing,
  nextTimer,
  now,
  voice,
  musicColor,
  isDynamicMode,
  actions,
  onOpenHub,
  width,
  height,
  activeLine,
  nextLine,
  volume,
  muted,
  volumeSupported,
  volumeUnavailableReason,
  onVolumeChange,
  onToggleMute,
  reducedMotion,
}) {
  if (mode === 'media' || mode === 'both') {
    const lyricKey = activeLine ? `${activeLine.timeMs ?? activeLine.text}` : 'none';
    const lyricText = activeLine?.text || '';
    const slotBudgetPx = 196;
    const measuredWidth = lyricText ? measureTextWidth(lyricText, '500 11.5px Geist, -apple-system, sans-serif') : 0;
    const lineDurationMs = activeLine && nextLine && Number.isFinite(nextLine.timeMs) && Number.isFinite(activeLine.timeMs)
      ? Math.max(0, nextLine.timeMs - activeLine.timeMs)
      : 3200;
    const shouldWrap = measuredWidth > slotBudgetPx && lineDurationMs >= 1400;
    return (
      <View w={width} h={height} className="hover-preview hover-preview--media">
        <div className="hover-preview__media-grid">
          {/* LEFT: Small Artwork + Song Title + Artist */}
          <button
            type="button"
            className="hover-preview__media-info"
            onClick={(e) => {
              e.stopPropagation();
              onOpenHub('playing');
            }}
            title="Open Expanded Player"
          >
            <Art src={media.art} seed={`${media.title}${media.artist}`} size={38} radius={9} />
            <div className="hover-preview__meta">
              <div className="hover-preview__title">{media.title || 'Now Playing'}</div>
              <div className="hover-preview__sub">{media.artist || 'Unknown artist'}</div>
            </div>
          </button>

          {/* CENTER: ONE Synchronized Whole-Line White Lyric (no word-by-word animation in Hover) */}
          <div className="hover-preview__lyric-slot" aria-live="off">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={lyricKey}
                className="hover-preview__lyric-line"
                initial={reducedMotion ? { opacity: 1 } : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
                transition={getMotionTransition(MOTION.lyric, reducedMotion)}
              >
                {activeLine ? (
                  <span className={`hover-preview__lyric-text${shouldWrap ? ' is-wrapped' : ''}`}>
                    {lyricText}
                  </span>
                ) : (
                  <span className="hover-preview__lyric-text hover-preview__lyric-text--muted">
                    {playing ? 'Playing' : 'Paused'}
                  </span>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* RIGHT: Monochrome Playback Controls */}
          <div className="hover-preview__controls">
            <button
              type="button"
              className="hover-preview__ctrl-btn"
              onClick={(e) => {
                e.stopPropagation();
                actions.mediaControl('previous');
              }}
              aria-label="Previous track"
              title="Previous"
            >
              <Icon.Prev width={13} height={13} />
            </button>
            <button
              type="button"
              className="hover-preview__ctrl-btn hover-preview__ctrl-btn--primary"
              onClick={(e) => {
                e.stopPropagation();
                actions.mediaControl('playPause');
              }}
              aria-label={playing ? 'Pause' : 'Play'}
              title={playing ? 'Pause' : 'Play'}
            >
              {playing ? <Icon.Pause width={13} height={13} /> : <Icon.Play width={13} height={13} />}
            </button>
            <button
              type="button"
              className="hover-preview__ctrl-btn"
              onClick={(e) => {
                e.stopPropagation();
                actions.mediaControl('next');
              }}
              aria-label="Next track"
              title="Next"
            >
              <Icon.Next width={13} height={13} />
            </button>
          </div>
        </div>

        {/* BOTTOM: Shared Pill Music Volume Control */}
        <MusicVolumeControl
          compact
          volume={volume}
          muted={muted}
          supported={volumeSupported}
          unavailableReason={volumeUnavailableReason}
          onVolumeChange={onVolumeChange}
          onToggleMute={onToggleMute}
        />
      </View>
    );
  }

  if (mode === 'voice') {
    const assistantName = getAssistantName();
    return (
      <View w={width} h={height} className="hover-preview hover-preview--voice">
        <div className="hover-preview__row">
          <div className="hover-preview__meta">
            <div className="hover-preview__title">{assistantName} Voice</div>
            <div className="hover-preview__sub">{voice.status === 'speaking' ? 'Speaking…' : 'Listening…'}</div>
          </div>
          <button
            type="button"
            className="hover-preview__pill-btn"
            onClick={(e) => {
              e.stopPropagation();
              voice.stopSession?.();
            }}
          >
            End
          </button>
        </div>
      </View>
    );
  }

  if (mode === 'timer' && nextTimer) {
    const remaining = nextTimer.fireAt - now;
    const fraction = nextTimer ? remaining / nextTimer.durationMs : 0;
    return (
      <View w={width} h={height} className="hover-preview hover-preview--timer">
        <div className="hover-preview__row">
          <div className="hover-preview__timer-left">
            <Ring fraction={fraction} size={28} color="var(--c-timer)" />
            <div className="hover-preview__meta">
              <div className="hover-preview__title">{nextTimer.label || 'Timer'}</div>
              <div className="hover-preview__sub">{formatRemaining(remaining)} remaining</div>
            </div>
          </div>
          <button
            type="button"
            className="hover-preview__pill-btn"
            onClick={(e) => {
              e.stopPropagation();
              onOpenHub('clock');
            }}
          >
            Open
          </button>
        </div>
      </View>
    );
  }

  // Idle Hover Preview: restrained monochrome quick actions
  return (
    <View w={width} h={height} className="hover-preview hover-preview--idle">
      <div className="hover-preview__row">
        <div className="hover-preview__clock-block">
          <span className="hover-preview__clock">{formatClock(now)}</span>
        </div>
        <div className="hover-preview__quick-actions">
          <button
            type="button"
            className="hover-preview__pill-btn"
            onClick={(e) => {
              e.stopPropagation();
              voice.startSession();
              onOpenHub('voice');
            }}
            title="Talk to Island (Ctrl+Shift+Space)"
          >
            <Icon.Mic width={12} height={12} />
            <span>Voice</span>
          </button>
          <button
            type="button"
            className="hover-preview__pill-btn"
            onClick={(e) => {
              e.stopPropagation();
              window.island?.openWorkspace?.();
            }}
            title="Open AI Workspace"
          >
            <Icon.Sparkles width={12} height={12} />
            <span>AI</span>
          </button>
          <button
            type="button"
            className="hover-preview__ctrl-btn"
            onClick={(e) => {
              e.stopPropagation();
              window.island?.openSettings?.();
            }}
            title="Open Settings"
            aria-label="Open Settings"
          >
            <Icon.Sliders width={13} height={13} />
          </button>
        </div>
      </div>
    </View>
  );
}

const measureTextWidth = (text, font = '500 12.5px Geist, -apple-system, sans-serif') => {
  if (!text || typeof document === 'undefined') return 60;
  if (!measureTextWidth.canvas) {
    measureTextWidth.canvas = document.createElement('canvas');
  }
  const context = measureTextWidth.canvas.getContext('2d');
  context.font = font;
  return context.measureText(text).width;
};

export default function Island() {
  const { state: s, actions } = useIsland();
  const voice = useRealtimeVoice({ media: s.media, onControl: actions.mediaControl, schedule: s.schedule });
  const now = useNow(1000);
  const prefersReducedMotion = useReducedMotion();
  const { appearanceMode, isDynamic: isDynamicMode } = useThemeMode();

  const [notchState, setNotchState] = useState(NOTCH_STATES.COMPACT);
  const hubOpen = notchState === NOTCH_STATES.EXPANDED;
  const setHubOpen = useCallback((openOrFn) => {
    setNotchState((prev) => {
      const wantOpen = typeof openOrFn === 'function' ? openOrFn(prev === NOTCH_STATES.EXPANDED) : Boolean(openOrFn);
      return transitionNotchState(prev, wantOpen ? NOTCH_EVENTS.CLICK : NOTCH_EVENTS.COLLAPSE);
    });
  }, []);

  const [tab, setTab] = useState(s.media?.active ? 'playing' : 'launcher');
  const [hovered, setHovered] = useState(false);
  const [typing, setTyping] = useState(false);
  const [isLyricsFull, setIsLyricsFull] = useState(false);
  const [dock, setDock] = useState({ edge: 'top', preset: 'center', align: 'center' });
  const [visibilityMode, setVisibilityMode] = useState('always');
  const [idlePrefs, setIdlePrefs] = useState(getIdleNotchPrefs);
  const [volume, setVolume] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = Number(localStorage.getItem('island_music_volume'));
      return Number.isFinite(saved) && saved > 0 && saved <= 100 ? saved : 75;
    }
    return 75;
  });
  const [muted, setMuted] = useState(false);
  const [volumeSupported, setVolumeSupported] = useState(true);
  const [volumeUnavailableReason, setVolumeUnavailableReason] = useState('');
  const lastKnownVolumeRef = useRef(volume > 0 ? volume : 75);

  const handleVolumeChange = useCallback((nextVal, meta = {}) => {
    const clamped = Math.max(0, Math.min(100, Math.round(Number(nextVal))));
    if (!Number.isFinite(clamped)) return;
    const prevKnown = lastKnownVolumeRef.current;
    setVolume(clamped);
    if (clamped > 0) {
      setMuted(false);
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
          setVolumeUnavailableReason(res.reason || 'Volume control unavailable for this source');
          setVolume(prevKnown);
          return;
        }
        setVolumeSupported(true);
        setVolumeUnavailableReason('');
      }).catch(() => {});
    }
  }, []);

  const handleToggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      const restoreVol = lastKnownVolumeRef.current > 0 ? lastKnownVolumeRef.current : 75;
      if (!next) {
        setVolume(restoreVol);
      }
      window.island?.media?.setMute?.(next)?.then((res) => {
        if (!res) return;
        if (res.ok === false || res.supported === false) {
          setVolumeSupported(false);
          setVolumeUnavailableReason(res.reason || 'Mute unavailable for this source');
          return;
        }
        setVolumeSupported(true);
        setVolumeUnavailableReason('');
      })?.catch?.(() => {});
      return next;
    });
  }, []);

  // Sync real per-app volume from Windows audio session / companion when media becomes active
  useEffect(() => {
    if (!s.media?.active) return undefined;
    let cancelled = false;
    const syncExternalVolume = () => {
      window.island?.media?.getVolume?.().then((res) => {
        if (cancelled || !res) return;
        if (res.supported === false) {
          setVolumeSupported(false);
          setVolumeUnavailableReason(res.reason || 'Volume control unavailable for this source');
          return;
        }
        setVolumeSupported(true);
        setVolumeUnavailableReason('');
        if (Number.isFinite(res.volume)) {
          if (res.volume > 0) lastKnownVolumeRef.current = res.volume;
          setVolume(res.volume);
        }
        if (typeof res.muted === 'boolean') setMuted(res.muted);
      }).catch(() => {});
    };
    syncExternalVolume();
    const unsubVol = window.island?.on?.('media:volume-changed', (data) => {
      if (Number.isFinite(data?.volume)) {
        if (data.volume > 0) lastKnownVolumeRef.current = data.volume;
        setVolume(data.volume);
      }
      if (typeof data?.muted === 'boolean') setMuted(data.muted);
    });
    return () => {
      cancelled = true;
      unsubVol?.();
    };
  }, [s.media?.active, s.media?.app, notchState]);

  useEffect(() => {
    const onIdlePrefsChanged = (e) => {
      if (e.detail) setIdlePrefs(e.detail);
      else setIdlePrefs(getIdleNotchPrefs());
    };
    window.addEventListener('island:idle-prefs-changed', onIdlePrefsChanged);
    return () => window.removeEventListener('island:idle-prefs-changed', onIdlePrefsChanged);
  }, []);

  const hoverEnterTimerRef = useRef(null);
  const hoverLeaveTimerRef = useRef(null);

  const clearHoverTimers = useCallback(() => {
    if (hoverEnterTimerRef.current) {
      clearTimeout(hoverEnterTimerRef.current);
      hoverEnterTimerRef.current = null;
    }
    if (hoverLeaveTimerRef.current) {
      clearTimeout(hoverLeaveTimerRef.current);
      hoverLeaveTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearHoverTimers(), [clearHoverTimers]);

  // Sync dock position and notch visibility mode from Electron
  useEffect(() => {
    if (window.island?.getWindowDock) {
      window.island.getWindowDock().then((d) => {
        if (d && d.edge) setDock(d);
      }).catch(() => {});
    }
    if (window.island?.getNotchVisibilityMode) {
      window.island.getNotchVisibilityMode().then((m) => {
        if (m) setVisibilityMode(m);
      }).catch(() => {});
    }
    if (!window.island?.on) return undefined;

    const unsubDock = window.island.on('window:dock-changed', (d) => {
      if (d && d.edge) setDock(d);
    });
    const unsubVis = window.island.on('notch:visibility-changed', (data) => {
      if (data?.mode) setVisibilityMode(data.mode);
    });
    return () => {
      unsubDock?.();
      unsubVis?.();
    };
  }, []);

  const { schedule = [], inbox = [], media = { active: false }, toast, rings = [] } = s || {};
  const ring = rings[0] || null;
  const nextTimer = useMemo(
    () => (schedule || []).filter((i) => i.kind === 'timer').sort((a, b) => a.fireAt - b.fireAt)[0] || null,
    [schedule],
  );
  const playing = media.active && media.status === 'playing';
  const unread = (inbox || []).filter((n) => !n.read).length;

  // Companion mood reactions to meaningful events
  const [musicArriving, setMusicArriving] = useState(false);
  const prevMediaActiveRef = useRef(Boolean(media.active));
  useEffect(() => {
    if (media.active && !prevMediaActiveRef.current) {
      setMusicArriving(true);
      const t = setTimeout(() => setMusicArriving(false), 750);
      prevMediaActiveRef.current = true;
      return () => clearTimeout(t);
    }
    prevMediaActiveRef.current = Boolean(media.active);
    return undefined;
  }, [media.active]);

  let companionMood = 'idle';
  if (ring) companionMood = 'timer_complete';
  else if (voice.status !== 'idle') companionMood = 'voice';
  else if (toast) companionMood = 'notification';
  else if (musicArriving) companionMood = 'music_arriving';

  // Live position interpolation & cached lyrics for Hover Preview
  const [hoverTickNow, setHoverTickNow] = useState(Date.now);
  useEffect(() => {
    if (!playing || notchState !== NOTCH_STATES.HOVER_PREVIEW) return undefined;
    const id = setInterval(() => setHoverTickNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [playing, notchState]);

  const hoverPosMs = media.active
    ? Math.max(0, (media.positionMs || (media.positionSec || 0) * 1000) + (playing && media.updatedAt ? Math.max(0, hoverTickNow - media.updatedAt) : 0))
    : 0;
  const { lyricsData, activeLineIndex } = useLyrics(media, hoverPosMs);
  const activeHoverLine = lyricsData?.lines && activeLineIndex >= 0 ? lyricsData.lines[activeLineIndex] : null;
  const nextHoverLine = lyricsData?.lines && activeLineIndex >= 0 ? (lyricsData.lines[activeLineIndex + 1] || null) : null;

  let mode = 'idle';
  if (ring) mode = 'ring';
  else if (hubOpen) mode = 'hub';
  else if (voice.status !== 'idle') mode = 'voice';
  else if (toast) mode = 'toast';
  else if (nextTimer && media.active) mode = 'both';
  else if (nextTimer) mode = 'timer';
  else if (media.active) mode = 'media';

  const { isHidden, isPeeking } = evaluateNotchVisibility({
    visibilityMode,
    notchState,
    hasActiveMedia: Boolean(media.active || media.title),
    hasActiveTimer: Boolean(nextTimer),
    hasActiveVoice: voice.status !== 'idle',
    hasUrgentAlert: Boolean(ring || toast),
    hovered,
  });

  const getDynamicHubHeight = () => {
    switch (tab) {
      case 'launcher':
        return 388;
      case 'voice':
        return 340;
      case 'playing':
        if (isLyricsFull === 'favorites') return 380;
        if (isLyricsFull === 'lyrics' || isLyricsFull === true) return 390;
        if (isLyricsFull === 'cinema') return 315;
        if (!media.active) return 240;
        return 276;
      case 'clock': {
        const count = schedule.length;
        if (count === 0) return 214;
        return Math.min(384, 214 + count * 56);
      }
      case 'inbox': {
        const count = inbox.length;
        if (count === 0) return 175;
        return Math.min(340, 105 + count * 58);
      }
      case 'pet':
        return 410;
      case 'settings':
        return 355;
      default:
        return 280;
    }
  };

  const { width, height: calcHeight, bottomRadius } = computeNotchDimensions({
    notchState,
    mode,
    isPeeking,
    mediaTitle: media?.title || '',
    timerLabel: nextTimer?.label || '',
    tab,
    isLyricsFull,
    hasActiveMedia: media.active,
    scheduleCount: schedule.length,
    inboxCount: inbox.length,
    idlePrefs,
    measureTextFn: measureTextWidth,
  });

  // Dynamic Liquid Metaballs user preference (dynamic/white/off)
  const [metaballsMode, setMetaballsMode] = useState(() => {
    try {
      return localStorage.getItem('island_metaballs_mode') || 'dynamic';
    } catch {
      return 'dynamic';
    }
  });

  useEffect(() => {
    const handleMetaballsChange = (e) => {
      if (e.detail) setMetaballsMode(e.detail);
    };
    window.addEventListener('island:metaballs-mode-changed', handleMetaballsChange);
    return () => window.removeEventListener('island:metaballs-mode-changed', handleMetaballsChange);
  }, []);

  const height = (notchState === NOTCH_STATES.EXPANDED || mode === 'hub') && mode !== 'ring' && mode !== 'toast'
    ? (tab === 'playing' && !isLyricsFull && media.active ? 252 : calcHeight)
    : calcHeight;

  const handleNotchPointerEnter = useCallback(() => {
    setHovered(true);
    clearHoverTimers();
    hoverEnterTimerRef.current = setTimeout(() => {
      hoverEnterTimerRef.current = null;
      setNotchState((prev) => transitionNotchState(prev, NOTCH_EVENTS.POINTER_ENTER_READY));
    }, 115);
  }, [clearHoverTimers]);

  const handleNotchPointerLeave = useCallback(() => {
    setHovered(false);
    clearHoverTimers();
    hoverLeaveTimerRef.current = setTimeout(() => {
      hoverLeaveTimerRef.current = null;
      setNotchState((prev) => transitionNotchState(prev, NOTCH_EVENTS.POINTER_LEAVE_READY));
    }, 180);
  }, [clearHoverTimers]);

  const dragRef = useRef({
    active: false,
    startX: 0,
    lastX: 0,
    hasMoved: false,
    pointerId: null,
  });

  const openHub = useCallback((nextTab) => {
    clearHoverTimers();
    if (nextTab) setTab(nextTab);
    else if (!s.media?.active && tab === 'playing') setTab('launcher');
    setIsLyricsFull(false);
    setNotchState((prev) => transitionNotchState(prev, NOTCH_EVENTS.CLICK));
  }, [s.media?.active, tab, clearHoverTimers]);

  const expandedAtRef = useRef(0);
  const prevHubOpenRef = useRef(hubOpen);

  // Sync expanded state with Electron window focus
  useEffect(() => {
    if (hubOpen) {
      expandedAtRef.current = Date.now();
    }
    window.island?.setIslandExpanded?.(hubOpen);
  }, [hubOpen]);

  // When the expanded hub collapses, reset Full Lyrics full-height state to ensure
  // next expansion/reopening recovers clean compact player bounds.
  // The active voice session (Speaking / Thinking / Listening) persists seamlessly in the background!
  useEffect(() => {
    if (!hubOpen) {
      setIsLyricsFull(false);
    }
    if (prevHubOpenRef.current && !hubOpen) {
      window.island?.logLifecycle?.('hub:dismissed_session_preserved', {
        voiceStatus: voice.status,
      });
    }
    prevHubOpenRef.current = hubOpen;
  }, [hubOpen, voice.status]);

  // Click-outside dismissal: when the OS window blurs (user clicked Chrome, desktop, taskbar)
  useEffect(() => {
    if (!window.island?.on) return undefined;
    return window.island.on('window:blur', () => {
      // Grace period: ignore blur events that arrive right as the window is expanding (within 450ms)
      if (Date.now() - expandedAtRef.current < 450) {
        window.island?.logLifecycle?.('window:blur:ignored_grace_period', {
          deltaMs: Date.now() - expandedAtRef.current,
        });
        return;
      }
      window.island?.logLifecycle?.('window:blur:dismiss_hub');
      setHubOpen(false);
    });
  }, []);

  // Click-outside inside the overlay window and Escape key dismissal
  useEffect(() => {
    if (!hubOpen) return undefined;
    const onWindowPointerDown = (e) => {
      const el = e.target instanceof Element ? e.target : e.target?.parentElement;
      if (!el || (!el.closest('.island') && !el.closest('.pet-container') && !el.closest('.lyrics-settings-popover') && !el.closest('.np__lyrics-popover') && !el.closest('[data-hit]'))) {
        window.island?.logLifecycle?.('hub:dismiss_pointerdown_outside');
        setHubOpen(false);
      }
    };
    const onWindowKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (document.querySelector('.lyrics-settings-popover')) {
          return;
        }
        window.island?.logLifecycle?.('hub:dismiss_escape_key');
        setHubOpen(false);
      }
    };
    window.addEventListener('pointerdown', onWindowPointerDown);
    window.addEventListener('keydown', onWindowKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onWindowPointerDown);
      window.removeEventListener('keydown', onWindowKeyDown);
    };
  }, [hubOpen]);

  // Listen for navigation events (e.g. from voice music handoff to 'playing')
  useEffect(() => {
    const handleNav = (e) => {
      if (e.detail?.tab) {
        setTab(e.detail.tab);
        // Only open the hub if explicitly requested; if already dismissed, stay in compact mode
        if (e.detail.openHub && !hubOpen) {
          setHubOpen(true);
        }
      }
    };
    const handleDismissVoice = () => {
      setHubOpen(false);
    };
    window.addEventListener('island:navigate', handleNav);
    window.addEventListener('island:dismiss-voice', handleDismissVoice);
    return () => {
      window.removeEventListener('island:navigate', handleNav);
      window.removeEventListener('island:dismiss-voice', handleDismissVoice);
    };
  }, [hubOpen]);

  // Hotkey / tray / second launch listeners (supports both hub:toggle and hub:open)
  useEffect(() => {
    if (!window.island?.on) return undefined;

    const unregToggle = window.island.on('hub:toggle', () => {
      window.island?.logLifecycle?.('hub:toggle:received', { hubOpen });
      setHubOpen((open) => !open);
    });

    const unregOpen = window.island.on('hub:open', (preferredTab) => {
      window.island?.logLifecycle?.('hub:open:received', { preferredTab, hubOpen });
      openHub(typeof preferredTab === 'string' ? preferredTab : undefined);
    });

    return () => {
      unregToggle?.();
      unregOpen?.();
    };
  }, [openHub, hubOpen]);

  // Global voice shortcut listener (Ctrl+Shift+Space) & Tray "Talk to Island"
  useEffect(() => {
    if (!window.island?.on) return undefined;
    return window.island.on('voice:toggle', () => {
      window.island?.logLifecycle?.('voice:toggle:received', {
        hubOpen,
        tab,
        voiceStatus: voice.status,
      });
      if (!hubOpen) {
        openHub('voice');
        if (voice.status === 'idle' || voice.status === 'error') {
          voice.startSession();
        }
      } else if (tab === 'voice') {
        // Toggle minimizes expanded view to compact pill without interrupting background speech/thinking
        setHubOpen(false);
      } else {
        openHub('voice');
        if (voice.status === 'idle' || voice.status === 'error') {
          voice.startSession();
        }
      }
    });
  }, [hubOpen, tab, voice, openHub]);

  // Toasts: auto-dismiss (paused while hovered); skip them while the hub is already open.
  useEffect(() => {
    if (!toast) return undefined;
    if (hubOpen) {
      actions.dropToast();
      return undefined;
    }
    if (hovered) return undefined;
    const id = setTimeout(() => actions.clearToast(toast.id), toast.timeoutMs || 5000);
    return () => clearTimeout(id);
  }, [toast, hovered, hubOpen, actions]);

  const ringing = Boolean(ring);
  useEffect(() => {
    if (ringing) {
      const res = startChime();
      if (res && res.ok === false) {
        console.warn('[Island] Audio chime could not play:', res.error);
      }
    } else {
      stopChime();
    }
    return stopChime;
  }, [ringing]);

  const [dynamicColor, setDynamicColor] = useState(null);
  const colorArtRef = useRef(null);

  useEffect(() => {
    if (!media.active) {
      setDynamicColor(null);
      colorArtRef.current = null;
      return;
    }
    if (!media.art) {
      // Temporary gap: preserve current extracted color briefly, avoid harsh flash
      return;
    }
    if (colorArtRef.current === media.art) return;
    colorArtRef.current = media.art;
    let cancelled = false;
    extractCoverColor(media.art, (extracted) => {
      if (!cancelled && extracted) {
        setDynamicColor(extracted);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [media.active, media.art]);

  const isVideo = isVideoMedia(media);
  const { ambientColor: videoAmbientColor, stream: videoStream, streamActive: videoStreamActive, youtubeId } = useVideoAmbient(media, playing);

  const defaultThemeColor = 'rgba(226, 232, 240, 0.88)';
  const fallbackMusicColor = (media.active && !media.art)
    ? `hsl(${hueFrom(`${media.title}${media.artist}`)} 62% 68%)`
    : defaultThemeColor;
  const musicColor = !isDynamicMode
    ? defaultThemeColor
    : (isVideo && videoAmbientColor)
      ? videoAmbientColor
      : (dynamicColor || fallbackMusicColor);

  // Sync Windows system accent color to CSS root variables for external references if needed
  useEffect(() => {
    if (s.systemAccent) {
      document.documentElement.style.setProperty('--c-info', s.systemAccent);
      document.documentElement.style.setProperty('--windows-accent', s.systemAccent);
    }
  }, [s.systemAccent]);

  let accent = defaultThemeColor;
  if (ring) accent = ring.kind === 'alarm' ? 'var(--c-alarm)' : 'var(--c-timer)';
  else if (mode === 'toast') accent = kindColor(toast.kind);
  else if (mode === 'timer') accent = 'var(--c-timer)';
  else if (isDynamicMode && (mode === 'media' || mode === 'both' || (mode === 'hub' && media.active))) accent = musicColor;

  const onIslandPointerDown = (e) => {
    if (e.button !== 0) return;
    if (e.target.closest('button, input, textarea, a, [role="button"], [role="tab"], .interactive, .mini-lyrics, .precision-lyric-container, .full-lyrics__scroller, .lyrics-settings-popover, .np__scrubber, .seek-bar, .cinema-hud, .full-lyrics__body')) {
      return;
    }

    // Simple click inside an already open hub should not re-trigger mode changes
    if (notchState === NOTCH_STATES.EXPANDED || mode === 'hub') return;

    // Expand into corresponding Hub control center tab
    if (mode === 'idle') openHub('launcher');
    else if (mode === 'voice') openHub('voice');
    else if (mode === 'media') openHub('playing');
    else if (mode === 'timer' || mode === 'both') openHub('clock');
    else if (mode === 'toast') {
      openHub('inbox');
      actions.clearToast(toast.id);
    }
  };

  const idleFlags = resolveIdleDisplayFlags(idlePrefs);
  const isIdleBlack = mode === 'idle' && !media.active;
  const isPitchBlack = !media.active;

  let cachedWeather = null;
  if (idleFlags.showWeather && typeof window !== 'undefined') {
    try {
      const rawW = localStorage.getItem('island_weather_cache');
      if (rawW) cachedWeather = JSON.parse(rawW);
    } catch {}
  }

  let view;
  if (isPeeking && notchState === NOTCH_STATES.COMPACT && mode !== 'ring' && mode !== 'toast') {
    view = <div className="notch-peek-lip" aria-label="Reveal Island" />;
  } else if (mode === 'ring') {
    view = <RingView ring={ring} actions={actions} />;
  } else if (mode === 'toast') {
    view = <ToastView toast={toast} />;
  } else if (notchState === NOTCH_STATES.EXPANDED || mode === 'hub') {
    view = (
      <View w={width} h={height}>
        <Hub
          tab={tab}
          setTab={setTab}
          onClose={() => setHubOpen(false)}
          s={s}
          actions={actions}
          now={now}
          setTyping={setTyping}
          accentColor={media.active ? musicColor : null}
          onLyricsViewChange={setIsLyricsFull}
          videoStream={videoStream}
          videoStreamActive={videoStreamActive}
          youtubeId={youtubeId}
          voice={voice}
          volume={volume}
          muted={muted}
          volumeSupported={volumeSupported}
          volumeUnavailableReason={volumeUnavailableReason}
          onVolumeChange={handleVolumeChange}
          onToggleMute={handleToggleMute}
          isDynamicMode={isDynamicMode}
          companionMood={companionMood}
          companionAnimations={idleFlags.companionAnimations}
        />
      </View>
    );
  } else if (notchState === NOTCH_STATES.HOVER_PREVIEW) {
    view = (
      <HoverPreviewView
        mode={mode}
        media={media}
        playing={playing}
        nextTimer={nextTimer}
        now={now}
        voice={voice}
        musicColor={musicColor}
        isDynamicMode={isDynamicMode}
        actions={actions}
        onOpenHub={openHub}
        width={width}
        height={height}
        activeLine={activeHoverLine}
        nextLine={nextHoverLine}
        volume={volume}
        muted={muted}
        volumeSupported={volumeSupported}
        volumeUnavailableReason={volumeUnavailableReason}
        onVolumeChange={handleVolumeChange}
        onToggleMute={handleToggleMute}
        reducedMotion={prefersReducedMotion}
      />
    );
  } else if (mode === 'voice') {
    view = <CompactVoiceView voice={voice} width={width} />;
  } else if (mode === 'idle') {
    const dateStr = idleFlags.showDate
      ? new Date(now).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      : '';
    const weatherStr = idleFlags.showWeather
      ? (cachedWeather && cachedWeather.temp != null ? `${Math.round(cachedWeather.temp)}°` : '--')
      : '';

    view = (
      <View w={width} h={height} className={`idle idle--notch${idleFlags.showEyes ? ' has-centered-eyes' : ''}`}>
        <div className="idle__slot idle__slot--left">
          {idleFlags.showTime && <span className="idle__time">{formatClock(now)}</span>}
          {idleFlags.showDate && <span className="idle__date">{dateStr}</span>}
        </div>

        {idleFlags.showEyes && (
          <div className="idle__center-eyes">
            <CompanionEyes
              mood={companionMood}
              size="md"
              animationsEnabled={idleFlags.companionAnimations}
            />
          </div>
        )}

        <div className="idle__slot idle__slot--right">
          {idleFlags.showWeather && <span className="idle__weather">{weatherStr}</span>}
          {unread > 0 && <span className="idle__dot" />}
        </div>
      </View>
    );
  } else {
    view = <CompactView mode={mode} media={media} nextTimer={nextTimer} now={now} musicColor={musicColor} playing={playing} width={width} />;
  }

  const contentKey = isPeeking && notchState === NOTCH_STATES.COMPACT
    ? 'peek'
    : mode === 'toast'
      ? `toast-${toast.id}`
      : mode === 'ring'
        ? `ring-${ring.key}`
        : `${notchState}-${mode}`;

  const motionTransition = getMotionTransition(NOTCH_TRANSITION, prefersReducedMotion);
  const contentTransition = getMotionTransition(MOTION.content, prefersReducedMotion);

  return (
    <div className="stage" data-dock={dock.edge || 'top'} data-align={dock.align || 'center'} data-valign={dock.vAlign || 'top'}>
      <motion.div
        className={`island island--notch${isHidden ? ' is-hidden' : ''}${isPeeking ? ' is-peeking' : ''}${isPitchBlack ? ' is-pitch-black is-idle-black' : ''}`}
        data-hit={isHidden ? undefined : true}
        data-mode={mode}
        data-notch-state={notchState}
        data-appearance={appearanceMode}
        data-idle-black={isPitchBlack ? 'true' : undefined}
        data-pitch-black={isPitchBlack ? 'true' : undefined}
        data-dock={dock.edge || 'top'}
        data-align={dock.align || 'center'}
        data-valign={dock.vAlign || 'top'}
        style={{
          '--accent': media.active ? accent : 'transparent',
          '--music-accent': media.active ? musicColor : 'transparent',
          pointerEvents: isHidden ? 'none' : 'auto',
        }}
        initial={false}
        animate={{
          width,
          height,
          opacity: isHidden ? 0 : 1,
          borderTopLeftRadius: 0,
          borderTopRightRadius: 0,
          borderBottomLeftRadius: bottomRadius,
          borderBottomRightRadius: bottomRadius,
        }}
        transition={motionTransition}
        onPointerEnter={handleNotchPointerEnter}
        onPointerLeave={handleNotchPointerLeave}
        onPointerDown={onIslandPointerDown}
      >
        {/* Dynamic Frosted Album Art Diffusion (retained when media is active/paused, pitch black when idle) */}
        {!isIdleBlack && isDynamicMode && media.active && isVideo && videoAmbientColor ? (
          <div className="island__ambient-art" aria-hidden="true">
            <div
              className="island__video-ambient-glow"
              style={{
                background: `radial-gradient(circle at 50% 25%, color-mix(in srgb, ${videoAmbientColor} 45%, transparent) 0%, color-mix(in srgb, ${videoAmbientColor} 14%, rgba(12, 13, 18, 0.94)) 60%, rgba(12, 13, 18, 0.96) 100%)`,
              }}
            />
          </div>
        ) : !isIdleBlack && isDynamicMode && media.active && media.art ? (
          <div className="island__ambient-art" aria-hidden="true">
            <img src={media.art} alt="" className="island__ambient-art-img" />
            <div className="island__ambient-art-overlay" />
          </div>
        ) : null}

        {/* React Bits Beat-Reactive Liquid Metaballs (Option 1: Ambient Island Backdrop) */}
        {media.active && (notchState === NOTCH_STATES.EXPANDED || mode === 'hub') && tab === 'playing' && (
          <AmbientLiquidMetaballs
            mode={metaballsMode}
            accentColor={metaballsMode === 'dynamic' ? (dynamicColor || fallbackMusicColor || musicColor) : (musicColor || accent)}
            isPlaying={playing}
          />
        )}

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={contentKey}
            className="content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: prefersReducedMotion ? 0 : 0.1 } }}
            transition={contentTransition}
          >
            {view}
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
