import React, { useEffect, useRef, useState } from 'react';
import { SPECIES } from './PetTypes';
import CatVisual from '../species/cat/CatVisual';
import DogVisual from '../species/dog/DogVisual';

/**
 * PetRenderer: Visual wrapper for the pet character.
 * Connects cursor tracking, handles foot-anchored rendering,
 * and manages species switching.
 */
export default function PetRenderer({
  species = SPECIES.CAT,
  state = 'sit',
  mood = 'normal',
  facing = 1,
  musicAccent = '#ff869a',
  onPet,
}) {
  const [eyePos, setEyePos] = useState({ lx: 0, ly: 0 });
  const [hearts, setHearts] = useState([]);
  const containerRef = useRef(null);

  // Smooth cursor tracking for the pet's pupils
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;

    const handleMouseMove = (e) => {
      const rect = el.getBoundingClientRect();
      const petCenterX = rect.left + rect.width / 2;
      const petCenterY = rect.top + rect.height * 0.42;

      const dx = e.clientX - petCenterX;
      const dy = e.clientY - petCenterY;
      const dist = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, dist / 160);

      // Account for facing direction so eyes track toward cursor correctly
      const effectiveDx = dx * facing;
      setEyePos({
        lx: (effectiveDx / dist) * 2.8 * k,
        ly: (dy / dist) * 2.2 * k,
      });
    };

    document.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => document.removeEventListener('mousemove', handleMouseMove);
  }, [facing]);

  const handleClick = (e) => {
    e.stopPropagation();
    onPet?.();

    // Spawn floating heart
    const heartId = Date.now();
    setHearts((prev) => [...prev, heartId]);
    setTimeout(() => {
      setHearts((prev) => prev.filter((id) => id !== heartId));
    }, 1200);
  };

  const VisualComponent = species === SPECIES.DOG ? DogVisual : CatVisual;

  return (
    <div
      ref={containerRef}
      className={`pet-container pet-species--${species}`}
      data-hit
      onClick={handleClick}
      role="button"
      aria-label={`Your desktop ${species}`}
      style={{
        transform: `scaleX(${facing})`,
      }}
    >
      <VisualComponent
        state={state}
        mood={mood}
        musicAccent={musicAccent}
        eyePos={eyePos}
      />

      {/* Floating petting hearts */}
      {hearts.map((id) => (
        <span key={id} className="pet-floating-heart" aria-hidden="true">
          ♥
        </span>
      ))}
    </div>
  );
}
