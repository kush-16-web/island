import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ANIMATION_STATES, DEFAULT_GROUND_Y, DIRECTIONS, SPECIES } from './PetTypes';
import { PetStateMachine } from './PetStateMachine';
import { PetMovement } from './PetMovement';
import PetRenderer from './PetRenderer';

/**
 * PetController: Orchestrates motion, state machine,
 * and island collision avoidance for a single pet.
 */
export default function PetController({
  species = SPECIES.CAT,
  mood = 'normal',
  islandWidth = 252,
  musicAccent = '#ff869a',
  forcedState = null, // Used for Studio preview
  side = 'right', // 'right' | 'left'
  onPet,
}) {
  const movementRef = useRef(new PetMovement());
  const [animState, setAnimState] = useState(forcedState || ANIMATION_STATES.SIT);
  const [posX, setPosX] = useState(islandWidth / 2 + 32);
  const [facing, setFacing] = useState(side === 'right' ? DIRECTIONS.LEFT : DIRECTIONS.RIGHT);

  const stateMachineRef = useRef(null);
  const walkLoopTimerRef = useRef(null);
  const [roaming, setRoaming] = useState(() => localStorage.getItem('island_pet_roaming') !== 'false');

  // Sync settings and handle reset position
  useEffect(() => {
    const handleSettingsChange = () => {
      setRoaming(localStorage.getItem('island_pet_roaming') !== 'false');
    };
    const handleResetPos = () => {
      const defaultX = side === 'right' ? islandWidth / 2 + 32 : -islandWidth / 2 - 32;
      setPosX(defaultX);
      setFacing(side === 'right' ? DIRECTIONS.LEFT : DIRECTIONS.RIGHT);
      stateMachineRef.current?.setState(ANIMATION_STATES.SIT);
    };

    window.addEventListener('island:pet-settings-changed', handleSettingsChange);
    window.addEventListener('island:pet-reset-pos', handleResetPos);
    return () => {
      window.removeEventListener('island:pet-settings-changed', handleSettingsChange);
      window.removeEventListener('island:pet-reset-pos', handleResetPos);
    };
  }, [islandWidth, side]);

  // Initialize State Machine
  useEffect(() => {
    const sm = new PetStateMachine({
      initial: forcedState || ANIMATION_STATES.SIT,
      onStateChange: (nextState) => setAnimState(nextState),
    });
    stateMachineRef.current = sm;

    return () => {
      sm.destroy();
      clearInterval(walkLoopTimerRef.current);
    };
  }, []);

  // Handle preview/forced state changes
  useEffect(() => {
    if (forcedState) {
      stateMachineRef.current?.setState(forcedState, { isManual: true });
    } else {
      stateMachineRef.current?.clearOverride();
    }
  }, [forcedState]);

  // Keep pet safely clamped outside the island if the island changes width (e.g. Media/Hub)
  useEffect(() => {
    setPosX((currentX) => {
      return movementRef.current.clampToSafe(currentX, islandWidth, side);
    });
  }, [islandWidth, side]);

  // Handle walk state: steps smoothly towards target
  const executeWalk = useCallback(() => {
    const { targetX, direction } = movementRef.current.pickWalkTarget(posX, islandWidth, side);
    setFacing(direction);

    const startX = posX;
    const duration = 2400; // ms
    const startTime = Date.now();

    clearInterval(walkLoopTimerRef.current);
    walkLoopTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(1, elapsed / duration);
      // Quad ease
      const ease = progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress;
      const nextX = startX + (targetX - startX) * ease;
      setPosX(nextX);

      if (progress >= 1) {
        clearInterval(walkLoopTimerRef.current);
        // Turn around to face the user / island
        setFacing(side === 'right' ? DIRECTIONS.LEFT : DIRECTIONS.RIGHT);
        stateMachineRef.current?.transitionToAutonomous(mood);
      }
    }, 25);
  }, [posX, islandWidth, side, mood]);

  // React to state changes from the StateMachine
  useEffect(() => {
    if ((animState === ANIMATION_STATES.WALK || animState === ANIMATION_STATES.RUN) && !forcedState) {
      if (!roaming) {
        stateMachineRef.current?.setState(ANIMATION_STATES.SIT);
        return;
      }
      executeWalk();
    }
  }, [animState, forcedState, roaming, executeWalk]);

  // React to mood changes (e.g., music starts playing or pet dozes off)
  useEffect(() => {
    if (forcedState) return;
    if (mood === 'music') {
      stateMachineRef.current?.setState(ANIMATION_STATES.DANCE);
    } else if (mood === 'sleepy') {
      stateMachineRef.current?.setState(ANIMATION_STATES.SLEEP);
    } else if (animState === ANIMATION_STATES.DANCE) {
      stateMachineRef.current?.setState(ANIMATION_STATES.SIT);
    }
  }, [mood, forcedState]);

  const handlePetClick = () => {
    onPet?.();
    if (!forcedState) {
      stateMachineRef.current?.setState(ANIMATION_STATES.HAPPY, { duration: 2500 });
    }
  };

  return (
    <motion.div
      className="pet-anchor"
      initial={false}
      animate={{ x: posX, y: DEFAULT_GROUND_Y }}
      transition={{ type: 'spring', stiffness: 90, damping: 16 }}
      style={{
        position: 'absolute',
        top: 0,
        left: '50%',
        zIndex: 4,
        pointerEvents: 'none', // Transparent wrapper
      }}
    >
      <div style={{ pointerEvents: 'auto' }}>
        <PetRenderer
          species={species}
          state={forcedState || animState}
          mood={mood}
          facing={facing}
          musicAccent={musicAccent}
          onPet={handlePetClick}
        />
      </div>
    </motion.div>
  );
}
