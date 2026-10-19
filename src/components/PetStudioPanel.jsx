import React, { useEffect, useState } from 'react';
import { SPECIES } from '../pets/core/PetTypes';
import DogVisual from '../pets/species/dog/DogVisual';
import ThreePetCanvas from '../pets/three/ThreePetCanvas';
import { Switch } from './bits';

/**
 * PetStudioPanel: Modern, high-craft Apple-level glassmorphic companion studio.
 * Replaces generic form blocks with an interactive 3D hero showcase and compact control deck.
 */
export default function PetStudioPanel({ setTyping }) {
  const [petName, setPetName] = useState(() => localStorage.getItem('island_pet_name') || 'Mochi');
  const [species, setSpecies] = useState(() => localStorage.getItem('island_active_pet') || SPECIES.CAT);
  const [visible, setVisible] = useState(() => localStorage.getItem('island_pet_visible') !== 'false');
  const [roaming, setRoaming] = useState(() => localStorage.getItem('island_pet_roaming') !== 'false');
  const [tracking, setTracking] = useState(() => localStorage.getItem('island_pet_tracking') !== 'false');
  const [scale, setScale] = useState(() => Number(localStorage.getItem('island_pet_scale')) || 100);

  const handleNameChange = (e) => {
    const val = e.target.value.slice(0, 20);
    setPetName(val);
    localStorage.setItem('island_pet_name', val);
    window.dispatchEvent(new CustomEvent('island:pet-settings-changed'));
  };

  const handleSpeciesChange = (next) => {
    setSpecies(next);
    localStorage.setItem('island_active_pet', next);
    window.dispatchEvent(new CustomEvent('island:pet-settings-changed'));
  };

  const handleVisibilityToggle = (next) => {
    setVisible(next);
    localStorage.setItem('island_pet_visible', String(next));
    window.dispatchEvent(new CustomEvent('island:pet-settings-changed'));
  };

  const handleRoamingToggle = (next) => {
    setRoaming(next);
    localStorage.setItem('island_pet_roaming', String(next));
    window.dispatchEvent(new CustomEvent('island:pet-settings-changed'));
  };

  const handleTrackingToggle = (next) => {
    setTracking(next);
    localStorage.setItem('island_pet_tracking', String(next));
    window.dispatchEvent(new CustomEvent('island:pet-settings-changed'));
  };

  const handleScaleChange = (val) => {
    setScale(val);
    localStorage.setItem('island_pet_scale', String(val));
    window.dispatchEvent(new CustomEvent('island:pet-settings-changed'));
  };

  const handleResetPosition = () => {
    window.dispatchEvent(new CustomEvent('island:pet-reset-pos'));
  };

  return (
    <div className="pet-studio-panel scroll">
      {/* Hero Showcase with Authentic 3D Kitten */}
      <div className="pet-hero">
        <div className="pet-hero__stage">
          <div className="pet-hero__glow" />
          <div className="pet-hero__model">
            {species === SPECIES.DOG ? (
              <div style={{ transform: `scale(${Math.min(1.2, scale / 100)})`, width: 86, height: 74, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <DogVisual state="sit" mood="normal" />
              </div>
            ) : (
              <ThreePetCanvas isStudio state="sit" mood="normal" scale={scale} />
            )}
          </div>
        </div>

        <div className="pet-hero__details">
          {/* Editable Name */}
          <div className="pet-hero__name-box">
            <input
              type="text"
              className="pet-hero__name-input"
              value={petName}
              onChange={handleNameChange}
              placeholder="Name your pet"
              onFocus={() => setTyping?.(true)}
              onBlur={() => setTyping?.(false)}
            />
            <span className="pet-hero__name-hint">Tap to rename</span>
          </div>

          {/* Assistant Voice Command Badge */}
          <div className="pet-hero__badge">
            <span className="pet-hero__badge-icon">🎙</span>
            <span className="pet-hero__badge-label">Wake: <strong>"Hey {petName || 'Companion'}"</strong></span>
          </div>

          {/* Status Indicator */}
          <div className="pet-hero__status">
            <span className={`pet-hero__status-dot ${visible ? 'is-live' : 'is-off'}`} />
            <span className="pet-hero__status-text">
              {visible ? (roaming ? 'Roaming Desktop' : 'Beside Island') : 'Hidden from Screen'}
            </span>
          </div>
        </div>
      </div>

      {/* Modern Control Grid */}
      <div className="pet-grid">
        {/* Species Selector */}
        <div className="pet-card">
          <div className="pet-card__header">
            <span className="pet-card__title">Companion</span>
            <span className="pet-card__sub">Species</span>
          </div>
          <div className="pet-segmented">
            <button
              type="button"
              className={`pet-segmented__btn ${species === SPECIES.CAT ? 'is-active' : ''}`}
              onClick={() => handleSpeciesChange(SPECIES.CAT)}
            >
              🐱 Cat
            </button>
            <button
              type="button"
              className={`pet-segmented__btn ${species === SPECIES.DOG ? 'is-active' : ''}`}
              onClick={() => handleSpeciesChange(SPECIES.DOG)}
            >
              🐶 Dog
            </button>
            <button
              type="button"
              className={`pet-segmented__btn ${species === 'both' ? 'is-active' : ''}`}
              onClick={() => handleSpeciesChange('both')}
            >
              🐾 Both
            </button>
          </div>
        </div>

        {/* Visual Scale */}
        <div className="pet-card">
          <div className="pet-card__header">
            <span className="pet-card__title">Scale</span>
            <span className="pet-card__tag">{scale}%</span>
          </div>
          <div className="pet-scale-row">
            <input
              type="range"
              min="75"
              max="135"
              step="5"
              value={scale}
              onChange={(e) => handleScaleChange(Number(e.target.value))}
              className="pet-slider"
            />
            <div className="pet-presets">
              <button type="button" className={`pet-preset-btn ${scale === 80 ? 'is-active' : ''}`} onClick={() => handleScaleChange(80)}>
                S
              </button>
              <button type="button" className={`pet-preset-btn ${scale === 100 ? 'is-active' : ''}`} onClick={() => handleScaleChange(100)}>
                M
              </button>
              <button type="button" className={`pet-preset-btn ${scale === 125 ? 'is-active' : ''}`} onClick={() => handleScaleChange(125)}>
                L
              </button>
            </div>
          </div>
        </div>

        {/* Desktop Roaming */}
        <div className="pet-card pet-card--switch">
          <div className="pet-card__header">
            <span className="pet-card__title">Desktop Roaming</span>
            <span className="pet-card__sub">Strolls along screen baseline</span>
          </div>
          <Switch checked={roaming} onChange={handleRoamingToggle} label="Toggle roaming" />
        </div>

        {/* 3D Cursor Following */}
        <div className="pet-card pet-card--switch">
          <div className="pet-card__header">
            <span className="pet-card__title">3D Gaze Tracking</span>
            <span className="pet-card__sub">Head & eyes follow cursor</span>
          </div>
          <Switch checked={tracking} onChange={handleTrackingToggle} label="Toggle tracking" />
        </div>
      </div>

      {/* Master Toolbar */}
      <div className="pet-toolbar">
        <div className="pet-toolbar__left">
          <Switch checked={visible} onChange={handleVisibilityToggle} label="Toggle visibility" />
          <span className="pet-toolbar__label">{visible ? 'Visible on Desktop' : 'Pet Hidden'}</span>
        </div>
        <button type="button" className="pet-btn-reset" onClick={handleResetPosition}>
          ↺ Reset Position
        </button>
      </div>
    </div>
  );
}
