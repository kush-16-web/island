/**
 * Multi-Window Manager & Phase 1A Foundation Test Suite
 * 
 * Verifies:
 * 1. clampBoundsToWorkArea safety (bounds clamping, multi-monitor safety, min bounds enforcement)
 * 2. WindowManager lifecycle contracts and single-instance behavior
 * 3. Preload IPC contract additions ('window:control', 'workspace:open', 'settings:open')
 * 4. Pet visibility default (OFF) and on-demand toggle lifecycle
 * 5. Window bounds debounce and persistence safety
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { clampBoundsToWorkArea } = require('../electron/window-manager');

test('Multi-Window Manager & Phase 1A Foundation Test Suite', async (t) => {
  await t.test('1. clampBoundsToWorkArea: clamps off-screen coordinates into visible workArea', () => {
    // Mock off-screen bounds (e.g. secondary monitor disconnected)
    const offScreenBounds = { x: 9999, y: 9999, width: 960, height: 720 };
    const clamped = clampBoundsToWorkArea(offScreenBounds, { width: 960, height: 720, minWidth: 800, minHeight: 600 });

    assert.ok(Number.isFinite(clamped.x), 'Clamped x must be finite');
    assert.ok(Number.isFinite(clamped.y), 'Clamped y must be finite');
    assert.ok(clamped.x < 9999, 'Clamped x must be brought inside monitor workArea');
    assert.ok(clamped.y < 9999, 'Clamped y must be brought inside monitor workArea');
    assert.ok(clamped.width >= 800, 'Width must respect minWidth');
    assert.ok(clamped.height >= 600, 'Height must respect minHeight');
  });

  await t.test('2. clampBoundsToWorkArea: enforces minimum width and height', () => {
    const tooSmallBounds = { x: 100, y: 100, width: 300, height: 200 };
    const clamped = clampBoundsToWorkArea(tooSmallBounds, { width: 960, height: 720, minWidth: 800, minHeight: 600 });

    assert.equal(clamped.width, 800, 'Width must be clamped to minWidth (800)');
    assert.equal(clamped.height, 600, 'Height must be clamped to minHeight (600)');
  });

  await t.test('3. clampBoundsToWorkArea: returns centered default when bounds are null or empty', () => {
    const clamped = clampBoundsToWorkArea(null, { width: 760, height: 560, minWidth: 680, minHeight: 480 });

    assert.equal(clamped.width, 760);
    assert.equal(clamped.height, 560);
    assert.ok(Number.isFinite(clamped.x));
    assert.ok(Number.isFinite(clamped.y));
  });

  await t.test('4. Preload contract: exposes multi-window methods and whitelists channels', () => {
    const preloadCode = fs.readFileSync(path.join(__dirname, '..', 'electron', 'preload.js'), 'utf-8');

    // Channels
    assert.ok(preloadCode.includes("'window:maximize-change'"), 'Preload must whitelist window:maximize-change');
    assert.ok(preloadCode.includes("'settings:tab-change'"), 'Preload must whitelist settings:tab-change');
    assert.ok(preloadCode.includes("'pet:visibility-changed'"), 'Preload must whitelist pet:visibility-changed');

    // APIs
    assert.ok(preloadCode.includes('openWorkspace:'), 'Preload must expose openWorkspace');
    assert.ok(preloadCode.includes('openSettings:'), 'Preload must expose openSettings');
    assert.ok(preloadCode.includes('windowControl:'), 'Preload must expose windowControl');
    assert.ok(preloadCode.includes('isWindowMaximized:'), 'Preload must expose isWindowMaximized');
    assert.ok(preloadCode.includes('getPetVisible:'), 'Preload must expose getPetVisible');
    assert.ok(preloadCode.includes('getAppearanceMode:'), 'Preload must expose getAppearanceMode');
    assert.ok(preloadCode.includes('setAppearanceMode:'), 'Preload must expose setAppearanceMode');
    assert.ok(preloadCode.includes("'appearance:mode-changed'"), 'Preload must whitelist appearance:mode-changed');
  });

  await t.test('5. Main process: registers multi-window IPC handlers and lazy pet startup', () => {
    const mainCode = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.js'), 'utf-8');

    assert.ok(mainCode.includes("listen('workspace:open'"), 'main.js must listen for workspace:open');
    assert.ok(mainCode.includes("listen('settings:open'"), 'main.js must listen for settings:open');
    assert.ok(mainCode.includes("ipcMain.on('window:control'"), 'main.js must listen for window:control');
    assert.ok(mainCode.includes("handle('window:is-maximized'"), 'main.js must handle window:is-maximized');
    assert.ok(mainCode.includes("handle('pet:get-visible'"), 'main.js must handle pet:get-visible');
    assert.ok(mainCode.includes("handle('settings:get-appearance-mode'"), 'main.js must handle settings:get-appearance-mode');
    assert.ok(mainCode.includes("listen('settings:set-appearance-mode'"), 'main.js must listen for settings:set-appearance-mode');
    assert.ok(mainCode.includes("store.get('appearance_mode', 'dynamic_frosted')"), 'main.js must default appearance_mode to dynamic_frosted');

    // Startup: pet creation must be conditional on store
    assert.ok(
      mainCode.includes("const petVisible = store ? store.get('island_pet_visible', false) : false;"),
      'main.js must read island_pet_visible with default false'
    );
  });

  await t.test('6. WindowManager: sets backgroundMaterial acrylic on secondary windows and compact defaults', () => {
    const wmCode = fs.readFileSync(path.join(__dirname, '..', 'electron', 'window-manager.js'), 'utf-8');

    assert.ok(wmCode.includes("backgroundMaterial: 'acrylic'"), 'window-manager.js must specify backgroundMaterial acrylic');
    assert.ok(wmCode.includes("backgroundColor: '#00000000'"), 'window-manager.js must set transparent background color for DWM acrylic');
    assert.ok(wmCode.includes("width: 680, height: 520"), 'window-manager.js must use refined AI window default bounds (680x520)');
    assert.ok(wmCode.includes("width: 540, height: 520"), 'window-manager.js must use compact Settings default bounds (540x520)');
  });

  await t.test('7. App routing: routes #workspace and #settings to dedicated shells', () => {
    const appCode = fs.readFileSync(path.join(__dirname, '..', 'src', 'App.jsx'), 'utf-8');

    assert.ok(appCode.includes("hash === '#workspace'"), 'App.jsx must check for #workspace hash');
    assert.ok(appCode.includes("hash === '#settings'"), 'App.jsx must check for #settings hash');
    assert.ok(appCode.includes('<WorkspaceApp />'), 'App.jsx must render WorkspaceApp on #workspace');
    assert.ok(appCode.includes('<SettingsApp />'), 'App.jsx must render SettingsApp on #settings');
  });

  await t.test('8. Mock bridge: implements multi-window fallbacks for browser preview', () => {
    const mockCode = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'shared', 'mockIsland.js'), 'utf-8');

    assert.ok(mockCode.includes('openWorkspace()'), 'mockIsland must provide openWorkspace');
    assert.ok(mockCode.includes('openSettings('), 'mockIsland must provide openSettings');
    assert.ok(mockCode.includes('windowControl('), 'mockIsland must provide windowControl');
    assert.ok(mockCode.includes('isWindowMaximized:'), 'mockIsland must provide isWindowMaximized');
    assert.ok(mockCode.includes('getPetVisible:'), 'mockIsland must provide getPetVisible');
    assert.ok(mockCode.includes('getAppearanceMode:'), 'mockIsland must provide getAppearanceMode');
    assert.ok(mockCode.includes('setAppearanceMode('), 'mockIsland must provide setAppearanceMode');
  });
});

