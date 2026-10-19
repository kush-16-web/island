import React, { useEffect, useRef, useState } from 'react';
import { SPECIES } from './PetTypes';
import CatVisual from '../species/cat/CatVisual';
import DogVisual from '../species/dog/DogVisual';
import ThreePetCanvas from '../three/ThreePetCanvas';

/**
 * PetRenderer: Visual wrapper for the pet character.
 * Connects cursor tracking, handles foot-anchored rendering,
 * and manages species switching with Three.js 3D Kitten support.
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
  const [scale, setScale] = useState(() => Number(localStorage.getItem('island_pet_scale')) || 100);
  const containerRef = useRef(null);

  // Sync scale from Pet Studio
  useEffect(() => {
    const handleSettingsChange = () => {
      const s = Number(localStorage.getItem('island_pet_scale')) || 100;
      setScale(s);
    };
    window.addEventListener('island:pet-settings-changed', handleSettingsChange);
    return () => window.removeEventListener('island:pet-settings-changed', handleSettingsChange);
  }, []);

  // Smooth cursor tracking for 2D pet's pupils (if Dog selected)
  useEffect(() => {
    const el = containerRef.current;
    if (!el || species === SPECIES.CAT) return undefined;

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
  }, [facing, species]);

  const handleClick = (e) => {
    e?.stopPropagation?.();
    onPet?.();

    // Spawn floating heart
    const heartId = Date.now();
    setHearts((prev) => [...prev, heartId]);
    setTimeout(() => {
      setHearts((prev) => prev.filter((id) => id !== heartId));
    }, 1200);
  };

  // Real 3D Kitten
  if (species === SPECIES.CAT) {
    return (
      <div
        ref={containerRef}
        className="pet-container pet-species--cat pet-species--3d"
        data-hit
        role="button"
        aria-label="Your desktop 3D kitten"
        style={{
          transform: `scale(${scale / 100})`,
          transformOrigin: 'bottom center',
        }}
      >
        <ThreePetCanvas
          state={state}
          mood={mood}
          facing={facing}
          musicAccent={musicAccent}
          scale={scale}
          onPet={handleClick}
        />
      </div>
    );
  }

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
        transform: `scaleX(${facing}) scale(${scale / 100})`,
        transformOrigin: 'bottom center',
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
