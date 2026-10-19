import React, { useCallback, useEffect, useRef, useState } from 'react';
import { SPECIES, ANIMATION_STATES, DIRECTIONS } from './core/PetTypes';
import { PetStateMachine } from './core/PetStateMachine';
import PetRenderer from './core/PetRenderer';

/**
 * DesktopPetWindow: Standalone desktop companion rendered in its own
 * dedicated, transparent, frameless window.
 * Supports free dragging anywhere across screens, autonomous desk baseline
 * roaming, 3D cursor tracking, and music synchronization.
 */
export default function DesktopPetWindow() {
  const [species, setSpecies] = useState(() => localStorage.getItem('island_active_pet') || SPECIES.CAT);
  const [visible, setVisible] = useState(() => localStorage.getItem('island_pet_visible') !== 'false');
  const [roaming, setRoaming] = useState(() => localStorage.getItem('island_pet_roaming') !== 'false');
  const [scale, setScale] = useState(() => Number(localStorage.getItem('island_pet_scale')) || 100);
  const [mood, setMood] = useState('normal');
  const [musicAccent, setMusicAccent] = useState('#ff869a');
  const [animState, setAnimState] = useState(ANIMATION_STATES.SIT);
  const [facing, setFacing] = useState(DIRECTIONS.RIGHT);

  const stateMachineRef = useRef(null);
  const walkIntervalRef = useRef(null);

  // Sync settings
  useEffect(() => {
    const handleSettingsChange = () => {
      setSpecies(localStorage.getItem('island_active_pet') || SPECIES.CAT);
      setVisible(localStorage.getItem('island_pet_visible') !== 'false');
      setRoaming(localStorage.getItem('island_pet_roaming') !== 'false');
      setScale(Number(localStorage.getItem('island_pet_scale')) || 100);
    };
    window.addEventListener('island:pet-settings-changed', handleSettingsChange);
    return () => window.removeEventListener('island:pet-settings-changed', handleSettingsChange);
  }, []);

  // Listen to media state from Electron bridge
  useEffect(() => {
    if (!window.island?.on) return undefined;
    return window.island.on('media', (media) => {
      if (media && media.active && media.status === 'playing') {
        setMood('music');
        stateMachineRef.current?.setState(ANIMATION_STATES.DANCE);
      } else {
        setMood('normal');
        stateMachineRef.current?.setState(ANIMATION_STATES.SIT);
      }
    });
  }, []);

  // Initialize state machine
  useEffect(() => {
    const sm = new PetStateMachine({
      initial: ANIMATION_STATES.SIT,
      onStateChange: (nextState) => setAnimState(nextState),
    });
    stateMachineRef.current = sm;
    return () => {
      sm.destroy();
      clearInterval(walkIntervalRef.current);
    };
  }, []);

  // Autonomous desktop roaming (strolling by moving window position)
  const executeDesktopWalk = useCallback((isRun = false) => {
    if (!roaming || !window.island?.movePetBy) return;
    const dir = Math.random() > 0.5 ? DIRECTIONS.RIGHT : DIRECTIONS.LEFT;
    setFacing(dir);

    const steps = isRun ? 22 : 30 + Math.floor(Math.random() * 25);
    let stepCount = 0;
    const stepDist = dir * (isRun ? 5.0 : 2.5);

    clearInterval(walkIntervalRef.current);
    walkIntervalRef.current = setInterval(() => {
      window.island?.movePetBy?.(stepDist, 0);
      stepCount++;
      if (stepCount >= steps) {
        clearInterval(walkIntervalRef.current);
        setFacing(DIRECTIONS.RIGHT);
        stateMachineRef.current?.transitionToAutonomous(mood);
      }
    }, isRun ? 28 : 40);
  }, [roaming, mood]);

  useEffect(() => {
    if (animState === ANIMATION_STATES.WALK) {
      if (!roaming) {
        stateMachineRef.current?.setState(ANIMATION_STATES.SIT);
        return;
      }
      executeDesktopWalk(false);
    } else if (animState === ANIMATION_STATES.RUN) {
      if (!roaming) {
        stateMachineRef.current?.setState(ANIMATION_STATES.SIT);
        return;
      }
      executeDesktopWalk(true);
    }
  }, [animState, roaming, executeDesktopWalk]);

  // Dragging support: user can pick up the pet and move it anywhere on desktop
  const dragRef = useRef({
    active: false,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    hasMoved: false,
    pointerId: null,
  });

  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    dragRef.current = {
      active: true,
      startX: e.screenX,
      startY: e.screenY,
      lastX: e.screenX,
      lastY: e.screenY,
      hasMoved: false,
      pointerId: e.pointerId,
    };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
  };

  const onPointerMove = (e) => {
    if (!dragRef.current.active) return;
    const dx = e.screenX - dragRef.current.lastX;
    const dy = e.screenY - dragRef.current.lastY;
    const totalDist = Math.hypot(e.screenX - dragRef.current.startX, e.screenY - dragRef.current.startY);

    if (totalDist > 3) {
      dragRef.current.hasMoved = true;
      if (window.island?.movePetBy) {
        window.island.movePetBy(dx, dy);
      }
      dragRef.current.lastX = e.screenX;
      dragRef.current.lastY = e.screenY;
    }
  };

  const onPointerUp = (e) => {
    if (!dragRef.current.active) return;
    const { hasMoved, pointerId } = dragRef.current;
    dragRef.current.active = false;
    try {
      if (pointerId !== null) e.currentTarget.releasePointerCapture(pointerId);
    } catch {}

    if (!hasMoved) {
      // Pet click: happy reaction
      stateMachineRef.current?.setState(ANIMATION_STATES.HAPPY, { duration: 2500 });
    }
  };

  if (!visible) return null;

  return (
    <div
      className="desktop-pet-root"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{
        width: 150,
        height: 130,
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        background: 'transparent',
        cursor: 'grab',
        userSelect: 'none',
      }}
    >
      <div style={{ pointerEvents: 'auto', transform: 'translateY(-2px)' }}>
        <PetRenderer
          species={species === 'both' ? SPECIES.CAT : species}
          state={animState}
          mood={mood}
          facing={facing}
          musicAccent={musicAccent}
          onPet={() => stateMachineRef.current?.setState(ANIMATION_STATES.HAPPY, { duration: 2500 })}
        />
      </div>
    </div>
  );
}
