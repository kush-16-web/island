import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

/**
 * MarqueeText: High-precision auto-scrolling text inspired by YouTube Music & Spotify.
 * - If text fits in container: renders stationary, with optional centering (centerWhenFits).
 * - If text overflows: smoothly marquees with pause at edges, gentle travel and return.
 * - Respects prefers-reduced-motion: stays stationary with clean ellipsis fallback.
 */
export default function MarqueeText({
  text = '',
  className = '',
  speed = 13,
  style = {},
  centerWhenFits = false,
}) {
  const containerRef = useRef(null);
  const textRef = useRef(null);
  const [overflow, setOverflow] = useState(false);
  const [offset, setOffset] = useState(0);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    const checkOverflow = () => {
      if (!containerRef.current || !textRef.current) return;
      const cWidth = containerRef.current.clientWidth;
      const tWidth = textRef.current.scrollWidth;
      const isOverflowing = tWidth > cWidth + 2;
      setOverflow(isOverflowing);
      setOffset(isOverflowing ? tWidth - cWidth : 0);
    };

    checkOverflow();
    const ro = new ResizeObserver(checkOverflow);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [text]);

  // Calm, natural pacing: generous initial hold (~3s), unhurried glide, hold at far end, smooth return
  const duration = Math.max(9.5, (offset / speed) + 7.5);
  const shouldMarquee = overflow && !prefersReducedMotion;

  return (
    <div
      ref={containerRef}
      className={`marquee-container${overflow ? ' has-overflow' : ''}${centerWhenFits && !overflow ? ' is-centered' : ''} ${className}`}
      style={{
        ...style,
        justifyContent: centerWhenFits && !overflow ? 'center' : 'flex-start',
      }}
      title={typeof text === 'string' ? text : undefined}
    >
      <span
        ref={textRef}
        className={`marquee-content${shouldMarquee ? ' is-marquee' : ''}`}
        style={
          shouldMarquee
            ? {
                '--marquee-offset': `-${offset + 8}px`,
                '--marquee-duration': `${duration}s`,
              }
            : undefined
        }
      >
        {text}
      </span>
    </div>
  );
}
