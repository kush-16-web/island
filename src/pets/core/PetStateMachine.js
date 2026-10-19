/**
 * PetStateMachine: Manages life cycles, autonomous behaviors,
 * mood transitions, and manual overrides (e.g. preview mode or music playback).
 */
import { ANIMATION_STATES } from './PetTypes';

export class PetStateMachine {
  constructor({ onStateChange, initial = ANIMATION_STATES.SIT } = {}) {
    this.currentState = initial;
    this.onStateChange = onStateChange;
    this.timer = null;
    this.manualOverride = false;
  }

  setState(nextState, { isManual = false, duration = 0 } = {}) {
    if (this.manualOverride && !isManual) return;
    if (this.currentState === nextState) return;

    this.currentState = nextState;
    if (isManual) this.manualOverride = true;

    clearTimeout(this.timer);
    this.onStateChange?.(nextState);

    if (duration > 0) {
      this.timer = setTimeout(() => {
        if (this.manualOverride && isManual) this.manualOverride = false;
        this.transitionToAutonomous();
      }, duration);
    }
  }

  clearOverride() {
    this.manualOverride = false;
    clearTimeout(this.timer);
    this.transitionToAutonomous();
  }

  // Autonomous decision loop: picks natural animal behaviors
  transitionToAutonomous(currentMood = 'normal') {
    if (this.manualOverride) return;

    if (currentMood === 'music') {
      const choices = [ANIMATION_STATES.DANCE, ANIMATION_STATES.WALK, ANIMATION_STATES.IDLE];
      const next = Math.random() < 0.65 ? ANIMATION_STATES.DANCE : choices[Math.floor(Math.random() * choices.length)];
      this.setState(next, { duration: 8000 + Math.random() * 6000 });
      return;
    }

    if (currentMood === 'sleepy') {
      this.setState(ANIMATION_STATES.SLEEP);
      return;
    }

    // Natural playful behavior distribution:
    // 25% Sit peacefully, 20% 4-legged walk, 15% Playful run, 15% Jump/Pounce, 15% Play with toy ball, 10% Happy purr/stretch
    const roll = Math.random();
    let next = ANIMATION_STATES.SIT;
    let dur = 7000;

    if (roll < 0.25) {
      next = ANIMATION_STATES.SIT;
      dur = 7000 + Math.random() * 6000;
    } else if (roll < 0.45) {
      next = ANIMATION_STATES.WALK;
      dur = 3500 + Math.random() * 2500;
    } else if (roll < 0.60) {
      next = ANIMATION_STATES.RUN;
      dur = 2800 + Math.random() * 2000;
    } else if (roll < 0.75) {
      next = ANIMATION_STATES.JUMP;
      dur = 2400;
    } else if (roll < 0.90) {
      next = ANIMATION_STATES.PLAY;
      dur = 4500 + Math.random() * 3000;
    } else {
      next = ANIMATION_STATES.HAPPY;
      dur = 3200;
    }

    this.setState(next, { duration: dur });
  }

  destroy() {
    clearTimeout(this.timer);
  }
}
