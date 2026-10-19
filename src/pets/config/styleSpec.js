/**
 * Shared Style Specification for 2D Illustrated Desktop Pets
 * Ensures Cat, Dog, Rabbit, and Fox share identical visual DNA,
 * rendering techniques, outlines, and lighting while respecting species-specific anatomy.
 */

export const PET_STYLE_SPEC = {
  // Dimension & Scale
  dimensions: {
    width: 86,
    height: 74,
    anchorY: 'bottom', // Ground contact at feet
  },

  // Unified Soft Pastel Color Palette
  palette: {
    // Shared outline: Warm soft umber (never harsh black #000)
    outline: '#7c5332',
    outlineWidth: 1.8,

    // Soft blush & highlights
    blush: 'rgba(255, 142, 160, 0.42)',
    eyeHighlight: '#ffffff',
    eyePupil: '#261b22',

    // Cat: Soft warm cream & toasted latte tones
    cat: {
      furBaseTop: '#fdf6ed',
      furBaseBottom: '#f1ddc0',
      shadingTop: '#ecd0a8',
      shadingBottom: '#d8ab76',
      accent: '#c09260',
      innerEar: '#f7b6be',
      nose: '#e88998',
    },

    // Dog (Golden Corgi/Retriever mix): Warm honey, butterscotch & white chest/muzzle
    dog: {
      furBaseTop: '#fae3c3',
      furBaseBottom: '#eec996',
      shadingTop: '#e0b47b',
      shadingBottom: '#c89552',
      muzzle: '#fff9f0',
      innerEar: '#f4b8be',
      nose: '#3d2b28',
      tongue: '#ff869a',
      tailTip: '#ffffff',
    },
  },

  // Quadruped Anatomical Rules
  anatomy: {
    cat: {
      ears: 'pointed_triangular_pricked',
      snout: 'flat_feline_delicate',
      tail: 'long_curved_swishing',
      build: 'sleek_flexible',
      paws: 'compact_cushioned',
    },
    dog: {
      ears: 'soft_floppy_canine_fold',
      snout: 'rounded_muzzle_canine_nose',
      tail: 'plumed_upward_wagging',
      build: 'sturdy_loyal_corgi_build',
      paws: 'sturdy_grounded',
    },
  },

  // Shared Animation Timing
  timing: {
    idleBreathe: '3.4s ease-in-out infinite',
    blinkInterval: 5.5, // seconds
    earTwitchInterval: 7.0, // seconds
    walkCycle: '0.52s ease-in-out infinite alternate',
    danceTempo: '0.48s ease-in-out infinite alternate',
    sleepBreathe: '4.8s ease-in-out infinite',
  },
};
