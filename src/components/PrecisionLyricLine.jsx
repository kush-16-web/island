import { useEffect, useRef, useState } from 'react';
import { calculateLyricScrollOffset } from '../lib/lyrics-scroll';

export { calculateLyricScrollOffset };

/**
 * PrecisionLyricLine
 * Renders an active lyric line with playback-synchronized horizontal scrolling.
 * 
 * Features:
 * - Scrolls ONLY if text overflows its container width; short lyrics remain stationary.
 * - Driven directly by audio playback timestamp, zero free-running CSS animations.
 * - Never oscillates or scrolls backward during forward playback.
 * - Immediately jumps on rewind/seek without playing any reverse animation.
 * - Holds position smoothly on pause.
 * - Soft edge alpha masks prevent clipping.
 * - Zero React reconciliation re-renders on RAF updates (direct DOM transform).
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

  const lastPosMsRef = useRef(currentPositionMs);
  const currentOffsetRef = useRef(0);
  const rafIdRef = useRef(null);
  const activeLineIdRef = useRef(line?.id || '');

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
        const offset = calculateLyricScrollOffset(currentPositionMs, line, newMax);
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

  // Apply transform and edge gradient masks directly to DOM
  const applyOffset = (offset, max) => {
    if (!contentRef.current || !containerRef.current) return;

    contentRef.current.style.transform = offset > 0 ? `translateX(-${offset}px)` : 'translateX(0)';

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

  // Immediate recalculation when line changes or seek occurs
  useEffect(() => {
    if (!line) return;

    // Line changed: reset offset cleanly to new line's starting position
    if (activeLineIdRef.current !== (line.id || '')) {
      activeLineIdRef.current = line.id || '';
      const initialOffset = calculateLyricScrollOffset(currentPositionMs, line, maxScroll);
      currentOffsetRef.current = initialOffset;
      lastPosMsRef.current = currentPositionMs;
      applyOffset(initialOffset, maxScroll);
      return;
    }

    // Seek / jump detection: if current position jumped backwards or skipped forward
    const delta = currentPositionMs - lastPosMsRef.current;
    if (delta < -120 || delta > 1000) {
      const seekOffset = calculateLyricScrollOffset(currentPositionMs, line, maxScroll);
      currentOffsetRef.current = seekOffset;
      lastPosMsRef.current = currentPositionMs;
      applyOffset(seekOffset, maxScroll);
      return;
    }

    lastPosMsRef.current = currentPositionMs;
  }, [line?.id, currentPositionMs, maxScroll]);

  // Smooth RAF loop active ONLY while playing and line overflows
  useEffect(() => {
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

      const targetOffset = calculateLyricScrollOffset(lastPosMsRef.current, line, maxScroll);

      // Monotonic forward guarantee: never reverse direction during normal forward playback
      const nextOffset = Math.max(currentOffsetRef.current, targetOffset);

      if (nextOffset !== currentOffsetRef.current) {
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
