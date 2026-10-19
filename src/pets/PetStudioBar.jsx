import React, { useState } from 'react';
import { ANIMATION_STATES, SPECIES } from './core/PetTypes';

/**
 * PetStudioBar: Floating diagnostic and validation bar.
 * Allows instant inspection of Cat vs Dog, side-by-side mode,
 * and testing of all required states (Idle, Walk, Sit, Sleep, Dance, Happy).
 */
export default function PetStudioBar({
  currentSpecies,
  onSpeciesChange,
  currentState,
  onStateChange,
}) {
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <button
        type="button"
        className="pet-studio-toggle"
        data-hit
        onClick={() => setCollapsed(false)}
        title="Open Companion Studio"
      >
        🐾 Pet Studio
      </button>
    );
  }

  return (
    <div className="pet-studio-bar" data-hit>
      <div className="pet-studio-header">
        <span className="pet-studio-title">🐾 Companion Studio</span>
        <button
          type="button"
          className="pet-studio-close"
          onClick={() => setCollapsed(true)}
        >
          ✕
        </button>
      </div>

      {/* Species selector */}
      <div className="pet-studio-group">
        <span className="pet-studio-label">Species:</span>
        <div className="pet-studio-btns">
          <button
            type="button"
            className={`pet-studio-btn ${currentSpecies === SPECIES.CAT ? 'is-active' : ''}`}
            onClick={() => onSpeciesChange(SPECIES.CAT)}
          >
            🐱 Cat
          </button>
          <button
            type="button"
            className={`pet-studio-btn ${currentSpecies === SPECIES.DOG ? 'is-active' : ''}`}
            onClick={() => onSpeciesChange(SPECIES.DOG)}
          >
            🐶 Dog
          </button>
          <button
            type="button"
            className={`pet-studio-btn ${currentSpecies === 'both' ? 'is-active' : ''}`}
            onClick={() => onSpeciesChange('both')}
            title="Side-by-side visual comparison"
          >
            🐾 Both Side-by-Side
          </button>
        </div>
      </div>

      {/* Animation State tester */}
      <div className="pet-studio-group">
        <span className="pet-studio-label">Animation:</span>
        <div className="pet-studio-btns">
          <button
            type="button"
            className={`pet-studio-btn ${currentState === null ? 'is-active' : ''}`}
            onClick={() => onStateChange(null)}
          >
            Auto (Live)
          </button>
          <button
            type="button"
            className={`pet-studio-btn ${currentState === ANIMATION_STATES.IDLE ? 'is-active' : ''}`}
            onClick={() => onStateChange(ANIMATION_STATES.IDLE)}
          >
            Idle
          </button>
          <button
            type="button"
            className={`pet-studio-btn ${currentState === ANIMATION_STATES.WALK ? 'is-active' : ''}`}
            onClick={() => onStateChange(ANIMATION_STATES.WALK)}
          >
            Walk
          </button>
          <button
            type="button"
            className={`pet-studio-btn ${currentState === ANIMATION_STATES.SIT ? 'is-active' : ''}`}
            onClick={() => onStateChange(ANIMATION_STATES.SIT)}
          >
            Sit
          </button>
          <button
            type="button"
            className={`pet-studio-btn ${currentState === ANIMATION_STATES.SLEEP ? 'is-active' : ''}`}
            onClick={() => onStateChange(ANIMATION_STATES.SLEEP)}
          >
            Sleep
          </button>
          <button
            type="button"
            className={`pet-studio-btn ${currentState === ANIMATION_STATES.DANCE ? 'is-active' : ''}`}
            onClick={() => onStateChange(ANIMATION_STATES.DANCE)}
          >
            Dance
          </button>
          <button
            type="button"
            className={`pet-studio-btn ${currentState === ANIMATION_STATES.HAPPY ? 'is-active' : ''}`}
            onClick={() => onStateChange(ANIMATION_STATES.HAPPY)}
          >
            Happy
          </button>
        </div>
      </div>
    </div>
  );
}
