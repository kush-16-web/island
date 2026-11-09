import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * Calculates viewport-safe coordinates for the portaled lyrics settings popup.
 * - Guarantees the popup remains entirely within the actual Electron window.
 * - Intelligently prefers opening downward when space above is restricted (< popoverHeight + offset).
 * - Flips upward only when sufficient space exists.
 * - Clamps coordinates within 8-12px safe margins (margin = 10px).
 * - Computes maxHeight for internal scrolling on constrained window heights.
 */
function calculatePopoverCoordinates(anchorEl, popoverEl, preferred = 'bottom') {
  if (!anchorEl || typeof window === 'undefined') return null;

  const rect = anchorEl.getBoundingClientRect();
  const winW = window.innerWidth || 720;
  const winH = window.innerHeight || 500;

  const pWidth = popoverEl ? popoverEl.offsetWidth : 268;
  const pHeight = popoverEl ? popoverEl.offsetHeight : 124;

  const margin = 10;
  const offset = 6;

  const spaceAbove = rect.top - margin;
  const spaceBelow = winH - rect.bottom - margin;

  let placement;
  let top;

  // If the anchor is near the top edge or space above is insufficient, flip downwards
  if (spaceAbove < pHeight + offset) {
    placement = 'bottom';
    top = rect.bottom + offset;
  } else if (spaceBelow < pHeight + offset) {
    placement = 'top';
    top = rect.top - pHeight - offset;
  } else if (preferred === 'top') {
    placement = 'top';
    top = rect.top - pHeight - offset;
  } else {
    placement = 'bottom';
    top = rect.bottom + offset;
  }

  // Strict vertical clamping within safe viewport boundaries
  const clampedTop = Math.max(margin, Math.min(winH - pHeight - margin, top));

  // Align right edge of popup with right edge of anchor, clamped within margins
  let left = rect.right - pWidth;
  const clampedLeft = Math.max(margin, Math.min(winW - pWidth - margin, left));

  // Dynamic max-height constraint for internal scrolling
  const maxHeight = Math.max(120, winH - clampedTop - margin);

  return {
    top: Math.round(clampedTop),
    left: Math.round(clampedLeft),
    placement,
    maxHeight: Math.round(maxHeight),
  };
}

/**
 * LyricsSettingsPopover: Music-first, deliberate floating appearance & layout selector.
 * Portaled to document.body with viewport-aware automatic flipping and edge collision avoidance.
 * Features a solid opaque dark slate background (#15171e) with subtle album-derived accent tinting.
 */
export default function LyricsSettingsPopover({
  anchorRef,
  isOpen = true,
  onClose,
  layout = 'floating',
  onLayoutChange,
  style = 'classic',
  onStyleChange,
  accentColor,
  preferredPlacement = 'bottom',
  placement: legacyPlacement,
}) {
  const popoverRef = useRef(null);
  const effectivePreferred = legacyPlacement || preferredPlacement;

  // Synchronously initialize coordinates if anchor is already available
  const [coords, setCoords] = useState(() => {
    return calculatePopoverCoordinates(anchorRef?.current, null, effectivePreferred);
  });

  // Recalculate position before paint and upon dimension or viewport changes
  useIsomorphicLayoutEffect(() => {
    if (!isOpen) return;

    const updatePosition = () => {
      const anchorEl = anchorRef?.current;
      const popoverEl = popoverRef?.current;
      if (!anchorEl) return;
      const next = calculatePopoverCoordinates(anchorEl, popoverEl, effectivePreferred);
      if (next) setCoords(next);
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    let roAnchor;
    let roPopover;
    if (typeof ResizeObserver !== 'undefined') {
      if (anchorRef?.current) {
        roAnchor = new ResizeObserver(updatePosition);
        roAnchor.observe(anchorRef.current);
      }
      if (popoverRef.current) {
        roPopover = new ResizeObserver(updatePosition);
        roPopover.observe(popoverRef.current);
      }
    }

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      roAnchor?.disconnect();
      roPopover?.disconnect();
    };
  }, [isOpen, anchorRef, effectivePreferred]);

  // Click-outside and Escape key dismissal
  useEffect(() => {
    if (!isOpen) return;

    const handleOutsideClick = (e) => {
      const popEl = popoverRef.current;
      const anchorEl = anchorRef?.current;
      // Do not dismiss when clicking inside the popover or on the anchor trigger
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

  const currentPlacement = coords?.placement || (effectivePreferred === 'top' ? 'bottom' : effectivePreferred);

  const content = (
    <motion.div
      ref={popoverRef}
      data-hit
      className={`lyrics-settings-popover np__lyrics-popover lyrics-settings-popover--${currentPlacement} lyrics-settings-popover--portal`}
      role="dialog"
      aria-label="Lyrics settings"
      initial={{ y: currentPlacement === 'top' ? 4 : -4 }}
      animate={{ y: 0 }}
      exit={{ y: currentPlacement === 'top' ? 4 : -4 }}
      transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        top: `${coords?.top ?? 20}px`,
        left: `${coords?.left ?? 20}px`,
        bottom: 'auto',
        right: 'auto',
        margin: 0,
        maxHeight: `${coords?.maxHeight ?? 460}px`,
        '--popover-accent': accentColor || 'var(--music-accent, #8f9cff)',
      }}
    >
      {/* 1. Lyrics Style Horizontal Selector */}
      <div className="lsp__group">
        <span className="lsp__group-label" id="lsp-style-label">Lyrics style</span>
        <div className="lsp__pill-row" role="radiogroup" aria-labelledby="lsp-style-label">
          <button
            type="button"
            role="radio"
            aria-checked={style === 'classic'}
            className={`lsp__pill-btn np__lyrics-popover-option${style === 'classic' ? ' is-active' : ''}`}
            onClick={() => onStyleChange?.('classic')}
          >
            <span>Classic</span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={style === 'kinetic'}
            className={`lsp__pill-btn np__lyrics-popover-option${style === 'kinetic' ? ' is-active' : ''}`}
            onClick={() => onStyleChange?.('kinetic')}
          >
            <span>Kinetic</span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={style === 'ghost-wave'}
            className={`lsp__pill-btn np__lyrics-popover-option${style === 'ghost-wave' ? ' is-active' : ''}`}
            onClick={() => onStyleChange?.('ghost-wave')}
          >
            <span>Ghost + Wave</span>
          </button>
        </div>
      </div>

      {/* 2. Layout Compact Selector */}
      <div className="lsp__group">
        <span className="lsp__group-label" id="lsp-layout-label">Layout</span>
        <div className="lsp__pill-row" role="radiogroup" aria-labelledby="lsp-layout-label">
          <button
            type="button"
            role="radio"
            aria-checked={layout === 'floating'}
            className={`lsp__pill-btn lsp__seg-btn${layout === 'floating' ? ' is-active' : ''}`}
            onClick={() => onLayoutChange?.('floating')}
          >
            <span>Floating</span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={layout === 'normal'}
            className={`lsp__pill-btn lsp__seg-btn${layout === 'normal' ? ' is-active' : ''}`}
            onClick={() => onLayoutChange?.('normal')}
          >
            <span>Normal</span>
          </button>
        </div>
      </div>
    </motion.div>
  );

  if (typeof document !== 'undefined' && document.body) {
    return createPortal(content, document.body);
  }
  return content;
}
