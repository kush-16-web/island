/**
 * Idle Notch Customization Preferences (Phase 1B.2)
 *
 * Configurable Idle Notch Widgets:
 * - leftWidget: 'none' | 'clock' | 'date' | 'weather' | 'battery' | 'timer' | 'cpu' | 'tasks'
 * - rightWidget: 'none' | 'clock' | 'date' | 'weather' | 'battery' | 'timer' | 'cpu' | 'tasks'
 * - showEyes: Centered 2D companion eyes (default true)
 * - companionAnimations: Natural blinking and idle movements (default true)
 *
 * Presets (Legacy & Quick-pick):
 * - eyes_only: Centered 2D companion eyes
 * - eyes_clock: Centered 2D eyes with balanced clock
 * - clock_weather: Clock + compact weather
 * - eyes_weather: Centered 2D eyes + compact weather
 * - custom: User-selected combination of widgets
 */

const STORAGE_KEY = 'island_idle_notch_prefs';

export const IDLE_WIDGETS = Object.freeze({
  NONE: 'none',
  CLOCK: 'clock',
  DATE: 'date',
  WEATHER: 'weather',
  BATTERY: 'battery',
  TIMER: 'timer',
  CPU: 'cpu',
  TASKS: 'tasks',
});

export const IDLE_WIDGET_OPTIONS = [
  { id: IDLE_WIDGETS.NONE, label: 'None' },
  { id: IDLE_WIDGETS.CLOCK, label: 'Clock' },
  { id: IDLE_WIDGETS.DATE, label: 'Date' },
  { id: IDLE_WIDGETS.WEATHER, label: 'Weather' },
  { id: IDLE_WIDGETS.BATTERY, label: 'Battery' },
  { id: IDLE_WIDGETS.TIMER, label: 'Active timer' },
  { id: IDLE_WIDGETS.CPU, label: 'CPU usage' },
  { id: IDLE_WIDGETS.TASKS, label: 'Tasks' },
];

export const IDLE_PRESETS = {
  EYES_ONLY: 'eyes_only',
  EYES_CLOCK: 'eyes_clock',
  CLOCK_WEATHER: 'clock_weather',
  EYES_WEATHER: 'eyes_weather',
  CUSTOM: 'custom',
};

export const DEFAULT_IDLE_PREFS = {
  preset: IDLE_PRESETS.CUSTOM,
  leftWidget: IDLE_WIDGETS.WEATHER,
  rightWidget: IDLE_WIDGETS.DATE,
  showEyes: true,
  showTime: false,
  showDate: true,
  showWeather: true,
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

    // Normalize widget selections
    let leftWidget = parsed.leftWidget;
    let rightWidget = parsed.rightWidget;

    // Migrate from legacy flags if widgets not explicitly set
    if (!leftWidget && !rightWidget) {
      if (parsed.preset === IDLE_PRESETS.EYES_ONLY) {
        leftWidget = IDLE_WIDGETS.NONE;
        rightWidget = IDLE_WIDGETS.NONE;
      } else if (parsed.preset === IDLE_PRESETS.EYES_CLOCK) {
        leftWidget = IDLE_WIDGETS.CLOCK;
        rightWidget = IDLE_WIDGETS.NONE;
      } else if (parsed.preset === IDLE_PRESETS.CLOCK_WEATHER) {
        leftWidget = IDLE_WIDGETS.CLOCK;
        rightWidget = IDLE_WIDGETS.WEATHER;
      } else if (parsed.preset === IDLE_PRESETS.EYES_WEATHER) {
        leftWidget = IDLE_WIDGETS.NONE;
        rightWidget = IDLE_WIDGETS.WEATHER;
      } else {
        leftWidget = parsed.showTime ? IDLE_WIDGETS.CLOCK : IDLE_WIDGETS.WEATHER;
        rightWidget = parsed.showDate ? IDLE_WIDGETS.DATE : (parsed.showWeather ? IDLE_WIDGETS.WEATHER : IDLE_WIDGETS.NONE);
      }
    }

    return {
      ...DEFAULT_IDLE_PREFS,
      ...parsed,
      leftWidget: leftWidget || IDLE_WIDGETS.WEATHER,
      rightWidget: rightWidget || IDLE_WIDGETS.DATE,
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
        next.leftWidget = IDLE_WIDGETS.NONE;
        next.rightWidget = IDLE_WIDGETS.NONE;
        next.showEyes = true;
        break;
      case IDLE_PRESETS.EYES_CLOCK:
        next.leftWidget = IDLE_WIDGETS.CLOCK;
        next.rightWidget = IDLE_WIDGETS.NONE;
        next.showEyes = true;
        break;
      case IDLE_PRESETS.CLOCK_WEATHER:
        next.leftWidget = IDLE_WIDGETS.CLOCK;
        next.rightWidget = IDLE_WIDGETS.WEATHER;
        next.showEyes = false;
        break;
      case IDLE_PRESETS.EYES_WEATHER:
        next.leftWidget = IDLE_WIDGETS.NONE;
        next.rightWidget = IDLE_WIDGETS.WEATHER;
        next.showEyes = true;
        break;
      default:
        break;
    }
  }

  // Update legacy flags to keep backward compatibility
  next.showTime = next.leftWidget === IDLE_WIDGETS.CLOCK || next.rightWidget === IDLE_WIDGETS.CLOCK;
  next.showDate = next.leftWidget === IDLE_WIDGETS.DATE || next.rightWidget === IDLE_WIDGETS.DATE;
  next.showWeather = next.leftWidget === IDLE_WIDGETS.WEATHER || next.rightWidget === IDLE_WIDGETS.WEATHER;

  // Ensure at least eyes or one widget is visible
  if (!next.showEyes && next.leftWidget === IDLE_WIDGETS.NONE && next.rightWidget === IDLE_WIDGETS.NONE) {
    next.showEyes = true;
  }

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      window.dispatchEvent(new CustomEvent('island:idle-prefs-changed', { detail: next }));
      if (typeof BroadcastChannel !== 'undefined') {
        const bc = new BroadcastChannel('island_idle_prefs_channel');
        bc.postMessage(next);
        bc.close();
      }
    } catch {}
  }
  return next;
}

export function resolveIdleDisplayFlags(prefs = DEFAULT_IDLE_PREFS) {
  const left = prefs.leftWidget ?? (prefs.showTime ? IDLE_WIDGETS.CLOCK : (prefs.showWeather ? IDLE_WIDGETS.WEATHER : IDLE_WIDGETS.NONE));
  const right = prefs.rightWidget ?? (prefs.showDate ? IDLE_WIDGETS.DATE : (prefs.showWeather && left !== IDLE_WIDGETS.WEATHER ? IDLE_WIDGETS.WEATHER : IDLE_WIDGETS.NONE));

  return {
    leftWidget: left,
    rightWidget: right,
    showEyes: prefs.showEyes !== false,
    companionAnimations: prefs.companionAnimations !== false,
    showTime: left === IDLE_WIDGETS.CLOCK || right === IDLE_WIDGETS.CLOCK,
    showDate: left === IDLE_WIDGETS.DATE || right === IDLE_WIDGETS.DATE,
    showWeather: left === IDLE_WIDGETS.WEATHER || right === IDLE_WIDGETS.WEATHER,
  };
}
