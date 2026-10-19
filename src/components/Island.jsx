import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useIsland } from '../hooks/useIsland';
import { useNow } from '../hooks/useNow';
import { startChime, stopChime } from '../lib/chime';
import { formatAlarmTime, formatClock, formatRemaining, hueFrom } from '../lib/format';
import { SPRING } from '../lib/motion';
import { Art, Avatar, Equalizer, Ring, kindColor } from './bits';
import Hub from './Hub';
import { Icon } from './icons';
import PetSystem from '../pets/PetSystem';

const HUB_W = 468;
const HUB_H = { playing: 262, clock: 384, inbox: 340, pet: 410, settings: 340 };
const SIZE = {
  idle: { w: 136, h: 36 },
  timer: { w: 184, h: 40 },
  media: { w: 252, h: 40 },
  both: { w: 300, h: 40 },
  toast: { w: 392, h: 68 },
  ring: { w: 412, h: 96 },
};
const RADIUS = { idle: 18, timer: 20, media: 20, both: 20, toast: 34, ring: 40, hub: 34 };

function View({ w, h, className = '', children }) {
  return (
    <div className={`view ${className}`} style={{ width: w, height: h }}>
      {children}
    </div>
  );
}

function CompactView({ mode, media, nextTimer, now, musicColor }) {
  const showMedia = mode === 'media' || mode === 'both';
  const showTimer = mode === 'timer' || mode === 'both';
  const remaining = nextTimer ? nextTimer.fireAt - now : 0;
  const fraction = nextTimer ? remaining / nextTimer.durationMs : 0;
  const middle = showMedia ? media.title : nextTimer && nextTimer.label;
  return (
    <View w={SIZE[mode].w} h={SIZE[mode].h} className="compact">
      {showMedia ? (
        <Art src={media.art} seed={`${media.title}${media.artist}`} size={26} radius={8} />
      ) : (
        <Ring fraction={fraction} size={22} color="var(--c-timer)" />
      )}
      <span className="compact__title">{middle}</span>
      {showTimer ? (
        <span className="compact__time">{formatRemaining(remaining)}</span>
      ) : (
        <Equalizer color={musicColor} />
      )}
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

export default function Island() {
  const { state: s, actions } = useIsland();
  const now = useNow(1000);
  const [hubOpen, setHubOpen] = useState(false);
  const [tab, setTab] = useState('playing');
  const [hovered, setHovered] = useState(false);
  const [typing, setTyping] = useState(false);
  const [sleepy, setSleepy] = useState(false);
  const [petted, setPetted] = useState(false);
  const pettedTimer = useRef(0);

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
  else if (toast) mode = 'toast';
  else if (nextTimer && playing) mode = 'both';
  else if (nextTimer) mode = 'timer';
  else if (playing) mode = 'media';

  const width = mode === 'hub' ? HUB_W : SIZE[mode].w;
  const height = mode === 'hub' ? HUB_H[tab] : SIZE[mode].h;

  const dragRef = useRef({
    active: false,
    startX: 0,
    lastX: 0,
    hasMoved: false,
    pointerId: null,
  });

  const openHub = useCallback((nextTab) => {
    if (nextTab) setTab(nextTab);
    setHubOpen(true);
  }, []);

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

  // The pet dozes off after 25 quiet seconds.
  useEffect(() => {
    setSleepy(false);
    const id = setTimeout(() => setSleepy(true), 25000);
    return () => clearTimeout(id);
  }, [mode, hovered, media.status, media.title, unread]);

  const onPet = useCallback(() => {
    setPetted(true);
    clearTimeout(pettedTimer.current);
    pettedTimer.current = setTimeout(() => setPetted(false), 1800);
  }, []);

  const musicColor = `hsl(${media.active ? hueFrom(`${media.title}${media.artist}`) : 265} 80% 70%)`;
  let accent = 'var(--c-info)';
  if (ring) accent = ring.kind === 'alarm' ? 'var(--c-alarm)' : 'var(--c-timer)';
  else if (mode === 'toast') accent = kindColor(toast.kind);
  else if (mode === 'timer') accent = 'var(--c-timer)';
  else if (mode === 'media' || mode === 'both' || (mode === 'hub' && media.active)) accent = musicColor;

  let mood = 'idle';
  if (ring) mood = 'panic';
  else if (toast) mood = 'alert';
  else if (petted) mood = 'happy';
  else if (playing) mood = 'music';
  else if (sleepy && mode === 'idle') mood = 'sleep';

  const onIslandPointerDown = (e) => {
    if (e.button !== 0) return;
    if (mode === 'hub') return;
    if (e.target.closest('button') || e.target.closest('input')) return;

    dragRef.current = {
      active: true,
      startX: e.screenX,
      lastX: e.screenX,
      hasMoved: false,
      pointerId: e.pointerId,
    };

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
  };

  const onIslandPointerMove = (e) => {
    if (!dragRef.current.active) return;
    const dx = e.screenX - dragRef.current.lastX;
    const totalDist = Math.abs(e.screenX - dragRef.current.startX);

    if (totalDist > 4) {
      dragRef.current.hasMoved = true;
      if (dx !== 0 && window.island?.moveWindowBy) {
        window.island.moveWindowBy(dx, 0);
      }
      dragRef.current.lastX = e.screenX;
    }
  };

  const onIslandPointerUp = (e) => {
    if (!dragRef.current.active) return;
    const { hasMoved, pointerId } = dragRef.current;
    dragRef.current.active = false;

    try {
      if (pointerId !== null) e.currentTarget.releasePointerCapture(pointerId);
    } catch {}

    if (hasMoved) {
      e.stopPropagation();
      return;
    }

    // Normal click: expand into hub!
    if (mode === 'idle') openHub('playing');
    else if (mode === 'media') openHub('playing');
    else if (mode === 'timer' || mode === 'both') openHub('clock');
    else if (mode === 'toast') {
      openHub('inbox');
      actions.clearToast(toast.id);
    }
  };

  let view;
  if (mode === 'ring') view = <RingView ring={ring} actions={actions} />;
  else if (mode === 'toast') view = <ToastView toast={toast} />;
  else if (mode === 'hub') {
    view = (
      <View w={HUB_W} h={height}>
        <Hub tab={tab} setTab={setTab} onClose={() => setHubOpen(false)} s={s} actions={actions} now={now} setTyping={setTyping} />
      </View>
    );
  } else if (mode === 'idle') {
    view = (
      <View w={SIZE.idle.w} h={SIZE.idle.h} className="idle">
        <span className="idle__time">{formatClock(now)}</span>
        {unread > 0 && <span className="idle__dot" />}
      </View>
    );
  } else {
    view = <CompactView mode={mode} media={media} nextTimer={nextTimer} now={now} musicColor={musicColor} />;
  }

  const contentKey = mode === 'toast' ? `toast-${toast.id}` : mode === 'ring' ? `ring-${ring.key}` : mode;

  return (
    <div className="stage">
      <motion.div
        className={`island ${mode !== 'hub' ? 'is-draggable' : ''}`}
        data-hit
        data-mode={mode}
        style={{ '--accent': accent }}
        initial={false}
        animate={{ width, height, borderRadius: RADIUS[mode] }}
        transition={SPRING}
        whileHover={mode === 'idle' ? { scale: 1.04 } : undefined}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        onPointerDown={onIslandPointerDown}
        onPointerMove={onIslandPointerMove}
        onPointerUp={onIslandPointerUp}
      >
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
      <PetSystem
        mood={mood}
        islandWidth={width}
        musicAccent={musicColor}
        onPet={onPet}
      />
    </div>
  );
}
