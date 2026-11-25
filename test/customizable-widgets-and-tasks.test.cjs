const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

describe('Customizable Idle Notch Widgets & Island Tasks Suite', () => {
  it('1. idle-prefs.js: exports IDLE_WIDGET_OPTIONS and handles widget preferences', async () => {
    const idlePrefsModule = await import('../src/lib/idle-prefs.js');
    assert.ok(Array.isArray(idlePrefsModule.IDLE_WIDGET_OPTIONS), 'Must export IDLE_WIDGET_OPTIONS');
    assert.strictEqual(idlePrefsModule.IDLE_WIDGET_OPTIONS.length, 8, 'Must have 8 widget options');

    const ids = idlePrefsModule.IDLE_WIDGET_OPTIONS.map((o) => o.id);
    assert.ok(ids.includes('weather'), 'Must include weather widget');
    assert.ok(ids.includes('date'), 'Must include date widget');
    assert.ok(ids.includes('clock'), 'Must include clock widget');
    assert.ok(ids.includes('battery'), 'Must include battery widget');
    assert.ok(ids.includes('timer'), 'Must include timer widget');
    assert.ok(ids.includes('cpu'), 'Must include cpu widget');
    assert.ok(ids.includes('tasks'), 'Must include tasks widget');
    assert.ok(ids.includes('none'), 'Must include none option');

    const flags = idlePrefsModule.resolveIdleDisplayFlags({
      leftWidget: 'weather',
      rightWidget: 'date',
    });
    assert.strictEqual(flags.leftWidget, 'weather');
    assert.strictEqual(flags.rightWidget, 'date');
    assert.strictEqual(flags.showWeather, true);
    assert.strictEqual(flags.showDate, true);
  });

  it('2. tasks.js: manages task lifecycle and calculates stats', async () => {
    const tasksModule = await import('../src/lib/tasks.js');
    const defaultTasks = tasksModule.DEFAULT_TASKS;
    assert.ok(Array.isArray(defaultTasks), 'Must have default tasks');
    assert.strictEqual(defaultTasks.length, 7, 'Must have 7 default tasks');

    const stats = tasksModule.getTaskStats(defaultTasks);
    assert.strictEqual(stats.total, 7);
    assert.strictEqual(stats.completed, 2);
    assert.strictEqual(stats.ratio, '2/7', 'Initial default ratio must be 2/7');

    const parsed = tasksModule.parseTasksFromAi('Here are your tasks:\n- Review telemetry\n- Send report');
    assert.strictEqual(parsed.length, 2);
    assert.strictEqual(parsed[0], 'Review telemetry');
    assert.strictEqual(parsed[1], 'Send report');
  });

  it('3. IdleWidget.jsx: renders multi-mode compact widget badges', () => {
    const widgetPath = path.join(__dirname, '..', 'src', 'components', 'IdleWidget.jsx');
    const content = fs.readFileSync(widgetPath, 'utf8');

    assert.ok(content.includes('idle-widget--weather'), 'Must render weather badge');
    assert.ok(content.includes('idle-widget--tasks'), 'Must render tasks badge');
    assert.ok(content.includes('idle-widget--battery'), 'Must render battery badge');
    assert.ok(content.includes('idle-widget--cpu'), 'Must render cpu badge');
    assert.ok(content.includes('idle-widget--timer'), 'Must render timer badge');
  });

  it('4. SettingsApp.jsx: mounts interactive idle notch concept preview & widget dropdowns', () => {
    const settingsPath = path.join(__dirname, '..', 'src', 'components', 'settings', 'SettingsApp.jsx');
    const content = fs.readFileSync(settingsPath, 'utf8');

    assert.ok(content.includes('idle-concept-card'), 'Must contain idle-concept-card');
    assert.ok(content.includes('Interactive idle notch concept'), 'Must contain concept heading matching mock');
    assert.ok(content.includes('idle-concept-notch'), 'Must render interactive preview notch');
    assert.ok(content.includes('Left widget'), 'Must have Left widget dropdown');
    assert.ok(content.includes('Right widget'), 'Must have Right widget dropdown');
  });

  it('5. LauncherPanel.jsx: supports Tasks checklist view and clean glass utility grid', () => {
    const launcherPath = path.join(__dirname, '..', 'src', 'components', 'panels', 'LauncherPanel.jsx');
    const content = fs.readFileSync(launcherPath, 'utf8');

    assert.ok(content.includes('utility-pane--tasks'), 'Must support tasks detail pane');
    assert.ok(content.includes('ios-tasks-card'), 'Must render ios-tasks-card');
    assert.ok(content.includes('ios-weather-daily'), 'Must render 5-day daily ground forecast strip');
  });
});
