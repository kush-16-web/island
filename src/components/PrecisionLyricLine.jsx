import { useEffect, useRef, useState } from 'react';
import { calculateLyricScrollOffset } from '../lib/lyrics-scroll';

export { calculateLyricScrollOffset };

/**
 * PrecisionLyricLine
 * Renders an active lyric line with playback-synchronized horizontal scrolling.
 * 
 * Performance & Timing Architecture:
 * - High-Precision Clock Anchor: Uses performance.now() microsecond interpolation between
 *   intermittent player/SMTC updates, eliminating 20ms-50ms React render quantization.
 * - Subpixel Fluidity: Applies subpixel floating-point offsets (translateX(-XX.XXpx))
 *   so slow, stretched singing glides smoothly instead of integer-pixel stepping.
 * - Monotonic Forward Motion: Enforces that forward playback never jitters backward.
 * - Instant Seek Response: Immediate recalculation on backward/forward seeks (>300ms drift)
 *   without reverse-scroll animations.
 * - Pause & Resume Stability: Freezes position on pause; re-anchors wall-clock on resume.
 * - Reduced Motion: Bypasses translation when prefers-reduced-motion is enabled.
 */
export default function PrecisionLyricLine({
  line,
  currentPositionMs = 0,
  playing = false,
  className = '',
  style = {},
}) {
  const containerRef = useRef(null);
  const contentRef = useRef(null);

  const [overflow, setOverflow] = useState(false);
  const [maxScroll, setMaxScroll] = useState(0);

  // Authoritative interpolated clock anchor
  const clockAnchorRef = useRef({
    timeMs: currentPositionMs,
    perfNow: typeof performance !== 'undefined' ? performance.now() : Date.now(),
  });

  const currentOffsetRef = useRef(0);
  const rafIdRef = useRef(null);
  const activeLineIdRef = useRef(line?.id || '');
  const wasPlayingRef = useRef(playing);

  // Measure overflow dimensions
  useEffect(() => {
    const checkOverflow = () => {
      if (!containerRef.current || !contentRef.current) return;
      const cWidth = containerRef.current.clientWidth;
      const tWidth = contentRef.current.scrollWidth;
      const isOverflowing = tWidth > cWidth + 2;

      setOverflow(isOverflowing);
      const newMax = isOverflowing ? tWidth - cWidth + 10 : 0;
      setMaxScroll(newMax);

      // Recalculate immediate offset for new layout
      if (newMax > 0 && line) {
        const offset = calculateLyricScrollOffset(currentPositionMs, line, newMax, { subpixel: true });
        currentOffsetRef.current = offset;
        applyOffset(offset, newMax);
      } else {
        currentOffsetRef.current = 0;
        applyOffset(0, 0);
      }
    };

    checkOverflow();
    const ro = new ResizeObserver(checkOverflow);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [line?.text, line?.id]);

  // Apply transform and dynamic edge gradient masks directly to DOM
  const applyOffset = (offset, max) => {
    if (!contentRef.current || !containerRef.current) return;

    contentRef.current.style.transform = offset > 0 ? `translateX(-${offset.toFixed(2)}px)` : 'translateX(0)';

    // Dynamic edge gradient mask to prevent clipping
    if (max > 0) {
      if (offset <= 1) {
        // Start of line: soft fade on right edge only
        containerRef.current.style.maskImage = 'linear-gradient(to right, black calc(100% - 16px), transparent 100%)';
        containerRef.current.style.webkitMaskImage = 'linear-gradient(to right, black calc(100% - 16px), transparent 100%)';
      } else if (offset >= max - 2) {
        // End of line: soft fade on left edge only
        containerRef.current.style.maskImage = 'linear-gradient(to right, transparent 0%, black 16px, black 100%)';
        containerRef.current.style.webkitMaskImage = 'linear-gradient(to right, transparent 0%, black 16px, black 100%)';
      } else {
        // Middle of line: soft fade on both edges
        containerRef.current.style.maskImage = 'linear-gradient(to right, transparent 0%, black 16px, black calc(100% - 16px), transparent 100%)';
        containerRef.current.style.webkitMaskImage = 'linear-gradient(to right, transparent 0%, black 16px, black calc(100% - 16px), transparent 100%)';
      }
    } else {
      containerRef.current.style.maskImage = 'none';
      containerRef.current.style.webkitMaskImage = 'none';
    }
  };

  // Synchronize player updates and detect seeks / line transitions
  useEffect(() => {
    if (!line) return;

    const perfNow = typeof performance !== 'undefined' ? performance.now() : Date.now();

    // 1. Line changed: reset cleanly to new line's starting position
    if (activeLineIdRef.current !== (line.id || '')) {
      activeLineIdRef.current = line.id || '';
      clockAnchorRef.current = {
        timeMs: currentPositionMs,
        perfNow,
      };
      const initialOffset = calculateLyricScrollOffset(currentPositionMs, line, maxScroll, { subpixel: true });
      currentOffsetRef.current = initialOffset;
      applyOffset(initialOffset, maxScroll);
      return;
    }

    // 2. Compute drift against current local interpolated clock
    const localEstimated = clockAnchorRef.current.timeMs + (perfNow - clockAnchorRef.current.perfNow);
    const delta = currentPositionMs - localEstimated;

    // 3. User seek or large timing correction (>300ms): immediately re-anchor
    if (Math.abs(delta) > 300) {
      clockAnchorRef.current = {
        timeMs: currentPositionMs,
        perfNow,
      };
      const seekOffset = calculateLyricScrollOffset(currentPositionMs, line, maxScroll, { subpixel: true });
      currentOffsetRef.current = seekOffset;
      applyOffset(seekOffset, maxScroll);
      return;
    }

    // 4. Normal minor forward drift: gently update clock anchor forward without backward pops
    if (delta > 0) {
      clockAnchorRef.current = {
        timeMs: Math.max(localEstimated, currentPositionMs),
        perfNow,
      };
    }
  }, [line?.id, currentPositionMs, maxScroll]);

  // Handle pause & resume transitions
  useEffect(() => {
    const perfNow = typeof performance !== 'undefined' ? performance.now() : Date.now();

    if (playing && !wasPlayingRef.current) {
      // Resumed from pause: re-anchor perfNow so paused duration is not added to song time
      clockAnchorRef.current = {
        timeMs: currentPositionMs,
        perfNow,
      };
    } else if (!playing && wasPlayingRef.current) {
      // Paused: freeze offset immediately
      if (line && maxScroll > 0) {
        const frozenOffset = calculateLyricScrollOffset(currentPositionMs, line, maxScroll, { subpixel: true });
        currentOffsetRef.current = frozenOffset;
        applyOffset(frozenOffset, maxScroll);
      }
    }
    wasPlayingRef.current = playing;
  }, [playing, currentPositionMs, line, maxScroll]);

  // High-performance RAF animation loop running at display refresh rate
  useEffect(() => {
    // Respect prefers-reduced-motion
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
      if (contentRef.current) contentRef.current.style.transform = 'none';
      return;
    }

    if (!playing || !overflow || maxScroll <= 0 || !line) {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      return;
    }

    let isSubscribed = true;

    const tick = () => {
      if (!isSubscribed) return;

      const perfNow = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const currentMs = clockAnchorRef.current.timeMs + (perfNow - clockAnchorRef.current.perfNow);

      const targetOffset = calculateLyricScrollOffset(currentMs, line, maxScroll, { subpixel: true });

      // Monotonic forward guarantee: never reverse direction during normal forward playback
      const nextOffset = Math.max(currentOffsetRef.current, targetOffset);

      if (Math.abs(nextOffset - currentOffsetRef.current) >= 0.01) {
        currentOffsetRef.current = nextOffset;
        applyOffset(nextOffset, maxScroll);
      }

      rafIdRef.current = requestAnimationFrame(tick);
    };

    rafIdRef.current = requestAnimationFrame(tick);

    return () => {
      isSubscribed = false;
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [playing, overflow, maxScroll, line?.id, line?.timeMs, line?.endMs]);

  return (
    <div
      ref={containerRef}
      className={`precision-lyric-container ${className}`}
      style={style}
      title={line?.text || undefined}
    >
      <span
        ref={contentRef}
        className="precision-lyric-content"
      >
        {line?.text || ''}
      </span>
    </div>
  );
}
