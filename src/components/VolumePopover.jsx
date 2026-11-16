import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import MusicVolumeControl from './MusicVolumeControl';

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * Calculates viewport-safe coordinates for the floating Volume popover.
 * Anchored to the left volume pill, opening smoothly upward.
 */
function calculateVolumePopoverCoordinates(anchorEl, popoverEl) {
  if (!anchorEl || typeof window === 'undefined') return null;

  const rect = anchorEl.getBoundingClientRect();
  const winW = window.innerWidth || 720;
  const winH = window.innerHeight || 500;

  const pWidth = popoverEl ? popoverEl.offsetWidth : 220;
  const pHeight = popoverEl ? popoverEl.offsetHeight : 78;

  const margin = 10;
  const offset = 8;

  // Prefer opening upward above the anchor
  let top = rect.top - pHeight - offset;
  let placement = 'top';

  if (top < margin) {
    top = rect.bottom + offset;
    placement = 'bottom';
  }

  const clampedTop = Math.max(margin, Math.min(winH - pHeight - margin, top));
  // Align left edge with anchor button left edge
  let left = rect.left;
  const clampedLeft = Math.max(margin, Math.min(winW - pWidth - margin, left));

  return {
    top: Math.round(clampedTop),
    left: Math.round(clampedLeft),
    placement,
  };
}

/**
 * VolumePopover — Apple-style floating morphing volume control.
 * Matches the spring physics, dynamic album tint, and liquid glass of LyricsSettingsPopover.
 */
export default function VolumePopover({
  anchorRef,
  isOpen = false,
  onClose,
  volume = 75,
  muted = false,
  supported = true,
  unavailableReason = '',
  onVolumeChange,
  onToggleMute,
  accentColor,
}) {
  const popoverRef = useRef(null);
  const [coords, setCoords] = useState(() => calculateVolumePopoverCoordinates(anchorRef?.current, null));

  useIsomorphicLayoutEffect(() => {
    if (!isOpen) return;

    const updatePosition = () => {
      const anchorEl = anchorRef?.current;
      const popoverEl = popoverRef?.current;
      if (!anchorEl) return;
      const next = calculateVolumePopoverCoordinates(anchorEl, popoverEl);
      if (next) setCoords(next);
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen, anchorRef]);

  // Click-outside and Escape key dismissal
  useEffect(() => {
    if (!isOpen) return;

    const handleOutsideClick = (e) => {
      const popEl = popoverRef.current;
      const anchorEl = anchorRef?.current;
      if (popEl && !popEl.contains(e.target) && (!anchorEl || !anchorEl.contains(e.target))) {
        onClose?.();
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose?.();
      }
    };

    window.addEventListener('pointerdown', handleOutsideClick);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handleOutsideClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, anchorRef]);

  if (!isOpen) return null;

  const currentPlacement = coords?.placement || 'top';

  const content = (
    <motion.div
      ref={popoverRef}
      data-hit
      className={`volume-popover volume-popover--portal volume-popover--${currentPlacement}`}
      role="dialog"
      aria-label="Volume Control"
      initial={{ opacity: 0, scale: 0.18, y: currentPlacement === 'top' ? 12 : -12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.18, y: currentPlacement === 'top' ? 10 : -10 }}
      transition={{ type: 'spring', stiffness: 380, damping: 28, mass: 0.8 }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        top: `${coords?.top ?? 20}px`,
        left: `${coords?.left ?? 20}px`,
        bottom: 'auto',
        right: 'auto',
        zIndex: 99999,
        transformOrigin: currentPlacement === 'top' ? 'bottom left' : 'top left',
        '--vol-popover-accent': accentColor || 'var(--music-accent, #ffffff)',
      }}
    >
      <div className="volume-popover__inner">
        <div className="volume-popover__header">
          <span className="volume-popover__title">Volume</span>
          {muted && <span className="volume-popover__badge volume-popover__badge--muted">Muted</span>}
        </div>
        <div className="volume-popover__slider-wrap">
          <MusicVolumeControl
            compact
            volume={volume}
            muted={muted}
            supported={supported}
            unavailableReason={unavailableReason}
            onVolumeChange={onVolumeChange}
            onToggleMute={onToggleMute}
          />
        </div>
      </div>
    </motion.div>
  );

  if (typeof document !== 'undefined' && document.body) {
    return createPortal(content, document.body);
  }
  return content;
}
