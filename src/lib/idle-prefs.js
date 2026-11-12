/**
 * Idle Notch Customization Preferences (Phase 1B.2)
 *
 * Presets:
 * - eyes_only (DEFAULT): Centered 2D companion eyes
 * - eyes_clock: Centered 2D eyes with balanced clock
 * - clock_weather: Clock + compact weather
 * - eyes_weather: Centered 2D eyes + compact weather
 * - custom: User-selected combination of eyes / time / date / weather
 */

const STORAGE_KEY = 'island_idle_notch_prefs';

export const IDLE_PRESETS = {
  EYES_ONLY: 'eyes_only',
  EYES_CLOCK: 'eyes_clock',
  CLOCK_WEATHER: 'clock_weather',
  EYES_WEATHER: 'eyes_weather',
  CUSTOM: 'custom',
};

export const DEFAULT_IDLE_PREFS = {
  preset: IDLE_PRESETS.EYES_ONLY,
  showEyes: true,
  showTime: false,
  showDate: false,
  showWeather: false,
  companionAnimations: true,
};

export function getIdleNotchPrefs() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { ...DEFAULT_IDLE_PREFS };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_IDLE_PREFS };
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_IDLE_PREFS,
      ...parsed,
      preset: Object.values(IDLE_PRESETS).includes(parsed?.preset)
        ? parsed.preset
        : DEFAULT_IDLE_PREFS.preset,
    };
  } catch {
    return { ...DEFAULT_IDLE_PREFS };
  }
}

export function setIdleNotchPrefs(patch) {
  const current = getIdleNotchPrefs();
  const next = { ...current, ...patch };

  // Apply preset defaults when switching preset directly
  if (patch.preset && patch.preset !== IDLE_PRESETS.CUSTOM) {
    switch (patch.preset) {
      case IDLE_PRESETS.EYES_ONLY:
        next.showEyes = true;
        next.showTime = false;
        next.showDate = false;
        next.showWeather = false;
        break;
      case IDLE_PRESETS.EYES_CLOCK:
        next.showEyes = true;
        next.showTime = true;
        next.showDate = false;
        next.showWeather = false;
        break;
      case IDLE_PRESETS.CLOCK_WEATHER:
        next.showEyes = false;
        next.showTime = true;
        next.showDate = false;
        next.showWeather = true;
        break;
      case IDLE_PRESETS.EYES_WEATHER:
        next.showEyes = true;
        next.showTime = false;
        next.showDate = false;
        next.showWeather = true;
        break;
      default:
        break;
    }
  }

  // Ensure at least one item stays visible
  if (!next.showEyes && !next.showTime && !next.showDate && !next.showWeather) {
    next.showEyes = true;
  }

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      window.dispatchEvent(new CustomEvent('island:idle-prefs-changed', { detail: next }));
    } catch {}
  }
  return next;
}

export function resolveIdleDisplayFlags(prefs = DEFAULT_IDLE_PREFS) {
  return {
    showEyes: Boolean(prefs.showEyes),
    showTime: Boolean(prefs.showTime),
    showDate: Boolean(prefs.showDate),
    showWeather: Boolean(prefs.showWeather),
    companionAnimations: prefs.companionAnimations !== false,
  };
}

