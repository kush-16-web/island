// Coherent Motion System (Phase 1B.3 Gate B.1) — fluid, interruptible, reversible, zero overshoot
export const SPRING = { type: 'spring', stiffness: 400, damping: 35, mass: 0.9 };
export const EASE_OUT = [0.22, 1, 0.36, 1];

export const MOTION = {
  notch: { duration: 0.28, ease: EASE_OUT },      // 240–320ms notch expansion
  morph: { duration: 0.30, ease: EASE_OUT },      // 280–340ms tile morph
  content: { duration: 0.16, ease: EASE_OUT },    // 140–190ms content enter/exit
  header: { duration: 0.18, ease: EASE_OUT },     // 160–220ms header transitions
  press: { duration: 0.11, ease: EASE_OUT },      // 90–140ms press feedback
  digit: { duration: 0.22, ease: EASE_OUT },      // 180–260ms rolling digits
  hover: { duration: 0.12, ease: EASE_OUT },      // 100–150ms hover feedback
  lyric: { duration: 0.20, ease: EASE_OUT },      // 180–250ms line transitions
  reduced: { duration: 0 },
};

export function getMotionTransition(token, reducedMotion = false) {
  return reducedMotion ? MOTION.reduced : token;
}
