import React, { useEffect, useState } from 'react';
import { SPECIES } from '../pets/core/PetTypes';
import CatVisual from '../pets/species/cat/CatVisual';
import DogVisual from '../pets/species/dog/DogVisual';
import { Switch } from './bits';

/**
 * PetStudioPanel: Integrated inside the expanded Dynamic Island.
 * Allows naming the companion (future voice wake-word), selecting species,
 * adjusting size, toggling roaming, cursor tracking, and showing/hiding on desktop.
 */
export default function PetStudioPanel({ setTyping }) {
  const [petName, setPetName] = useState(() => localStorage.getItem('island_pet_name') || 'Mochi');
  const [species, setSpecies] = useState(() => localStorage.getItem('island_active_pet') || SPECIES.CAT);
  const [visible, setVisible] = useState(() => localStorage.getItem('island_pet_visible') !== 'false');
  const [roaming, setRoaming] = useState(() => localStorage.getItem('island_pet_roaming') !== 'false');
  const [tracking, setTracking] = useState(() => localStorage.getItem('island_pet_tracking') !== 'false');
  const [scale, setScale] = useState(() => Number(localStorage.getItem('island_pet_scale')) || 100);

  const handleNameChange = (e) => {
    const val = e.target.value.slice(0, 24);
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

  const handleScaleChange = (e) => {
    const val = Number(e.target.value);
    setScale(val);
    localStorage.setItem('island_pet_scale', String(val));
    window.dispatchEvent(new CustomEvent('island:pet-settings-changed'));
  };

  const handleResetPosition = () => {
    window.dispatchEvent(new CustomEvent('island:pet-reset-pos'));
  };

  return (
    <div className="pet-studio-panel scroll">
      {/* Top Preview Card */}
      <div className="pet-preview-card">
        <div className="pet-preview-viewport">
          <div style={{ transform: `scale(${scale / 100})`, width: 86, height: 74 }}>
            {species === SPECIES.DOG ? (
              <DogVisual state="sit" mood="normal" />
            ) : (
              <CatVisual state="sit" mood="normal" />
            )}
          </div>
        </div>
        <div className="pet-preview-info">
          <div className="pet-preview-name">{petName || 'Companion'}</div>
          <div className="pet-preview-status">
            {visible ? (roaming ? '🐾 Roaming desktop' : '💤 Resting beside island') : 'Hidden from screen'}
          </div>
          <div className="pet-preview-hint">
            Wake phrase: <strong>"Hey {petName || 'Companion'}"</strong>
          </div>
        </div>
      </div>

      {/* Pet Name input */}
      <div className="setting-row">
        <div className="setting-label">
          <span>Pet & Assistant Name</span>
          <span className="setting-sub">Used as the identity and voice command wake phrase</span>
        </div>
        <input
          type="text"
          className="field field--name"
          value={petName}
          onChange={handleNameChange}
          placeholder="e.g. Mochi, Batman"
          onFocus={() => setTyping?.(true)}
          onBlur={() => setTyping?.(false)}
        />
      </div>

      {/* Species Selection */}
      <div className="setting-row">
        <div className="setting-label">
          <span>Species</span>
          <span className="setting-sub">Choose your desktop companion species</span>
        </div>
        <div className="chips">
          <button
            type="button"
            className={`chip ${species === SPECIES.CAT ? 'is-active' : ''}`}
            onClick={() => handleSpeciesChange(SPECIES.CAT)}
          >
            🐱 Cat
          </button>
          <button
            type="button"
            className={`chip ${species === SPECIES.DOG ? 'is-active' : ''}`}
            onClick={() => handleSpeciesChange(SPECIES.DOG)}
          >
            🐶 Dog
          </button>
          <button
            type="button"
            className={`chip ${species === 'both' ? 'is-active' : ''}`}
            onClick={() => handleSpeciesChange('both')}
            title="Inspect both companions side-by-side"
          >
            🐾 Both
          </button>
        </div>
      </div>

      {/* Visibility Toggle */}
      <div className="setting-row setting-row--switch">
        <div className="setting-label">
          <span>Show on Desktop</span>
          <span className="setting-sub">Keep your pet companion active on screen</span>
        </div>
        <Switch checked={visible} onChange={handleVisibilityToggle} label="Toggle pet visibility" />
      </div>

      {/* Roaming Toggle */}
      <div className="setting-row setting-row--switch">
        <div className="setting-label">
          <span>Desktop Roaming</span>
          <span className="setting-sub">Allow pet to take strolls along the companion baseline</span>
        </div>
        <Switch checked={roaming} onChange={handleRoamingToggle} label="Toggle desktop roaming" />
      </div>

      {/* Cursor Following Toggle */}
      <div className="setting-row setting-row--switch">
        <div className="setting-label">
          <span>Cursor Following</span>
          <span className="setting-sub">Pet tracks mouse cursor position with its eyes</span>
        </div>
        <Switch checked={tracking} onChange={handleTrackingToggle} label="Toggle cursor tracking" />
      </div>

      {/* Scale Slider */}
      <div className="setting-row">
        <div className="setting-label">
          <span>Size: {scale}%</span>
          <span className="setting-sub">Adjust companion visual scale on your monitor</span>
        </div>
        <input
          type="range"
          min="75"
          max="135"
          step="5"
          value={scale}
          onChange={handleScaleChange}
          className="slider"
        />
      </div>

      {/* Reset Position Button */}
      <div className="setting-actions">
        <button type="button" className="btn btn--soft" onClick={handleResetPosition}>
          Reset Pet Position
        </button>
      </div>
    </div>
  );
}
