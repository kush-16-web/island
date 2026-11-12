// Coherent Motion System (Phase 1B.2) — fluid, interruptible, reversible, zero overshoot
export const SPRING = { type: 'spring', stiffness: 420, damping: 36, mass: 0.9 };
export const EASE_OUT = [0.22, 1, 0.36, 1];

export const MOTION = {
  notch: { duration: 0.24, ease: EASE_OUT },      // 220–320ms
  morph: { duration: 0.26, ease: EASE_OUT },      // 240–320ms
  content: { duration: 0.18, ease: EASE_OUT },    // 160–220ms
  hover: { duration: 0.12, ease: EASE_OUT },      // 100–150ms
  lyric: { duration: 0.20, ease: EASE_OUT },      // 180–250ms
  reduced: { duration: 0 },
};

export function getMotionTransition(token, reducedMotion = false) {
  return reducedMotion ? MOTION.reduced : token;
}
