'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Scheduler, nextOccurrence } = require('../electron/scheduler');

// Monday 19 Oct 2026, 15:00 local time
const BASE = new Date(2026, 9, 19, 15, 0, 0).getTime();
const at = (d, h, m) => new Date(2026, 9, d, h, m, 0).getTime();

function make(items = []) {
  const clock = { t: BASE };
  const s = new Scheduler({ now: () => clock.t, autoStart: false, items });
  return { s, clock };
}

test('nextOccurrence: later today, tomorrow, weekdays, strictly in the future', () => {
  assert.equal(nextOccurrence('15:30', [], BASE), at(19, 15, 30));
  assert.equal(nextOccurrence('14:30', [], BASE), at(20, 14, 30));
  assert.equal(nextOccurrence('15:00', [], BASE), at(20, 15, 0));
  assert.equal(nextOccurrence('09:00', [3], BASE), at(21, 9, 0)); // Wednesday
  assert.equal(nextOccurrence('09:00', [1], BASE), at(26, 9, 0)); // next Monday
});

test('timer fires once after its duration and is removed', () => {
  const { s, clock } = make();
  const fired = [];
  s.on('fire', (i) => fired.push(i));
  s.addTimer({ durationMs: 60000, label: 'tea' });
  clock.t += 59000;
  s.tick();
  assert.equal(fired.length, 0);
  clock.t += 1000;
  s.tick();
  s.tick();
  assert.equal(fired.length, 1);
  assert.equal(fired[0].label, 'tea');
  assert.equal(s.list().length, 0);
});

test('one-off alarm fires then turns itself off', () => {
  const { s, clock } = make();
  const fired = [];
  s.on('fire', (i) => fired.push(i));
  s.addAlarm({ time: '15:05' });
  clock.t = at(19, 15, 5);
  s.tick();
  assert.equal(fired.length, 1);
  const [alarm] = s.list();
  assert.equal(alarm.enabled, false);
  assert.equal(alarm.fireAt, null);
});

test('repeating alarm reschedules to the next matching day', () => {
  const { s, clock } = make();
  s.addAlarm({ time: '15:05', days: [1] });
  clock.t = at(19, 15, 5);
  s.tick();
  const [alarm] = s.list();
  assert.equal(alarm.enabled, true);
  assert.equal(alarm.fireAt, at(26, 15, 5));
});

test('an alarm that is more than 10 minutes late is reported as missed, not fired', () => {
  const { s, clock } = make();
  const events = [];
  s.on('fire', () => events.push('fire'));
  s.on('missed', () => events.push('missed'));
  s.addAlarm({ time: '15:05' });
  clock.t = BASE + 30 * 60000;
  s.tick();
  assert.deepEqual(events, ['missed']);
});

test('validation rejects bad input', () => {
  const { s } = make();
  assert.throws(() => s.addAlarm({ time: '25:00' }));
  assert.throws(() => s.addAlarm({ time: '7:30' }));
  assert.throws(() => s.addTimer({ durationMs: 10 }));
  assert.throws(() => s.addTimer({ durationMs: 1e12 }));
  assert.throws(() => s.addTimer({ durationMs: 'soon' }));
});

test('setEnabled turns an alarm off and back on', () => {
  const { s } = make();
  const a = s.addAlarm({ time: '16:00' });
  assert.ok(s.setEnabled(a.id, false));
  assert.equal(s.list()[0].fireAt, null);
  assert.ok(s.setEnabled(a.id, true));
  assert.equal(s.list()[0].fireAt, at(19, 16, 0));
  assert.equal(s.setEnabled('nope', true), false);
});

test('snooze creates a short labelled timer', () => {
  const { s, clock } = make();
  const t = s.snooze({ label: 'Wake up', minutes: 5 });
  assert.equal(t.kind, 'timer');
  assert.equal(t.snoozed, true);
  assert.equal(t.fireAt, clock.t + 300000);
});

test('items survive a restart and garbage in storage is ignored', () => {
  const first = make();
  first.s.addAlarm({ time: '16:00', days: [1, 3], label: 'Gym' });
  first.s.addTimer({ durationMs: 120000 });
  const saved = JSON.parse(JSON.stringify(first.s.serialize()));
  const { s } = make([...saved, null, 5, { kind: 'alarm', time: 'bad' }, { kind: 'timer' }]);
  assert.deepEqual(s.list().map((i) => i.kind), ['timer', 'alarm']);
  assert.equal(s.list()[1].label, 'Gym');
});

test('list puts timers first, then enabled alarms by time, then disabled ones', () => {
  const { s } = make();
  const late = s.addAlarm({ time: '22:00' });
  s.addAlarm({ time: '16:00' });
  const off = s.addAlarm({ time: '15:30' });
  s.setEnabled(off.id, false);
  s.addTimer({ durationMs: 600000 });
  const order = s.list().map((i) => (i.kind === 'timer' ? 'timer' : `${i.time}${i.enabled ? '' : '-off'}`));
  assert.deepEqual(order, ['timer', '16:00', '22:00', '15:30-off']);
  assert.ok(late);
});
