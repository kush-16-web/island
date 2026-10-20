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
    // Schedule first autonomous transition after 3 seconds
    this.timer = setTimeout(() => {
      this.transitionToAutonomous();
    }, 3200);
  }

  setState(nextState, { isManual = false, duration = 0 } = {}) {
    if (this.manualOverride && !isManual) return;

    if (this.currentState === nextState) {
      clearTimeout(this.timer);
      const refreshDur = duration > 0 ? duration : 5000;
      this.timer = setTimeout(() => this.transitionToAutonomous(), refreshDur);
      return;
    }

    this.currentState = nextState;
    if (isManual) this.manualOverride = true;

    clearTimeout(this.timer);
    this.onStateChange?.(nextState);

    if (duration > 0) {
      this.timer = setTimeout(() => {
        if (this.manualOverride && isManual) this.manualOverride = false;
        this.transitionToAutonomous();
      }, duration);
    } else if (!isManual) {
      this.timer = setTimeout(() => {
        this.transitionToAutonomous();
      }, 5000);
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
      const musicChoices = [ANIMATION_STATES.DANCE, ANIMATION_STATES.WALK, ANIMATION_STATES.HAPPY];
      const pool = musicChoices.filter((s) => s !== this.currentState);
      const next = Math.random() < 0.65 ? ANIMATION_STATES.DANCE : (pool[Math.floor(Math.random() * pool.length)] || ANIMATION_STATES.DANCE);
      this.setState(next, { duration: 7000 + Math.random() * 5000 });
      return;
    }

    if (currentMood === 'sleepy') {
      this.setState(ANIMATION_STATES.SLEEP, { duration: 15000 });
      return;
    }

    // Natural varied feline behaviors: filter out current state to prevent repetitive moves
    const pool = [
      ANIMATION_STATES.SIT,
      ANIMATION_STATES.WALK,
      ANIMATION_STATES.RUN,
      ANIMATION_STATES.JUMP,
      ANIMATION_STATES.PLAY,
      ANIMATION_STATES.HAPPY,
    ].filter((s) => s !== this.currentState);

    const next = pool[Math.floor(Math.random() * pool.length)] || ANIMATION_STATES.SIT;
    let dur = 5000;
    if (next === ANIMATION_STATES.SIT) dur = 6000 + Math.random() * 4000;
    else if (next === ANIMATION_STATES.WALK) dur = 3500 + Math.random() * 2500;
    else if (next === ANIMATION_STATES.RUN) dur = 2800 + Math.random() * 1800;
    else if (next === ANIMATION_STATES.JUMP) dur = 2500;
    else if (next === ANIMATION_STATES.PLAY) dur = 4500 + Math.random() * 2500;
    else if (next === ANIMATION_STATES.HAPPY) dur = 3200;

    this.setState(next, { duration: dur });
  }

  destroy() {
    clearTimeout(this.timer);
  }
}
