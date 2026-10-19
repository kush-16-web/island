import React, { useEffect, useState } from 'react';
import { ANIMATION_STATES, SPECIES } from './core/PetTypes';
import PetController from './core/PetController';

const STORAGE_KEY = 'island_active_pet';

/**
 * PetSystem: Top-level Pet Manager.
 * Supports single companion (Cat or Dog) as well as side-by-side validation mode.
 * Persists user preference across launches.
 */
export default function PetSystem({
  mood = 'normal',
  islandWidth = 252,
  musicAccent = '#ff869a',
  onPet,
  forcedSpecies = null,
  forcedState = null,
}) {
  const [activeSpecies, setActiveSpecies] = useState(() => {
    return localStorage.getItem(STORAGE_KEY) || SPECIES.CAT;
  });
  const [visible, setVisible] = useState(() => {
    return localStorage.getItem('island_pet_visible') !== 'false';
  });

  useEffect(() => {
    const handleSettingsChange = () => {
      setActiveSpecies(localStorage.getItem(STORAGE_KEY) || SPECIES.CAT);
      setVisible(localStorage.getItem('island_pet_visible') !== 'false');
    };
    window.addEventListener('island:pet-settings-changed', handleSettingsChange);
    return () => window.removeEventListener('island:pet-settings-changed', handleSettingsChange);
  }, []);

  useEffect(() => {
    if (forcedSpecies) {
      setActiveSpecies(forcedSpecies);
    }
  }, [forcedSpecies]);

  const handleSpeciesChange = (next) => {
    setActiveSpecies(next);
    localStorage.setItem(STORAGE_KEY, next);
  };

  if (!visible && !forcedSpecies) {
    return null;
  }

  const showBoth = activeSpecies === 'both' || forcedSpecies === 'both';

  return (
    <>
      {showBoth ? (
        // Side-by-side inspection mode: Cat on right, Dog on left
        <>
          <PetController
            species={SPECIES.CAT}
            mood={mood}
            islandWidth={islandWidth}
            musicAccent={musicAccent}
            forcedState={forcedState}
            side="right"
            onPet={onPet}
          />
          <PetController
            species={SPECIES.DOG}
            mood={mood}
            islandWidth={islandWidth}
            musicAccent={musicAccent}
            forcedState={forcedState}
            side="left"
            onPet={onPet}
          />
        </>
      ) : (
        // Normal single companion mode
        <PetController
          species={activeSpecies === SPECIES.DOG ? SPECIES.DOG : SPECIES.CAT}
          mood={mood}
          islandWidth={islandWidth}
          musicAccent={musicAccent}
          forcedState={forcedState}
          side="right"
          onPet={onPet}
        />
      )}
    </>
  );
}

export { SPECIES, ANIMATION_STATES };
