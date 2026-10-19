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

    // Natural behavior distribution:
    // 40% Sit peacefully, 30% Take a 4-legged walk, 20% Stand idle & look around, 10% Happy stretch/wiggle
    const roll = Math.random();
    let next = ANIMATION_STATES.SIT;
    let dur = 9000;

    if (roll < 0.4) {
      next = ANIMATION_STATES.SIT;
      dur = 8000 + Math.random() * 8000;
    } else if (roll < 0.7) {
      next = ANIMATION_STATES.WALK;
      dur = 3500 + Math.random() * 2500;
    } else if (roll < 0.9) {
      next = ANIMATION_STATES.IDLE;
      dur = 5000 + Math.random() * 4000;
    } else {
      next = ANIMATION_STATES.HAPPY;
      dur = 3000;
    }

    this.setState(next, { duration: dur });
  }

  destroy() {
    clearTimeout(this.timer);
  }
}
