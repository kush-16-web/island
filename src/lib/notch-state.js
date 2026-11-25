/**
 * Island AI — Explicit Notch State Machine & Geometry Calculator (Phase 1B)
 *
 * Single predictable source of truth for the three notch interaction states:
 * - compact: Resting top-attached notch (~190–220px × 36–38px)
 * - hoverPreview: Intentional pointer hover context preview (~292–336px × 76–92px)
 * - expanded: Full control center (Hub, 468px × dynamic height)
 *
 * Also computes top-attached corner radii (flat top edge, rounded bottom corners)
 * and visibility state for Always Visible, Smart Hide, and Peek modes.
 */

export const NOTCH_STATES = {
  COMPACT: 'compact',
  HOVER_PREVIEW: 'hoverPreview',
  EXPANDED: 'expanded',
};

export const NOTCH_EVENTS = {
  POINTER_ENTER_READY: 'POINTER_ENTER_READY',
  POINTER_LEAVE_READY: 'POINTER_LEAVE_READY',
  CLICK: 'CLICK',
  SHORTCUT_OPEN: 'SHORTCUT_OPEN',
  SHORTCUT_TOGGLE: 'SHORTCUT_TOGGLE',
  COLLAPSE: 'COLLAPSE',
  ESCAPE: 'ESCAPE',
  BLUR: 'BLUR',
  OUTSIDE_CLICK: 'OUTSIDE_CLICK',
};

export const HUB_W = 468;

/**
 * Pure state machine reducer for notch interaction state.
 * Guarantees deterministic transitions and prevents invalid states.
 */
export function transitionNotchState(currentState, event) {
  switch (event) {
    case NOTCH_EVENTS.POINTER_ENTER_READY:
      if (currentState === NOTCH_STATES.COMPACT) {
        return NOTCH_STATES.HOVER_PREVIEW;
      }
      return currentState;

    case NOTCH_EVENTS.POINTER_LEAVE_READY:
      if (currentState === NOTCH_STATES.HOVER_PREVIEW) {
        return NOTCH_STATES.COMPACT;
      }
      return currentState;

    case NOTCH_EVENTS.CLICK:
    case NOTCH_EVENTS.SHORTCUT_OPEN:
      return NOTCH_STATES.EXPANDED;

    case NOTCH_EVENTS.SHORTCUT_TOGGLE:
      return currentState === NOTCH_STATES.EXPANDED
        ? NOTCH_STATES.COMPACT
        : NOTCH_STATES.EXPANDED;

    case NOTCH_EVENTS.COLLAPSE:
    case NOTCH_EVENTS.ESCAPE:
    case NOTCH_EVENTS.BLUR:
    case NOTCH_EVENTS.OUTSIDE_CLICK:
      return NOTCH_STATES.COMPACT;

    default:
      return currentState;
  }
}

/**
 * Determines whether the notch should be hidden or tucked into a peek lip
 * based on the active visibility mode and live activity.
 */
export function evaluateNotchVisibility({
  visibilityMode = 'always',
  notchState = NOTCH_STATES.COMPACT,
  hasActiveMedia = false,
  hasActiveTimer = false,
  hasActiveVoice = false,
  hasUrgentAlert = false,
  hovered = false,
}) {
  const hasActivity = hasActiveMedia || hasActiveTimer || hasActiveVoice || hasUrgentAlert;
  const isInteracting = notchState !== NOTCH_STATES.COMPACT || hovered;

  if (visibilityMode === 'smart_hide') {
    return {
      isHidden: !hasActivity && !isInteracting,
      isPeeking: false,
    };
  }

  if (visibilityMode === 'peek') {
    return {
      isHidden: false,
      isPeeking: !hasActivity && !isInteracting,
    };
  }

  return {
    isHidden: false,
    isPeeking: false,
  };
}

/**
 * Computes content-driven dimensions and top-attached radii for the notch.
 */
export function computeNotchDimensions({
  notchState = NOTCH_STATES.COMPACT,
  mode = 'idle',
  isPeeking = false,
  mediaTitle = '',
  timerLabel = '',
  tab = 'launcher',
  isLyricsFull = false,
  hasActiveMedia = false,
  scheduleCount = 0,
  alarmCount = null,
  inboxCount = 0,
  idlePrefs = null,
  measureTextFn = null,
  activeUtility = null,
}) {
  const measure = typeof measureTextFn === 'function' ? measureTextFn : (t) => (t ? t.length * 7 : 60);

  // Urgent notifications / ringing alarms take top priority
  if (mode === 'ring') {
    return { width: 414, height: 54, bottomRadius: 27 };
  }
  if (mode === 'toast') {
    return { width: 384, height: 66, bottomRadius: 22 };
  }

  // Peek lip when tucked in Peek visibility mode
  if (isPeeking && notchState === NOTCH_STATES.COMPACT) {
    return { width: 120, height: 6, bottomRadius: 4 };
  }

  // Expanded control center (Hub)
  if (notchState === NOTCH_STATES.EXPANDED || mode === 'hub') {
    let hubW = HUB_W;
    let hubH = 280;
    switch (tab) {
      case 'launcher':
        hubW = 520;
        if (activeUtility === 'new_alarm') {
          hubH = 315;
        } else if (activeUtility === 'clock' || activeUtility === 'timer') {
          // Content-adaptive height for Alarms (0: 154, 1: 186, 2: 246, 3+: 270 with scroll)
          const count = alarmCount !== null ? alarmCount : (scheduleCount || 0);
          if (count === 0) hubH = 154;
          else if (count === 1) hubH = 186;
          else if (count === 2) hubH = 246;
          else hubH = 270;
        } else if (activeUtility === 'tasks') {
          hubH = 320;
        } else {
          hubH = hasActiveMedia ? 276 : 240;
        }
        break;
      case 'voice':
        hubH = 330;
        break;
      case 'playing':
        if (isLyricsFull === 'favorites') {
          hubW = HUB_W;
          hubH = 380;
        } else if (isLyricsFull === 'lyrics' || isLyricsFull === true) {
          hubW = 524;
          hubH = 380;
        } else if (isLyricsFull === 'cinema') {
          hubW = 492;
          hubH = 315;
        } else if (!hasActiveMedia) {
          hubW = 468;
          hubH = 236;
        } else {
          // Approved Two-Column Expanded Music Layout (Gate A.1: 572x304)
          hubW = 572;
          hubH = 304;
        }
        break;
      case 'clock':
        hubW = 520;
        hubH = 280;
        break;
      case 'inbox':
        hubH = inboxCount === 0 ? 175 : Math.min(340, 105 + inboxCount * 58);
        break;
      case 'pet':
        hubH = 410;
        break;
      case 'settings':
        hubH = 355;
        break;
      default:
        hubH = 280;
    }
    return { width: hubW, height: hubH, bottomRadius: 26 };
  }

  // Hover Preview state: restrained contextual card
  if (notchState === NOTCH_STATES.HOVER_PREVIEW) {
    if (mode === 'media' || mode === 'both') {
      // Approved Hover Music Layout (Gate A: 488x96, expanded for longer lyrics)
      return { width: 488, height: 96, bottomRadius: 22 };
    }
    if (mode === 'voice') {
      return { width: 312, height: 84, bottomRadius: 22 };
    }
    if (mode === 'timer') {
      return { width: 296, height: 78, bottomRadius: 20 };
    }
    // Idle hover preview: time + quick actions
    return { width: 316, height: 78, bottomRadius: 20 };
  }

  // Compact resting notch: target ~190–220px × 34–40px for eyes-only, balanced width when extras enabled
  if (mode === 'voice') {
    return { width: 220, height: 38, bottomRadius: 16 };
  }
  if (mode === 'media') {
    const textW = Math.ceil(measure(mediaTitle));
    const w = Math.min(276, Math.max(196, textW + 88));
    return { width: w, height: 38, bottomRadius: 16 };
  }
  if (mode === 'both') {
    const textW = Math.ceil(measure(mediaTitle));
    const w = Math.min(308, Math.max(228, textW + 122));
    return { width: w, height: 38, bottomRadius: 16 };
  }
  if (mode === 'timer') {
    const textW = Math.ceil(measure(timerLabel));
    const w = Math.min(256, Math.max(196, textW + 114));
    return { width: w, height: 38, bottomRadius: 16 };
  }

  // Idle compact notch: responsive to enabled idle items while keeping eyes centered
  const leftWidget = idlePrefs?.leftWidget ?? (idlePrefs?.showTime ? 'clock' : (idlePrefs?.showWeather ? 'weather' : 'none'));
  const rightWidget = idlePrefs?.rightWidget ?? (idlePrefs?.showDate ? 'date' : (idlePrefs?.showWeather && leftWidget !== 'weather' ? 'weather' : 'none'));
  const hasLeft = Boolean(leftWidget && leftWidget !== 'none');
  const hasRight = Boolean(rightWidget && rightWidget !== 'none');
  const extrasCount = (hasLeft ? 1 : 0) + (hasRight ? 1 : 0);
  const hasWide = leftWidget === 'date' || rightWidget === 'date' || leftWidget === 'tasks' || rightWidget === 'tasks';
  const idleW = extrasCount === 0 ? 200 : extrasCount === 1 ? (hasWide ? 228 : 220) : (hasWide ? 254 : 242);
  return { width: idleW, height: 36, bottomRadius: 16 };
}

