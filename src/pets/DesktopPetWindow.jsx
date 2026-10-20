import React, { useCallback, useEffect, useRef, useState } from 'react';
import { SPECIES, ANIMATION_STATES, DIRECTIONS } from './core/PetTypes';
import { PetStateMachine } from './core/PetStateMachine';
import PetRenderer from './core/PetRenderer';
import { useClickThrough } from '../hooks/useClickThrough';

/**
 * DesktopPetWindow: Standalone desktop companion rendered in its own
 * dedicated, transparent, frameless window.
 * Supports free dragging anywhere across screens, autonomous desk baseline
 * roaming, 3D cursor tracking, and music synchronization.
 */
export default function DesktopPetWindow() {
  useClickThrough();
  const [species, setSpecies] = useState(() => localStorage.getItem('island_active_pet') || SPECIES.CAT);
  const [visible, setVisible] = useState(() => localStorage.getItem('island_pet_visible') === 'true');
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
      setVisible(localStorage.getItem('island_pet_visible') === 'true');
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
        stateMachineRef.current?.setState(ANIMATION_STATES.DANCE, { duration: 15000 });
      } else {
        setMood('normal');
        stateMachineRef.current?.transitionToAutonomous('normal');
      }
    });
  }, []);

  // Listen to voice assistant state from Electron bridge
  useEffect(() => {
    if (!window.island?.on) return undefined;
    return window.island.on('voice:state', (voiceState) => {
      if (voiceState === 'listening') {
        clearInterval(walkIntervalRef.current);
        setMood('alert');
        stateMachineRef.current?.setState(ANIMATION_STATES.SIT, { duration: 30000 });
      } else if (voiceState === 'speaking') {
        clearInterval(walkIntervalRef.current);
        setMood('normal');
        stateMachineRef.current?.setState(ANIMATION_STATES.HAPPY, { duration: 12000 });
      } else {
        setMood('normal');
        stateMachineRef.current?.transitionToAutonomous('normal');
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

  // Autonomous desktop roaming (strolling by moving window position with screen edge detection)
  const executeDesktopWalk = useCallback(async (isRun = false) => {
    if (!roaming || !window.island?.movePetBy) return;

    let currX = 500;
    try {
      const pos = await window.island?.getPetPos?.();
      if (pos && typeof pos.x === 'number') currX = pos.x;
    } catch {}

    const screenW = window.screen.availWidth || 1920;
    let dir;
    if (currX < 140) {
      // Near left boundary, turn right!
      dir = DIRECTIONS.RIGHT;
    } else if (currX > screenW - 300) {
      // Near right boundary, turn left!
      dir = DIRECTIONS.LEFT;
    } else {
      dir = Math.random() > 0.5 ? DIRECTIONS.RIGHT : DIRECTIONS.LEFT;
    }
    setFacing(dir);

    const steps = isRun ? 26 : 38 + Math.floor(Math.random() * 20);
    let stepCount = 0;
    const stepDist = dir * (isRun ? 4.5 : 2.4);

    clearInterval(walkIntervalRef.current);
    walkIntervalRef.current = setInterval(() => {
      window.island?.movePetBy?.(stepDist, 0);
      stepCount++;
      if (stepCount >= steps) {
        clearInterval(walkIntervalRef.current);
        setFacing(DIRECTIONS.RIGHT);
        stateMachineRef.current?.transitionToAutonomous(mood);
      }
    }, isRun ? 30 : 45);
  }, [roaming, mood]);

  useEffect(() => {
    if (animState === ANIMATION_STATES.WALK) {
      if (!roaming) {
        stateMachineRef.current?.setState(ANIMATION_STATES.SIT, { duration: 4000 });
        return;
      }
      executeDesktopWalk(false);
    } else if (animState === ANIMATION_STATES.RUN) {
      if (!roaming) {
        stateMachineRef.current?.setState(ANIMATION_STATES.SIT, { duration: 4000 });
        return;
      }
      executeDesktopWalk(true);
    }
  }, [animState, roaming, executeDesktopWalk]);

  // Robust desktop dragging: attach listeners to window so fast mouse gestures never lose drag
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({
    active: false,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    hasMoved: false,
  });

  const onPointerDown = useCallback((e) => {
    if (e.button !== 0) return;
    dragRef.current = {
      active: true,
      startX: e.screenX,
      startY: e.screenY,
      lastX: e.screenX,
      lastY: e.screenY,
      hasMoved: false,
    };
    setIsDragging(true);

    const onPointerMove = (ev) => {
      if (!dragRef.current.active) return;
      const dx = ev.screenX - dragRef.current.lastX;
      const dy = ev.screenY - dragRef.current.lastY;
      const dist = Math.hypot(ev.screenX - dragRef.current.startX, ev.screenY - dragRef.current.startY);

      if (dist > 3) {
        dragRef.current.hasMoved = true;
        if (window.island?.movePetBy) {
          window.island.movePetBy(dx, dy);
        }
        dragRef.current.lastX = ev.screenX;
        dragRef.current.lastY = ev.screenY;
      }
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      setIsDragging(false);

      if (!dragRef.current.active) return;
      const { hasMoved } = dragRef.current;
      dragRef.current.active = false;

      if (!hasMoved) {
        // Pet click/tap: playful kitten reactions (jumping, batting toy yarn ball, or purring)
        const actions = [ANIMATION_STATES.HAPPY, ANIMATION_STATES.JUMP, ANIMATION_STATES.PLAY];
        const next = actions[Math.floor(Math.random() * actions.length)];
        stateMachineRef.current?.setState(next, { duration: 3200 });
      }
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  }, []);

  if (!visible) return null;

  return (
    <div
      className="desktop-pet-root"
      style={{
        width: '100vw',
        height: '100vh',
        overflow: 'visible',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'transparent',
        pointerEvents: 'none',
        cursor: 'default',
        userSelect: 'none',
      }}
    >
      <div
        data-hit
        onPointerDown={onPointerDown}
        style={{
          pointerEvents: 'auto',
          cursor: isDragging ? 'grabbing' : 'grab',
          display: 'inline-block',
        }}
      >
        <PetRenderer
          species={species === 'both' ? SPECIES.CAT : species}
          state={animState}
          mood={mood}
          facing={facing}
          musicAccent={musicAccent}
          onPet={() => {
            const actions = [ANIMATION_STATES.HAPPY, ANIMATION_STATES.JUMP, ANIMATION_STATES.PLAY];
            const next = actions[Math.floor(Math.random() * actions.length)];
            stateMachineRef.current?.setState(next, { duration: 3200 });
          }}
        />
      </div>
    </div>
  );
}
