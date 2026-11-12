/**
 * Smooth Maximize / Restore Verification Suite
 * 
 * Verifies:
 * 1. Titlebar double-click maximize/restore support on draggable region
 * 2. Titlebar .is-maximized class application and flush top corner geometry
 * 3. Titlebar close button edge alignment in maximized state
 * 4. WorkspaceApp and SettingsApp integration with useWindowState
 * 5. CSS transition definitions (180–240ms, cubic-bezier, fluid composer max-width)
 * 6. Accessibility: prefers-reduced-motion overrides
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Smooth Maximize / Restore Verification Suite', async (t) => {
  const titlebarJsx = fs.readFileSync(path.join(__dirname, '../src/components/common/Titlebar.jsx'), 'utf-8');
  const titlebarCss = fs.readFileSync(path.join(__dirname, '../src/components/common/titlebar.css'), 'utf-8');
  const quietGlassCss = fs.readFileSync(path.join(__dirname, '../src/components/common/quiet-glass.css'), 'utf-8');
  const workspaceJsx = fs.readFileSync(path.join(__dirname, '../src/components/workspace/WorkspaceApp.jsx'), 'utf-8');
  const workspaceCss = fs.readFileSync(path.join(__dirname, '../src/components/workspace/workspace.css'), 'utf-8');
  const settingsJsx = fs.readFileSync(path.join(__dirname, '../src/components/settings/SettingsApp.jsx'), 'utf-8');
  const settingsCss = fs.readFileSync(path.join(__dirname, '../src/components/settings/settings-window.css'), 'utf-8');
  const useWindowStateCode = fs.readFileSync(path.join(__dirname, '../src/components/common/useWindowState.js'), 'utf-8');

  await t.test('1. Titlebar: double-click on draggable region triggers maximize/restore', () => {
    assert.ok(
      titlebarJsx.includes('onDoubleClick={showMaximize ? handleMaximize : undefined}'),
      'Titlebar draggable region must handle onDoubleClick for native maximize/restore'
    );
  });

  await t.test('2. Titlebar: passes is-maximized class and adjusts top corners flush to screen', () => {
    assert.ok(titlebarJsx.includes("qg-titlebar${isMaximized ? ' is-maximized' : ''}"), 'Titlebar element must apply is-maximized');
    assert.ok(titlebarCss.includes('.qg-titlebar.is-maximized'), 'titlebar.css must define .qg-titlebar.is-maximized');
    assert.ok(titlebarCss.includes('border-top-left-radius: 0;'), 'Maximized titlebar must set border-top-left-radius to 0');
    assert.ok(titlebarCss.includes('border-top-right-radius: 0;'), 'Maximized titlebar must set border-top-right-radius to 0');
  });

  await t.test('3. Titlebar: close button fills exact top-right corner when maximized', () => {
    assert.ok(
      titlebarCss.includes('.qg-titlebar.is-maximized .qg-titlebar__btn--close'),
      'Close button must have maximized override'
    );
    assert.ok(
      titlebarCss.includes('border-top-right-radius: 0;'),
      'Maximized close button must set border-top-right-radius to 0'
    );
  });

  await t.test('4. useWindowState hook: tracks isMaximized and provides transition window', () => {
    assert.ok(useWindowStateCode.includes('window:maximize-change'), 'Hook must listen to window:maximize-change');
    assert.ok(useWindowStateCode.includes('isTransitioning'), 'Hook must track isTransitioning');
    assert.ok(useWindowStateCode.includes('toggleMaximize'), 'Hook must export toggleMaximize helper');
  });

  await t.test('5. WorkspaceApp and SettingsApp: apply is-maximized and is-transitioning to quiet-glass-window', () => {
    assert.ok(workspaceJsx.includes('useWindowState'), 'WorkspaceApp must use useWindowState hook');
    assert.ok(workspaceJsx.includes('isMaximized'), 'WorkspaceApp must bind isMaximized');
    assert.ok(workspaceJsx.includes('isTransitioning'), 'WorkspaceApp must bind isTransitioning');

    assert.ok(settingsJsx.includes('useWindowState'), 'SettingsApp must use useWindowState hook');
    assert.ok(settingsJsx.includes('isMaximized'), 'SettingsApp must bind isMaximized');
    assert.ok(settingsJsx.includes('isTransitioning'), 'SettingsApp must bind isTransitioning');
  });

  await t.test('6. Quiet glass window: smooth border-radius transition and flush maximized state', () => {
    assert.ok(quietGlassCss.includes('.quiet-glass-window.is-maximized'), 'quiet-glass.css must define .is-maximized');
    assert.ok(quietGlassCss.includes('border-radius: 0;'), 'is-maximized must reset border-radius to 0');
    assert.ok(quietGlassCss.includes('border-radius 0.22s cubic-bezier(0.16, 1, 0.3, 1)'), 'Must define smooth 220ms border-radius transition');
  });

  await t.test('7. Workspace layout: fluid composer max-width transition without jarring jump', () => {
    assert.ok(
      workspaceCss.includes('.workspace-layout.is-maximized .workspace-composer'),
      'workspace.css must define maximized composer rule'
    );
    assert.ok(
      workspaceCss.includes('max-width: 760px;'),
      'Maximized composer must have restrained readable max-width (760px)'
    );
    assert.ok(
      workspaceCss.includes('transition: max-width 0.22s cubic-bezier(0.16, 1, 0.3, 1)'),
      'Composer must smoothly transition max-width over 220ms'
    );
  });

  await t.test('8. Accessibility: prefers-reduced-motion disables transitions cleanly', () => {
    assert.ok(quietGlassCss.includes('@media (prefers-reduced-motion: reduce)'), 'quiet-glass.css must support reduced-motion');
    assert.ok(workspaceCss.includes('@media (prefers-reduced-motion: reduce)'), 'workspace.css must support reduced-motion');
    assert.ok(settingsCss.includes('@media (prefers-reduced-motion: reduce)'), 'settings-window.css must support reduced-motion');
  });
});

