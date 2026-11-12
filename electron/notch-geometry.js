/**
 * Top-Attached Notch Geometry & Multi-Monitor Positioning (Phase 1B)
 *
 * Computes exact workArea-respecting top-center coordinates for the Island notch window.
 * Ensures:
 * - Zero top gap (flush with display workArea.y, respecting top/bottom/side taskbars)
 * - Horizontal centering on the target display
 * - Safe fallback to primary display if a selected monitor disconnects
 * - DPI / scaleFactor awareness
 */

const NOTCH_WIN_W = 600;
const NOTCH_WIN_H = 440;

const VALID_VISIBILITY_MODES = ['always', 'smart_hide', 'peek'];

/**
 * Normalizes notch visibility mode with safe default ('always').
 */
function normalizeVisibilityMode(mode) {
  return VALID_VISIBILITY_MODES.includes(mode) ? mode : 'always';
}

/**
 * Computes the top-attached notch BrowserWindow bounds for a display.
 *
 * @param {object} params
 * @param {Electron.Display} [params.display] - Explicit primary/fallback display
 * @param {Electron.Display[]} [params.allDisplays] - All connected displays
 * @param {number|null} [params.displayId] - Preferred display ID
 * @param {number} [params.windowWidth] - Transparent container width
 * @param {number} [params.windowHeight] - Transparent container height
 */
function computeNotchPosition({
  display = null,
  allDisplays = [],
  displayId = null,
  windowWidth = NOTCH_WIN_W,
  windowHeight = NOTCH_WIN_H,
} = {}) {
  const displays = Array.isArray(allDisplays) ? allDisplays : [];
  let target = null;

  if (displayId != null && displays.length > 0) {
    target = displays.find((d) => d && d.id === displayId) || null;
  }
  if (!target) {
    target = display || displays[0] || null;
  }

  const workArea = target?.workArea || target?.bounds || { x: 0, y: 0, width: 1920, height: 1080 };
  const waX = Number.isFinite(workArea.x) ? workArea.x : 0;
  const waY = Number.isFinite(workArea.y) ? workArea.y : 0;
  const waW = Number.isFinite(workArea.width) && workArea.width > 0 ? workArea.width : 1920;
  const waH = Number.isFinite(workArea.height) && workArea.height > 0 ? workArea.height : 1080;

  const effectiveW = Math.min(windowWidth, waW);
  const effectiveH = Math.min(windowHeight, waH);

  let posX = waX + Math.round((waW - effectiveW) / 2);
  posX = Math.max(waX, Math.min(waX + waW - effectiveW, posX));
  const posY = waY;

  return {
    x: Math.round(posX),
    y: Math.round(posY),
    width: Math.round(effectiveW),
    height: Math.round(effectiveH),
    edge: 'top',
    preset: 'center',
    align: 'center',
    vAlign: 'top',
    displayId: target?.id ?? null,
    scaleFactor: target?.scaleFactor ?? 1,
    workArea: { x: waX, y: waY, width: waW, height: waH },
  };
}

module.exports = {
  NOTCH_WIN_W,
  NOTCH_WIN_H,
  VALID_VISIBILITY_MODES,
  normalizeVisibilityMode,
  computeNotchPosition,
};

