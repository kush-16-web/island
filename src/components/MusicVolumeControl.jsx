import { useCallback, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { Icon } from './icons';

/**
 * MusicVolumeControl — Shared Pill Volume Slider (Hover & Expanded Music)
 *
 * - Full-width horizontal pill-shaped track with dark graphite unfilled portion (#252830)
 * - Solid WHITE filled portion in BOTH Dynamic Frosted and Dark Frosted
 * - Track thickness at rest: ~4px, expands symmetrically to ~7px on hover/focus/drag (160ms)
 * - Thumb diameter: ~8px at rest, ~10px during interaction
 * - Centered thumb at the fill endpoint with no extra bulge
 * - Dynamic Windows speaker icon with 4 volume states (Muted, Low, Medium, High)
 * - Click-to-set with smooth ~180ms visual animation while audio command is dispatched immediately
 * - Direct drag tracking with no lag
 */
export function VolumeSpeakerIcon({ volume = 75, muted = false, size = 14 }) {
  const effectiveVol = muted ? 0 : Math.max(0, Math.min(100, Number(volume) || 0));
  if (muted || effectiveVol === 0) {
    return <Icon.VolumeX width={size} height={size} />;
  }
  if (effectiveVol <= 33) {
    return <Icon.VolumeLow width={size} height={size} />;
  }
  if (effectiveVol <= 66) {
    return <Icon.VolumeMedium width={size} height={size} />;
  }
  return <Icon.VolumeHigh width={size} height={size} />;
}

export default function MusicVolumeControl({
  volume = 75,
  muted = false,
  supported = true,
  unavailableReason = '',
  onVolumeChange,
  onToggleMute,
  compact = false,
  className = '',
}) {
  const trackRef = useRef(null);
  const draggingRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  // Animating click-to-set state
  const [animatingFill, setAnimatingFill] = useState(false);
  const animTimerRef = useRef(null);

  const clampedVol = Math.max(0, Math.min(100, Math.round(Number.isFinite(Number(volume)) ? Number(volume) : 75)));
  const effectiveVol = muted ? 0 : clampedVol;
  const isDisabled = supported === false;

  const calcPercentFromClientX = useCallback((clientX) => {
    const el = trackRef.current;
    if (!el) return effectiveVol;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return effectiveVol;
    const ratio = (clientX - rect.left) / rect.width;
    return Math.max(0, Math.min(100, Math.round(ratio * 100)));
  }, [effectiveVol]);

  const handlePointerDown = (e) => {
    if (isDisabled || e.button !== 0) return;
    e.stopPropagation();
    const el = trackRef.current;
    if (el && el.setPointerCapture) {
      try { el.setPointerCapture(e.pointerId); } catch {}
    }
    draggingRef.current = true;
    setDragging(true);

    // Click-to-set animation only if not a rapid drag motion
    if (!prefersReducedMotion) {
      setAnimatingFill(true);
      if (animTimerRef.current) clearTimeout(animTimerRef.current);
      animTimerRef.current = setTimeout(() => {
        setAnimatingFill(false);
      }, 180);
    }

    const next = calcPercentFromClientX(e.clientX);
    onVolumeChange?.(next, { phase: 'start' });
  };

  const handlePointerMove = (e) => {
    if (isDisabled || !draggingRef.current) return;
    e.stopPropagation();
    // During active pointer drag, disable smooth animation so thumb directly matches cursor
    if (animatingFill) {
      setAnimatingFill(false);
      if (animTimerRef.current) clearTimeout(animTimerRef.current);
    }
    const next = calcPercentFromClientX(e.clientX);
    onVolumeChange?.(next, { phase: 'move' });
  };

  const handlePointerUp = (e) => {
    if (!draggingRef.current) return;
    e.stopPropagation();
    draggingRef.current = false;
    setDragging(false);
    if (animTimerRef.current) clearTimeout(animTimerRef.current);
    setAnimatingFill(false);

    const el = trackRef.current;
    if (el && el.releasePointerCapture) {
      try { el.releasePointerCapture(e.pointerId); } catch {}
    }
    if (!isDisabled) {
      const finalVal = calcPercentFromClientX(e.clientX);
      onVolumeChange?.(finalVal, { phase: 'end' });
    }
  };

  const handleKeyDown = (e) => {
    if (isDisabled) return;
    let next = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = Math.min(100, effectiveVol + 2);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = Math.max(0, effectiveVol - 2);
    else if (e.key === 'PageUp') next = Math.min(100, effectiveVol + 10);
    else if (e.key === 'PageDown') next = Math.max(0, effectiveVol - 10);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = 100;

    if (next !== null) {
      e.preventDefault();
      e.stopPropagation();
      if (!prefersReducedMotion) {
        setAnimatingFill(true);
        if (animTimerRef.current) clearTimeout(animTimerRef.current);
        animTimerRef.current = setTimeout(() => setAnimatingFill(false), 180);
      }
      onVolumeChange?.(next, { phase: 'end' });
    }
  };

  // Choose speaker icon according to level
  const renderSpeakerIcon = () => {
    if (muted || effectiveVol === 0) {
      return <Icon.VolumeX width={14} height={14} />;
    }
    if (effectiveVol <= 33) {
      return <Icon.VolumeLow width={14} height={14} />;
    }
    if (effectiveVol <= 66) {
      return <Icon.VolumeMedium width={14} height={14} />;
    }
    return <Icon.VolumeHigh width={14} height={14} />;
  };

  const transitionStyle = animatingFill && !prefersReducedMotion
    ? 'width 180ms cubic-bezier(0.22, 1, 0.36, 1), left 180ms cubic-bezier(0.22, 1, 0.36, 1)'
    : 'none';

  return (
    <div
      className={`mvc${compact ? ' mvc--compact' : ''}${dragging ? ' is-dragging' : ''}${isDisabled ? ' is-unavailable' : ''} ${className}`.trim()}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      title={isDisabled ? (unavailableReason || 'Volume control unavailable for this source') : undefined}
    >
      <button
        type="button"
        className="mvc__mute-btn"
        disabled={isDisabled}
        onClick={(e) => {
          e.stopPropagation();
          if (!isDisabled) onToggleMute?.();
        }}
        aria-label={muted || effectiveVol === 0 ? 'Unmute music' : 'Mute music'}
        title={isDisabled ? 'Unavailable' : (muted || effectiveVol === 0 ? 'Unmute' : 'Mute')}
      >
        <span className="mvc__icon-box">
          {renderSpeakerIcon()}
        </span>
      </button>

      <div
        ref={trackRef}
        className="mvc__track-hit"
        role="slider"
        tabIndex={isDisabled ? -1 : 0}
        aria-label="Music volume"
        aria-disabled={isDisabled}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={effectiveVol}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={handleKeyDown}
      >
        <div className="mvc__track">
          <div
            className="mvc__fill"
            style={{
              width: `${effectiveVol}%`,
              backgroundColor: '#ffffff',
              transition: transitionStyle,
            }}
          />
          <div
            className="mvc__thumb"
            style={{
              left: `${effectiveVol}%`,
              transition: transitionStyle,
            }}
          />
        </div>
      </div>

      <span className="mvc__pct">
        {isDisabled ? '—' : `${effectiveVol}%`}
      </span>
    </div>
  );
}
