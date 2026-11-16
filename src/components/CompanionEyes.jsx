import React, { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { computeGazeOffset } from '../lib/companion-gaze';

const MAX_OFFSET_BY_SIZE = {
  sm: 2.2,
  md: 3.0,
  lg: 3.8,
};

function EyeGlyph({ type, isLeft, dims }) {
  if (type === 'happy') {
    // Upward smiling curved arches ^ ^ (⌒ ⌒)
    return (
      <svg
        width={dims.eyeW}
        height={dims.eyeH}
        viewBox="0 0 10 14"
        overflow="visible"
      >
        <path
          d="M 1,9.5 Q 5,2.5 9,9.5"
          stroke="currentColor"
          strokeWidth="2.8"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    );
  }

  if (type === 'squint') {
    // Focused thinking or energetic squint > <
    const d = isLeft
      ? 'M 2,2.8 L 8,7 L 2,11.2'
      : 'M 8,2.8 L 2,7 L 8,11.2';
    return (
      <svg
        width={dims.eyeW}
        height={dims.eyeH}
        viewBox="0 0 10 14"
        overflow="visible"
      >
        <path
          d={d}
          stroke="currentColor"
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    );
  }

  if (type === 'sleep') {
    // Relaxed horizontal slit - -
    return (
      <svg
        width={dims.eyeW}
        height={dims.eyeH}
        viewBox="0 0 10 14"
        overflow="visible"
      >
        <line
          x1="1"
          y1="7"
          x2="9"
          y2="7"
          stroke="currentColor"
          strokeWidth="2.8"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  // Classic vertical capsule | | (cursor-tracking pupil)
  return (
    <svg
      width={dims.eyeW}
      height={dims.eyeH}
      viewBox="0 0 10 14"
      overflow="visible"
    >
      <rect
        x="0"
        y="0"
        width="10"
        height="14"
        rx="5"
        fill="currentColor"
      />
    </svg>
  );
}

/**
 * CompanionEyes — Expressive Morphing Little Island Personality
 *
 * - Morphing emoji expressions:
 *   - Music Vibing: Stably smiling happy arches ^ ^ (⌒ ⌒) nodding rhythmically to the song
 *   - Thinking / Voice: Focused squint > <
 *   - Paused / Idle: Classic vertical capsules | | with cursor-following pupils
 * - Expressive head-bop bounce on beats (nodding down and bouncing up)
 * - Natural randomized blinking (when in idle capsule mode)
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
  const [headBop, setHeadBop] = useState(0);
  const blinkTimerRef = useRef(null);
  const inactivityTimerRef = useRef(null);
  const lastCursorRef = useRef({ x: null, y: null, ts: 0 });

  const maxOffset = MAX_OFFSET_BY_SIZE[size] || MAX_OFFSET_BY_SIZE.md;

  // Music beat reactive head-bop nodding
  useEffect(() => {
    if (!canAnimate) return;
    let bopTimer = null;
    const handleBeat = (e) => {
      const val = Math.min(1.0, (e.detail?.transient || 0.18) * 2.2);
      setHeadBop(val);
      if (bopTimer) clearTimeout(bopTimer);
      bopTimer = setTimeout(() => {
        setHeadBop(0);
      }, 150);
    };

    window.addEventListener('island:music-beat', handleBeat);
    return () => {
      window.removeEventListener('island:music-beat', handleBeat);
      if (bopTimer) clearTimeout(bopTimer);
    };
  }, [canAnimate]);

  // Natural randomized blinking (only active during open capsule mode)
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
        if (Date.now() - lastCursorRef.current.ts < 140) return;
        try {
          const ctx = await window.island.getCursorContext();
          if (unmounted || !ctx) return;
          if (lastCursorRef.current.x === ctx.cursorX && lastCursorRef.current.y === ctx.cursorY) {
            return;
          }
          lastCursorRef.current = { x: ctx.cursorX, y: ctx.cursorY, ts: Date.now() };
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

  // Determine active expression glyph:
  // While playing music, STAY consistently in happy smiling arches ^ ^ (⌒ ⌒)! No rapid switching!
  let eyeType = 'capsule';
  if (mood === 'thinking' || mood === 'voice') {
    eyeType = 'squint'; // > <
  } else if (mood === 'timer_complete') {
    eyeType = 'sleep'; // - -
  } else if (mood === 'music' || mood === 'vibing') {
    eyeType = 'happy'; // Stably happy smiling arches ^ ^ during music playback
  }

  // Combine cursor gaze with contextual mood expression
  let offsetX = canAnimate ? gaze.x : 0;
  let offsetY = canAnimate ? gaze.y : 0;
  // Blinking only applies when eyes are open capsules (idle/paused), never flattens smiling arches!
  let eyeScaleY = (eyeType === 'capsule' && isBlinking) ? 0.08 : 1;
  let eyeScaleX = 1;
  let eyeRotate = 0;

  if (canAnimate) {
    if (mood === 'music' || mood === 'vibing') {
      if (offsetX === 0 && offsetY === 0) {
        offsetY = 1.0; // Sweet listening gaze tilted downward towards lyrics
      }
      eyeScaleY = 0.90 - headBop * 0.18; // Smooth head nod squash on beat
      eyeScaleX = 1.0 + headBop * 0.08;
      eyeRotate = Math.sin(Date.now() / 340) * (2.2 + headBop * 1.8); // Gentle rhythmic groove tilt
      offsetY += headBop * 2.4; // Vertical head-bop bounce
    } else if (mood === 'notification') {
      eyeScaleY = isBlinking ? 0.08 : 1.12;
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
      data-expression={eyeType}
      aria-hidden="true"
    >
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: dims.w,
          height: dims.h,
          position: 'relative',
        }}
      >
        {/* Left Eye */}
        <div
          style={{
            position: 'absolute',
            left: leftX,
            top: topY,
            width: dims.eyeW,
            height: dims.eyeH,
            transform: `translate(${offsetX}px, ${offsetY}px) rotate(${eyeRotate}deg) scale(${eyeScaleX}, ${eyeScaleY})`,
            transformOrigin: 'center center',
            transition: canAnimate ? 'transform 110ms cubic-bezier(0.22, 1, 0.36, 1)' : 'none',
          }}
        >
          <EyeGlyph type={eyeType} isLeft={true} dims={dims} />
        </div>

        {/* Right Eye */}
        <div
          style={{
            position: 'absolute',
            left: rightX,
            top: topY,
            width: dims.eyeW,
            height: dims.eyeH,
            transform: `translate(${offsetX}px, ${offsetY}px) rotate(${eyeRotate}deg) scale(${eyeScaleX}, ${eyeScaleY})`,
            transformOrigin: 'center center',
            transition: canAnimate ? 'transform 110ms cubic-bezier(0.22, 1, 0.36, 1)' : 'none',
          }}
        >
          <EyeGlyph type={eyeType} isLeft={false} dims={dims} />
        </div>
      </div>
    </span>
  );
}
