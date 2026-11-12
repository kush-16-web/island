import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { computeGazeOffset } from '../lib/companion-gaze';

const MAX_OFFSET_BY_SIZE = {
  sm: 2.2,
  md: 3.0,
  lg: 3.8,
};

/**
 * CompanionEyes — Expressive 2D Little Island Personality
 *
 * - Subtle cursor-following pupils (in-window pointer tracking + safe Electron cursor context)
 * - Natural randomized blinking (3.8s – 6.4s) that never interrupts gaze direction permanently
 * - Gentle return to neutral on pointer exit or inactivity
 * - Respects companionAnimations preference and prefers-reduced-motion
 */
export default function CompanionEyes({
  mood = 'idle',
  size = 'md',
  animationsEnabled = true,
  className = '',
}) {
  const prefersReducedMotion = useReducedMotion();
  const canAnimate = animationsEnabled && !prefersReducedMotion;

  const rootRef = useRef(null);
  const [isBlinking, setIsBlinking] = useState(false);
  const [gaze, setGaze] = useState({ x: 0, y: 0 });
  const blinkTimerRef = useRef(null);
  const inactivityTimerRef = useRef(null);
  const lastCursorRef = useRef({ x: null, y: null, ts: 0 });

  const maxOffset = MAX_OFFSET_BY_SIZE[size] || MAX_OFFSET_BY_SIZE.md;

  // Natural randomized blinking (independent of gaze direction)
  useEffect(() => {
    if (!canAnimate) {
      setIsBlinking(false);
      return undefined;
    }

    let unmounted = false;
    const scheduleBlink = () => {
      const delayMs = 3800 + Math.random() * 2600;
      blinkTimerRef.current = setTimeout(() => {
        if (unmounted) return;
        setIsBlinking(true);
        setTimeout(() => {
          if (!unmounted) setIsBlinking(false);
          if (!unmounted) scheduleBlink();
        }, 135);
      }, delayMs);
    };

    scheduleBlink();
    return () => {
      unmounted = true;
      if (blinkTimerRef.current) clearTimeout(blinkTimerRef.current);
    };
  }, [canAnimate]);

  // Cursor-following pupils: in-window pointermove + safe Electron desktop cursor context
  useEffect(() => {
    if (!canAnimate) {
      setGaze({ x: 0, y: 0 });
      return undefined;
    }

    let unmounted = false;

    const resetInactivityTimer = () => {
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = setTimeout(() => {
        if (!unmounted) setGaze({ x: 0, y: 0 });
      }, 2400);
    };

    const updateGazeFromClientPoint = (clientX, clientY, maxRange = 520) => {
      const el = rootRef.current;
      if (!el || unmounted) return;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const dist = Math.hypot(clientX - centerX, clientY - centerY);

      if (dist > maxRange) {
        setGaze({ x: 0, y: 0 });
        return;
      }

      setGaze(computeGazeOffset({
        targetX: clientX,
        targetY: clientY,
        centerX,
        centerY,
        maxOffset,
        maxDistance: 190,
      }));
      resetInactivityTimer();
    };

    const handlePointerMove = (e) => {
      lastCursorRef.current = { x: e.clientX, y: e.clientY, ts: Date.now() };
      updateGazeFromClientPoint(e.clientX, e.clientY, 640);
    };

    const handlePointerLeave = () => {
      resetInactivityTimer();
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('mousemove', handlePointerMove, { passive: true });
    document.addEventListener('mouseleave', handlePointerLeave);

    // Safe Electron cursor tracking via screen.getCursorScreenPoint() (no global mouse hooks)
    let pollTimer = null;
    if (typeof window !== 'undefined' && typeof window.island?.getCursorContext === 'function') {
      pollTimer = setInterval(async () => {
        if (unmounted || document.visibilityState === 'hidden') return;
        // If in-window pointermove fired very recently (< 140ms), skip redundant IPC
        if (Date.now() - lastCursorRef.current.ts < 140) return;
        try {
          const ctx = await window.island.getCursorContext();
          if (unmounted || !ctx) return;
          if (lastCursorRef.current.x === ctx.cursorX && lastCursorRef.current.y === ctx.cursorY) {
            return;
          }
          lastCursorRef.current = { x: ctx.cursorX, y: ctx.cursorY, ts: Date.now() };
          // Electron screen.getCursorScreenPoint() and win.getBounds() are in DIPs matching CSS pixels
          const localX = ctx.cursorX - ctx.winX;
          const localY = ctx.cursorY - ctx.winY;
          updateGazeFromClientPoint(localX, localY, 560);
        } catch {}
      }, 90);
    }

    return () => {
      unmounted = true;
      if (pollTimer) clearInterval(pollTimer);
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('mousemove', handlePointerMove);
      document.removeEventListener('mouseleave', handlePointerLeave);
    };
  }, [canAnimate, maxOffset]);

  // Combine cursor gaze with subtle contextual mood expression
  let offsetX = canAnimate ? gaze.x : 0;
  let offsetY = canAnimate ? gaze.y : 0;
  let eyeScaleY = isBlinking ? 0.08 : 1;

  if (canAnimate) {
    if (mood === 'music_arriving' && offsetX === 0 && offsetY === 0) {
      offsetX = -1.6;
    } else if (mood === 'notification') {
      eyeScaleY = isBlinking ? 0.08 : 1.12;
    } else if (mood === 'voice' || mood === 'thinking') {
      eyeScaleY = isBlinking ? 0.08 : 0.88;
    } else if (mood === 'timer_complete') {
      eyeScaleY = 0.42;
    }
  }

  const dims = size === 'sm'
    ? { w: 28, h: 12, eyeW: 6, eyeH: 9, gap: 6, rx: 3 }
    : size === 'lg'
      ? { w: 46, h: 20, eyeW: 11, eyeH: 15, gap: 9, rx: 5.5 }
      : { w: 36, h: 15, eyeW: 8.5, eyeH: 12, gap: 7, rx: 4.2 };

  const leftX = (dims.w - (dims.eyeW * 2 + dims.gap)) / 2;
  const rightX = leftX + dims.eyeW + dims.gap;
  const topY = (dims.h - dims.eyeH) / 2;

  return (
    <span
      ref={rootRef}
      className={`companion-eyes companion-eyes--${size} ${className}`.trim()}
      data-mood={mood}
      aria-hidden="true"
    >
      <svg
        width={dims.w}
        height={dims.h}
        viewBox={`0 0 ${dims.w} ${dims.h}`}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Left Eye */}
        <g
          style={{
            transform: `translate(${offsetX}px, ${offsetY}px) scaleY(${eyeScaleY})`,
            transformOrigin: `${leftX + dims.eyeW / 2}px ${dims.h / 2}px`,
            transition: canAnimate ? 'transform 115ms cubic-bezier(0.22, 1, 0.36, 1)' : 'none',
          }}
        >
          <rect
            x={leftX}
            y={topY}
            width={dims.eyeW}
            height={dims.eyeH}
            rx={dims.rx}
            fill="currentColor"
          />
        </g>

        {/* Right Eye */}
        <g
          style={{
            transform: `translate(${offsetX}px, ${offsetY}px) scaleY(${eyeScaleY})`,
            transformOrigin: `${rightX + dims.eyeW / 2}px ${dims.h / 2}px`,
            transition: canAnimate ? 'transform 115ms cubic-bezier(0.22, 1, 0.36, 1)' : 'none',
          }}
        >
          <rect
            x={rightX}
            y={topY}
            width={dims.eyeW}
            height={dims.eyeH}
            rx={dims.rx}
            fill="currentColor"
          />
        </g>
      </svg>
    </span>
  );
}
