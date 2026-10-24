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
 * - Subtle Curved Perspective: In Kinetic mode, occasional horizontal lines glide over a shallow
 *   curved display surface (lift + scale at center) with pre-measured word metrics.
 * - Meaning-Aware Typography: In Kinetic mode, key emotional words receive targeted typography effects.
 */
export default function PrecisionLyricLine({
  line,
  currentPositionMs = 0,
  playing = false,
  className = '',
  style = {},
  presentation = null,
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
  const wordMetricsRef = useRef([]);

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

      // Pre-measure word metrics for shallow curved horizontal scrolling (Kinetic mode, rare eligible lines only)
      if (presentation?.style === 'kinetic' && presentation?.isCurved && !presentation?.kineticEffect && isOverflowing) {
        const wordEls = contentRef.current.querySelectorAll('.p-curved-word');
        wordMetricsRef.current = Array.from(wordEls).map((el) => ({
          el,
          mid: el.offsetLeft + el.offsetWidth / 2,
        }));
      } else {
        wordMetricsRef.current = [];
      }

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
  }, [line?.text, line?.id, presentation?.style, presentation?.isCurved, presentation?.kineticEffect]);

  // Apply transform, dynamic edge gradient masks, and subtle curved perspective
  const applyOffset = (offset, max) => {
    if (!contentRef.current || !containerRef.current) return;

    contentRef.current.style.transform = offset > 0 ? `translateX(-${offset.toFixed(2)}px)` : 'translateX(0)';

    // Dynamic edge gradient mask to prevent clipping
    if (max > 0) {
      if (offset <= 1) {
        containerRef.current.style.maskImage = 'linear-gradient(to right, black calc(100% - 16px), transparent 100%)';
        containerRef.current.style.webkitMaskImage = 'linear-gradient(to right, black calc(100% - 16px), transparent 100%)';
      } else if (offset >= max - 2) {
        containerRef.current.style.maskImage = 'linear-gradient(to right, transparent 0%, black 16px, black 100%)';
        containerRef.current.style.webkitMaskImage = 'linear-gradient(to right, transparent 0%, black 16px, black 100%)';
      } else {
        containerRef.current.style.maskImage = 'linear-gradient(to right, transparent 0%, black 16px, black calc(100% - 16px), transparent 100%)';
        containerRef.current.style.webkitMaskImage = 'linear-gradient(to right, transparent 0%, black 16px, black calc(100% - 16px), transparent 100%)';
      }
    } else {
      containerRef.current.style.maskImage = 'none';
      containerRef.current.style.webkitMaskImage = 'none';
    }

    // Subtle curved perspective applied strictly to rare horizontal scrolling in Kinetic mode without word effects
    if (presentation?.style === 'kinetic' && presentation?.isCurved && !presentation?.kineticEffect && max > 0 && wordMetricsRef.current.length > 0) {
      const cWidth = containerRef.current.clientWidth;
      const center = cWidth / 2;
      for (let i = 0; i < wordMetricsRef.current.length; i++) {
        const item = wordMetricsRef.current[i];
        const vpX = item.mid - offset;
        const d = (vpX - center) / center;
        if (Math.abs(d) <= 1.25) {
          const t = Math.max(0, 1 - Math.min(1, d * d));
          const lift = (6 * t).toFixed(2);
          const scale = (0.96 + 0.10 * t).toFixed(3);
          const opacity = (0.72 + 0.28 * t).toFixed(2);
          item.el.style.transform = `translateY(-${lift}px) scale(${scale})`;
          item.el.style.opacity = opacity;
        } else {
          item.el.style.opacity = '0.5';
          item.el.style.transform = 'translateY(0) scale(0.96)';
        }
      }
    }
  };

  // Immediate seek and line-change responsiveness
  useEffect(() => {
    const isNewLine = activeLineIdRef.current !== (line?.id || '');
    if (isNewLine) {
      activeLineIdRef.current = line?.id || '';
      currentOffsetRef.current = 0;
      clockAnchorRef.current = {
        timeMs: currentPositionMs,
        perfNow: typeof performance !== 'undefined' ? performance.now() : Date.now(),
      };
      if (line && maxScroll > 0) {
        const instantOffset = calculateLyricScrollOffset(currentPositionMs, line, maxScroll, { subpixel: true });
        currentOffsetRef.current = instantOffset;
        applyOffset(instantOffset, maxScroll);
      } else {
        applyOffset(0, 0);
      }
      return;
    }

    const perfNow = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const expectedMs = clockAnchorRef.current.timeMs + (perfNow - clockAnchorRef.current.perfNow);
    const drift = Math.abs(currentPositionMs - expectedMs);

    // Large drift (>280ms) indicates backward/forward user seek
    if (drift > 280) {
      clockAnchorRef.current = {
        timeMs: currentPositionMs,
        perfNow,
      };
      if (line && maxScroll > 0) {
        const seekOffset = calculateLyricScrollOffset(currentPositionMs, line, maxScroll, { subpixel: true });
        currentOffsetRef.current = seekOffset;
        applyOffset(seekOffset, maxScroll);
      }
    }

    if (playing && !wasPlayingRef.current) {
      clockAnchorRef.current = {
        timeMs: currentPositionMs,
        perfNow,
      };
    } else if (!playing && wasPlayingRef.current) {
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
  }, [playing, overflow, maxScroll, line?.id, line?.timeMs, line?.endMs, presentation?.style]);

  const rawText = line?.text || '';

  return (
    <div
      ref={containerRef}
      className={`precision-lyric-container ${className}`}
      style={style}
      title={rawText || undefined}
    >
      <span
        ref={contentRef}
        className="precision-lyric-content"
      >
        {presentation?.style === 'kinetic' && presentation?.kineticEffect && presentation.targetWord ? (
          (() => {
            const raw = rawText;
            const start = presentation.startIndex != null ? presentation.startIndex : raw.indexOf(presentation.targetWord);
            const end = presentation.endIndex != null ? presentation.endIndex : (start >= 0 ? start + presentation.targetWord.length : -1);
            if (start >= 0 && end > start) {
              const before = raw.slice(0, start);
              const target = raw.slice(start, end);
              const after = raw.slice(end);
              return (
                <>
                  {before}
                  <span className={`k-fx-${presentation.kineticEffect}`}>{target}</span>
                  {after}
                </>
              );
            }
            return raw;
          })()
        ) : presentation?.style === 'kinetic' && presentation?.isCurved && overflow ? (
          // Rare shallow curved horizontal perspective (only eligible overflowing lines without word effect)
          rawText.split(/(\s+)/).map((segment, sIdx) => {
            if (/^\s+$/.test(segment)) {
              return segment;
            }
            return (
              <span key={sIdx} className="p-curved-word">
                {segment}
              </span>
            );
          })
        ) : (
          rawText
        )}
      </span>
    </div>
  );
}
