import { useEffect, useRef, useState } from 'react';

/**
 * MarqueeText: High-precision auto-scrolling text inspired by YouTube Music & Spotify.
 * If text fits in container, renders normally with ellipsis safety.
 * If text overflows, smoothly marquees with pause at edges and soft alpha fade mask.
 */
export default function MarqueeText({ text = '', className = '', speed = 15, style = {} }) {
  const containerRef = useRef(null);
  const textRef = useRef(null);
  const [overflow, setOverflow] = useState(false);
  const [offset, setOffset] = useState(0);

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

  // Leisurely duration with generous pauses at both ends
  const duration = Math.max(8.5, (offset / speed) + 5.5);

  return (
    <div
      ref={containerRef}
      className={`marquee-container ${className}`}
      style={style}
      title={typeof text === 'string' ? text : undefined}
    >
      <span
        ref={textRef}
        className={`marquee-content${overflow ? ' is-marquee' : ''}`}
        style={
          overflow
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
