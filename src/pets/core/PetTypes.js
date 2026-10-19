/**
 * Pet System Core Types & Constants
 * Defines supported species, animation states, moods, and movement parameters.
 */

export const SPECIES = {
  CAT: 'cat',
  DOG: 'dog',
};

export const ANIMATION_STATES = {
  IDLE: 'idle',
  WALK: 'walk',
  RUN: 'run',
  JUMP: 'jump',
  PLAY: 'play',
  SIT: 'sit',
  SLEEP: 'sleep',
  DANCE: 'dance',
  HAPPY: 'happy',
};

export const MOODS = {
  NORMAL: 'normal',
  MUSIC: 'music',
  ALERT: 'alert',
  SLEEPY: 'sleepy',
  PETTED: 'petted',
};

export const DIRECTIONS = {
  LEFT: -1,
  RIGHT: 1,
};

export const DEFAULT_GROUND_Y = 18; // Base offset ensuring pet stands comfortably beside the island without overlap
