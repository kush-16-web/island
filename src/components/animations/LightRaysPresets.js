export const LOOK = {
  raysOrigin: 'top-center',
  raysColor: '#ffffff',
  raysSpeed: 0.85,
  lightSpread: 0.58,
  rayLength: 3.6,
  rayDensity: 2.8,
  tilt: 0,
  raySharpness: 0.62,
  glow: 0.60,
  haze: 0.0,
  atmosphere: 0.80,
  intensity: 1.35,
  fadeDistance: 1.8,
  saturation: 1.0,
  mouseInfluence: 0.08,
  noiseAmount: 0.0,
  distortion: 0.0,
  pulsating: false,
  intro: false
};

export const PRESETS = {
  spotlight: {
    raysOrigin: 'top-center',
    lightSpread: 0.58,
    rayLength: 3.6,
    rayDensity: 2.8,
    fadeDistance: 1.8,
    glow: 0.60,
    haze: 0.0,
    distortion: 0.0,
    intensity: 1.35,
    raySharpness: 0.62
  },
  sunbeam: {
    raysOrigin: 'top-left',
    tilt: -32,
    raysColor: '#FFD39A',
    lightSpread: 0.60,
    rayLength: 3.8,
    rayDensity: 2.6,
    raySharpness: 0.60,
    glow: 0.65,
    haze: 0.0,
    distortion: 0.0,
    atmosphere: 0.75,
    intensity: 1.35,
    fadeDistance: 2.0
  },
  stage: {
    raysOrigin: 'top-center',
    lightSpread: 0.48,
    rayLength: 3.6,
    rayDensity: 2.8,
    raySharpness: 0.62,
    glow: 0.70,
    haze: 0.0,
    distortion: 0.0,
    intensity: 1.40,
    fadeDistance: 1.8
  },
  searchlight: {
    lightSpread: 0.28,
    rayLength: 4.5,
    rayDensity: 2.8,
    raySharpness: 0.65,
    glow: 0.60,
    haze: 0.0,
    distortion: 0.0,
    intensity: 1.45,
    fadeDistance: 2.2,
    mouseInfluence: 0.35
  },
  cathedral: {
    raysOrigin: 'top-right',
    tilt: 30,
    lightSpread: 0.65,
    rayLength: 3.8,
    rayDensity: 2.8,
    raySharpness: 0.62,
    glow: 0.65,
    haze: 0.0,
    distortion: 0.0,
    intensity: 1.35,
    fadeDistance: 2.0
  },
  underwater: {
    raysColor: '#7FE3FF',
    raysSpeed: 0.50,
    lightSpread: 0.70,
    rayLength: 4.0,
    rayDensity: 2.2,
    raySharpness: 0.50,
    haze: 0.0,
    atmosphere: 0.70,
    distortion: 0.0,
    fadeDistance: 2.2,
    intensity: 1.35
  },
  horizon: {
    raysOrigin: 'bottom-center',
    raysColor: '#FFB070',
    lightSpread: 0.75,
    rayLength: 4.0,
    rayDensity: 2.6,
    raySharpness: 0.55,
    glow: 0.65,
    haze: 0.0,
    distortion: 0.0,
    atmosphere: 0.60,
    intensity: 1.35,
    fadeDistance: 2.2
  }
};

export const PRESET_OPTIONS = [
  { value: 'spotlight', label: 'Spotlight' },
  { value: 'sunbeam', label: 'Sunbeam' },
  { value: 'stage', label: 'Stage' },
  { value: 'searchlight', label: 'Searchlight' },
  { value: 'cathedral', label: 'Cathedral' },
  { value: 'underwater', label: 'Underwater' },
  { value: 'horizon', label: 'Horizon' }
];

export const presetProps = (value, { defaults = {} } = {}) => {
  const base = Object.fromEntries(Object.keys(LOOK).map(name => [name, defaults[name]]));
  return {
    ...base,
    ...PRESETS[value]
  };
};
