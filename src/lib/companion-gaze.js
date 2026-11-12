/**
 * Pure cursor-gaze math for CompanionEyes.
 * Computes bounded, smooth pupil gaze offset from pointer coordinates relative to eye center.
 */
export function computeGazeOffset({
  targetX,
  targetY,
  centerX,
  centerY,
  maxOffset = 3.0,
  maxDistance = 200,
}) {
  if (
    !Number.isFinite(targetX) ||
    !Number.isFinite(targetY) ||
    !Number.isFinite(centerX) ||
    !Number.isFinite(centerY)
  ) {
    return { x: 0, y: 0 };
  }
  const dx = targetX - centerX;
  const dy = targetY - centerY;
  const dist = Math.hypot(dx, dy);
  if (dist < 1) return { x: 0, y: 0 };

  const norm = Math.min(1, dist / Math.max(40, maxDistance));
  const strength = Math.sin((norm * Math.PI) / 2);
  const ux = dx / dist;
  const uy = dy / dist;
  return {
    x: Number((ux * maxOffset * strength).toFixed(2)),
    y: Number((uy * (maxOffset * 0.78) * strength).toFixed(2)),
  };
}

