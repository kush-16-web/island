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

  const pWidth = popoverEl ? popoverEl.offsetWidth : 272;
  const pHeight = popoverEl ? popoverEl.offsetHeight : 124;

  const margin = 10;
  const offset = 8;

  const spaceAbove = rect.top - margin;
  const spaceBelow = winH - rect.bottom - margin;

  let placement;
  let top;

  // Viewport-aware collision handling with priority on preferred placement
  if (preferred === 'top' && spaceAbove >= pHeight + offset) {
    placement = 'top';
    top = rect.top - pHeight - offset;
  } else if (spaceBelow >= pHeight + offset) {
    placement = 'bottom';
    top = rect.bottom + offset;
  } else if (spaceAbove >= pHeight + offset) {
    placement = 'top';
    top = rect.top - pHeight - offset;
  } else if (spaceAbove >= spaceBelow) {
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
        margin: 0,
        transformOrigin: currentPlacement === 'top' ? 'bottom right' : 'top right',
        maxHeight: `${coords?.maxHeight ?? 460}px`,
        '--popover-accent': accentColor || 'var(--music-accent, #ffffff)',
      }}
    >
      <motion.div
        className="lsp__content"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.16 }}
      >
        {/* 1. Lyrics Style Horizontal Selector */}
        <div className="lsp__group">
          <span className="lsp__group-label" id="lsp-style-label">Lyrics style</span>
          <div className="lsp__pill-row" role="radiogroup" aria-labelledby="lsp-style-label">
            {[
              { id: 'classic', label: 'Classic' },
              { id: 'kinetic', label: 'Kinetic' },
              { id: 'ghost-wave', label: 'Ghost + Wave' },
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={style === opt.id}
                className={`lsp__pill-btn np__lyrics-popover-option${style === opt.id ? ' is-active' : ''}`}
                onClick={() => onStyleChange?.(opt.id)}
              >
                {style === opt.id && (
                  <motion.div
                    layoutId="lsp-active-style-glider"
                    className="lsp__pill-glider"
                    transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                  />
                )}
                <span className="lsp__pill-label">{opt.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 2. Layout Compact Selector */}
        <div className="lsp__group">
          <span className="lsp__group-label" id="lsp-layout-label">Layout</span>
          <div className="lsp__pill-row" role="radiogroup" aria-labelledby="lsp-layout-label">
            {[
              { id: 'floating', label: 'Floating' },
              { id: 'normal', label: 'Normal' },
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={layout === opt.id}
                className={`lsp__pill-btn lsp__seg-btn${layout === opt.id ? ' is-active' : ''}`}
                onClick={() => onLayoutChange?.(opt.id)}
              >
                {layout === opt.id && (
                  <motion.div
                    layoutId="lsp-active-layout-glider"
                    className="lsp__pill-glider"
                    transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                  />
                )}
                <span className="lsp__pill-label">{opt.label}</span>
              </button>
            ))}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );

  if (typeof document !== 'undefined' && document.body) {
    return createPortal(content, document.body);
  }
  return content;
}
