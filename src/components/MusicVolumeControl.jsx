import { useCallback, useRef, useState } from 'react';
import { Icon } from './icons';

/**
 * MusicVolumeControl — Shared Pill Volume Slider (Hover & Expanded Music)
 *
 * - Full-width horizontal pill-shaped track with dark neutral unfilled portion
 * - Solid WHITE filled portion in BOTH Dynamic Frosted and Dark Frosted
 * - Thin 4px pill track at rest, smoothly expanding to 10px on hover, focus, or drag
 * - Small white circular thumb, zero glow/shadow/gradients
 * - Monochrome speaker icon on left (clickable mute/unmute)
 * - Tabular percentage on right
 */
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
    const next = calcPercentFromClientX(e.clientX);
    onVolumeChange?.(next, { phase: 'start' });
  };

  const handlePointerMove = (e) => {
    if (isDisabled || !draggingRef.current) return;
    e.stopPropagation();
    const next = calcPercentFromClientX(e.clientX);
    onVolumeChange?.(next, { phase: 'move' });
  };

  const handlePointerUp = (e) => {
    if (!draggingRef.current) return;
    e.stopPropagation();
    draggingRef.current = false;
    setDragging(false);
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
      onVolumeChange?.(next, { phase: 'end' });
    }
  };

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
        {muted || effectiveVol === 0 ? (
          <Icon.VolumeX width={13} height={13} />
        ) : (
          <Icon.Volume2 width={13} height={13} />
        )}
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
            }}
          />
          <div
            className="mvc__thumb"
            style={{ left: `${effectiveVol}%` }}
          />
        </div>
      </div>

      <span className="mvc__pct">
        {isDisabled ? '—' : `${effectiveVol}%`}
      </span>
    </div>
  );
}
