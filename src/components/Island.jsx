import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useIsland } from '../hooks/useIsland';
import { useNow } from '../hooks/useNow';
import { startChime, stopChime } from '../lib/chime';
import { extractCoverColor } from '../lib/colorExtract';
import { formatAlarmTime, formatClock, formatRemaining, hueFrom } from '../lib/format';
import { SPRING } from '../lib/motion';
import { Art, Avatar, Equalizer, Ring, kindColor } from './bits';
import Hub from './Hub';
import { Icon } from './icons';
import PetSystem from '../pets/PetSystem';
import { isMock } from '../lib/bridge';
import { useVideoAmbient, isVideoMedia } from '../hooks/useVideoAmbient';
import { useRealtimeVoice } from '../hooks/useRealtimeVoice';

const HUB_W = 468;
const HUB_H = { playing: 282, clock: 384, inbox: 340, pet: 410, settings: 340, voice: 340, launcher: 388 };
const SIZE = {
  idle: { w: 142, h: 36 },
  voice: { w: 220, h: 40 },
  timer: { w: 184, h: 40 },
  media: { w: 252, h: 40 },
  both: { w: 300, h: 40 },
  toast: { w: 392, h: 68 },
  ring: { w: 412, h: 96 },
};
const RADIUS = { idle: 18, voice: 20, timer: 20, media: 20, both: 20, toast: 34, ring: 40, hub: 34 };

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
  const petName = localStorage.getItem('island_pet_name') || 'Mochi';
  let dotClass = 'is-listening';
  if (voice.status === 'thinking') dotClass = 'is-thinking';
  else if (voice.status === 'speaking') dotClass = 'is-speaking';
  else if (voice.status === 'error') dotClass = 'is-error';
  else if (voice.status === 'connecting') dotClass = 'is-connecting';

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
      <span className="compact__title">{petName}: {voice.status}</span>
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
        {isAlarm ? <Icon.Bell width={24} height={24} /> : <Icon.Timer width={24} height={24} />}
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
  const voice = useRealtimeVoice({ media: s.media, onControl: actions.mediaControl });
  const now = useNow(1000);
  const [hubOpen, setHubOpen] = useState(false);
  const [tab, setTab] = useState(s.media?.active ? 'playing' : 'launcher');
  const [hovered, setHovered] = useState(false);
  const [typing, setTyping] = useState(false);
  const [isLyricsFull, setIsLyricsFull] = useState(false);
  const [dock, setDock] = useState({ edge: 'top', preset: 'center' });

  // Sync dock position and edge state from Electron
  useEffect(() => {
    if (window.island?.getWindowDock) {
      window.island.getWindowDock().then((d) => {
        if (d && d.edge) setDock(d);
      });
    }
    if (window.island?.on) {
      return window.island.on('window:dock-changed', (d) => {
        if (d && d.edge) setDock(d);
      });
    }
  }, []);

  const { schedule, inbox, media, toast, rings } = s;
  const ring = rings[0] || null;
  const nextTimer = useMemo(
    () => schedule.filter((i) => i.kind === 'timer').sort((a, b) => a.fireAt - b.fireAt)[0] || null,
    [schedule],
  );
  const playing = media.active && media.status === 'playing';
  const unread = inbox.filter((n) => !n.read).length;

  let mode = 'idle';
  if (ring) mode = 'ring';
  else if (hubOpen) mode = 'hub';
  else if (voice.status !== 'idle') mode = 'voice';
  else if (toast) mode = 'toast';
  else if (nextTimer && playing) mode = 'both';
  else if (nextTimer) mode = 'timer';
  else if (playing) mode = 'media';

  const getDynamicHubHeight = () => {
    switch (tab) {
      case 'launcher':
        return 388;
      case 'voice':
        return 340;
      case 'playing':
        if (!media.active) return 190;
        if (isLyricsFull === 'cinema') return 315;
        if (isLyricsFull === 'lyrics' || isLyricsFull === true) return 340;
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
      case 'voice':
        return 350;
      default:
        return 280;
    }
  };

  const getDynamicWidth = () => {
    if (mode === 'hub') return HUB_W;
    if (mode === 'voice') return SIZE.voice.w;
    if (mode === 'media') {
      const textWidth = Math.ceil(measureTextWidth(media?.title || ''));
      // Art(26) + padding(22) + gap(9) + textWidth + clean gap(10) + eq(18) = textWidth + 85
      return Math.min(280, Math.max(148, textWidth + 85));
    }
    if (mode === 'both') {
      const textWidth = Math.ceil(measureTextWidth(media?.title || ''));
      return Math.min(320, Math.max(220, textWidth + 122));
    }
    if (mode === 'timer') {
      const label = nextTimer?.label || '';
      const textWidth = Math.ceil(measureTextWidth(label));
      return Math.min(260, Math.max(168, textWidth + 116));
    }
    return SIZE[mode]?.w || 252;
  };

  const width = getDynamicWidth();
  const height = mode === 'hub' ? getDynamicHubHeight() : SIZE[mode].h;

  const dragRef = useRef({
    active: false,
    startX: 0,
    lastX: 0,
    hasMoved: false,
    pointerId: null,
  });

  const openHub = useCallback((nextTab) => {
    if (nextTab) setTab(nextTab);
    else if (!s.media?.active && tab === 'playing') setTab('launcher');
    setHubOpen(true);
  }, [s.media?.active, tab]);

  // Sync expanded state with Electron window focus
  useEffect(() => {
    window.island?.setIslandExpanded?.(hubOpen);
  }, [hubOpen]);

  // Click-outside dismissal: when the OS window blurs (user clicked Chrome, desktop, taskbar)
  useEffect(() => {
    if (!window.island?.on) return undefined;
    return window.island.on('window:blur', () => {
      setHubOpen(false);
    });
  }, []);

  // Click-outside inside the overlay window and Escape key dismissal
  useEffect(() => {
    if (!hubOpen) return undefined;
    const onWindowPointerDown = (e) => {
      if (!e.target.closest('.island') && !e.target.closest('.pet-container')) {
        setHubOpen(false);
      }
    };
    const onWindowKeyDown = (e) => {
      if (e.key === 'Escape') {
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

  // Hotkey / tray / second launch.
  useEffect(
    () =>
      window.island
        ? window.island.on('hub:toggle', () => setHubOpen((open) => !open))
        : undefined,
    [],
  );

  // Global voice shortcut listener (Ctrl+Shift+Space)
  useEffect(() => {
    if (!window.island?.on) return undefined;
    return window.island.on('voice:toggle', () => {
      if (voice.status === 'idle' || voice.status === 'error') {
        openHub('voice');
      } else {
        setHubOpen(false);
      }
    });
  }, [voice.status, openHub]);

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
    if (ringing) startChime();
    else stopChime();
    return stopChime;
  }, [ringing]);

  const [dynamicColor, setDynamicColor] = useState(null);

  useEffect(() => {
    if (media.active && media.art) {
      extractCoverColor(media.art, (extracted) => {
        setDynamicColor(extracted);
      });
    } else {
      setDynamicColor(null);
    }
  }, [media.active, media.art]);

  const isVideo = isVideoMedia(media);
  const { ambientColor: videoAmbientColor, stream: videoStream, streamActive: videoStreamActive, youtubeId } = useVideoAmbient(media, playing);

  const defaultThemeColor = s.systemAccent || 'var(--c-info)';
  const fallbackMusicColor = `hsl(${media.active ? hueFrom(`${media.title}${media.artist}`) : 265} 80% 70%)`;
  const musicColor = (isVideo && videoAmbientColor) ? videoAmbientColor : (dynamicColor || (media.active ? fallbackMusicColor : defaultThemeColor));

  // Sync Windows system accent color to CSS root variables
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
  else if (mode === 'media' || mode === 'both' || (mode === 'hub' && media.active)) accent = musicColor;

  const onIslandPointerDown = (e) => {
    if (e.button !== 0) return;
    if (mode === 'hub') return;
    if (e.target.closest('button') || e.target.closest('input')) return;

    dragRef.current = {
      active: true,
      startX: e.screenX,
      startY: e.screenY,
      hasMoved: false,
    };

    if (window.island?.startWindowDrag) {
      window.island.startWindowDrag();
    }

    const onPointerMove = (ev) => {
      if (!dragRef.current.active) return;
      const dist = Math.hypot(ev.screenX - dragRef.current.startX, ev.screenY - dragRef.current.startY);

      if (dist > 4) {
        dragRef.current.hasMoved = true;
        if (window.island?.moveWindowDrag) {
          window.island.moveWindowDrag();
        } else if (window.island?.moveWindowBy) {
          const dx = ev.screenX - dragRef.current.startX;
          const dy = ev.screenY - dragRef.current.startY;
          window.island.moveWindowBy(dx, dy);
        }
      }
    };

    const onPointerUp = (ev) => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);

      if (!dragRef.current.active) return;
      const { hasMoved } = dragRef.current;
      dragRef.current.active = false;

      if (hasMoved) {
        ev?.stopPropagation?.();
        if (window.island?.endWindowDrag) {
          window.island.endWindowDrag();
        }
        return;
      }

      // Normal click: expand into hub!
      if (mode === 'idle') openHub('launcher');
      else if (mode === 'voice') openHub('voice');
      else if (mode === 'media') openHub('playing');
      else if (mode === 'timer' || mode === 'both') openHub('clock');
      else if (mode === 'toast') {
        openHub('inbox');
        actions.clearToast(toast.id);
      }
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  };

  let view;
  if (mode === 'ring') view = <RingView ring={ring} actions={actions} />;
  else if (mode === 'toast') view = <ToastView toast={toast} />;
  else if (mode === 'hub') {
    view = (
      <View w={HUB_W} h={height}>
        <Hub
          tab={tab}
          setTab={setTab}
          onClose={() => setHubOpen(false)}
          s={s}
          actions={actions}
          now={now}
          setTyping={setTyping}
          accentColor={musicColor}
          onLyricsViewChange={setIsLyricsFull}
          videoStream={videoStream}
          videoStreamActive={videoStreamActive}
          youtubeId={youtubeId}
          voice={voice}
        />
      </View>
    );
  } else if (mode === 'voice') {
    view = <CompactVoiceView voice={voice} width={width} />;
  } else if (mode === 'idle') {
    view = (
      <View w={SIZE.idle.w} h={SIZE.idle.h} className="idle">
        <span className="idle__time">{formatClock(now)}</span>
        <button
          type="button"
          className="idle__mic-btn"
          onClick={(e) => {
            e.stopPropagation();
            voice.startSession();
            openHub('voice');
          }}
          title="Talk to Island (Ctrl+Shift+Space)"
          aria-label="Talk to Island"
        >
          <Icon.Mic width={12} height={12} />
        </button>
        {unread > 0 && <span className="idle__dot" />}
      </View>
    );
  } else {
    view = <CompactView mode={mode} media={media} nextTimer={nextTimer} now={now} musicColor={musicColor} playing={playing} width={width} />;
  }

  const contentKey = mode === 'toast' ? `toast-${toast.id}` : mode === 'ring' ? `ring-${ring.key}` : mode;

  return (
    <div className="stage" data-dock={dock.edge || 'top'} data-align={dock.align || 'center'} data-valign={dock.vAlign || 'center'}>
      <motion.div
        className={`island ${mode !== 'hub' ? 'is-draggable' : ''}`}
        data-hit
        data-mode={mode}
        data-dock={dock.edge || 'top'}
        data-align={dock.align || 'center'}
        data-valign={dock.vAlign || 'center'}
        style={{ '--accent': accent, '--music-accent': musicColor }}
        initial={false}
        animate={{ width, height, borderRadius: RADIUS[mode] }}
        transition={SPRING}
        whileHover={mode === 'idle' ? { scale: 1.04 } : undefined}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        onPointerDown={onIslandPointerDown}
      >
        {/* YouTube Ambient Mode Frame Glow & Full-Island Album Art Background */}
        {media.active && isVideo && videoAmbientColor ? (
          <div className="island__ambient-art" aria-hidden="true">
            <div
              className="island__video-ambient-glow"
              style={{
                background: `radial-gradient(circle at 50% 25%, color-mix(in srgb, ${videoAmbientColor} 55%, transparent) 0%, color-mix(in srgb, ${videoAmbientColor} 18%, rgba(10, 11, 16, 0.95)) 60%, rgba(10, 11, 16, 0.98) 100%)`,
              }}
            />
          </div>
        ) : media.active && media.art ? (
          <div className="island__ambient-art" aria-hidden="true">
            <img src={media.art} alt="" className="island__ambient-art-img" />
            <div className="island__ambient-art-overlay" />
          </div>
        ) : null}

        <AnimatePresence initial={false}>
          <motion.div
            key={contentKey}
            className="content"
            initial={{ opacity: 0, scale: 0.94, filter: 'blur(8px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: 0.94, filter: 'blur(8px)', transition: { duration: 0.16 } }}
            transition={{ duration: 0.28, delay: 0.04 }}
          >
            {view}
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
