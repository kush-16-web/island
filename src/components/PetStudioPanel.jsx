import React, { useEffect, useState } from 'react';
import { SPECIES } from '../pets/core/PetTypes';
import DogVisual from '../pets/species/dog/DogVisual';
import ThreePetCanvas from '../pets/three/ThreePetCanvas';
import { Switch } from './bits';
import { Icon } from './icons';

/**
 * PetStudioPanel: Modern, high-craft Apple-level glassmorphic companion studio.
 * Replaces generic form blocks with an interactive 3D hero showcase and compact control deck.
 */
export default function PetStudioPanel({ setTyping }) {
  const [petName, setPetName] = useState(() => localStorage.getItem('island_pet_name') || 'Mochi');
  const [userName, setUserName] = useState(() => localStorage.getItem('island_user_name') || 'Friend');
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

  const handleUserNameChange = (e) => {
    const val = e.target.value.slice(0, 20);
    setUserName(val);
    localStorage.setItem('island_user_name', val);
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
    window.island?.setPetVisible?.(next);
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
    window.island?.resetPetPos?.();
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
            <span className="pet-hero__badge-icon">
              <Icon.Mic width={11} height={11} />
            </span>
            <span className="pet-hero__badge-label">
              Voice Assistant: <strong>{petName || 'Mochi'}</strong> calls you <strong>{userName || 'Friend'}</strong>
            </span>
          </div>

          {/* Clean Status Indicator without glowing dots */}
          <div className="pet-hero__status">
            <span className="pet-hero__status-text">
              {visible ? (roaming ? 'Desktop Roaming Active' : 'Resting Beside Island') : 'Companion Inactive'}
            </span>
          </div>
        </div>
      </div>

      {/* Modern Control Grid */}
      <div className="pet-grid">
        {/* User Identity / Preferred Name */}
        <div className="pet-card">
          <div className="pet-card__header">
            <span className="pet-card__title">Your Name</span>
            <span className="pet-card__sub">What {petName || 'Island'} calls you</span>
          </div>
          <div className="pet-input-wrap">
            <input
              type="text"
              className="pet-field-input"
              value={userName}
              onChange={handleUserNameChange}
              placeholder="e.g. Kush"
              onFocus={() => setTyping?.(true)}
              onBlur={() => setTyping?.(false)}
            />
          </div>
        </div>

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
              <Icon.Cat width={13} height={13} />
              <span>Cat</span>
            </button>
            <button
              type="button"
              className={`pet-segmented__btn ${species === SPECIES.DOG ? 'is-active' : ''}`}
              onClick={() => handleSpeciesChange(SPECIES.DOG)}
            >
              <Icon.Dog width={13} height={13} />
              <span>Dog</span>
            </button>
            <button
              type="button"
              className={`pet-segmented__btn ${species === 'both' ? 'is-active' : ''}`}
              onClick={() => handleSpeciesChange('both')}
            >
              <Icon.Paw width={13} height={13} />
              <span>Both</span>
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
