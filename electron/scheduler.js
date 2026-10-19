'use strict';
// Alarm + timer scheduler. Pure Node (no Electron), so it can be unit-tested.
// Items are stored with an absolute `fireAt` timestamp, so they survive restarts and sleep.

const { EventEmitter } = require('events');
const crypto = require('crypto');

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_TIMER_MS = 99 * 60 * 60 * 1000;
const MISSED_AFTER_MS = 10 * 60 * 1000; // fired more than 10 min late -> "missed", no ringing
const MAX_ITEMS = 50;

const newId = () => crypto.randomUUID();
const clone = (item) => JSON.parse(JSON.stringify(item));

function cleanLabel(value) {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 40) : '';
}

function cleanDays(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b);
}

// Next time strictly after `fromMs` that matches HH:MM on one of `days` (0 = Sunday).
// An empty `days` means "the next time that clock time comes around".
function nextOccurrence(time, days, fromMs) {
  const [h, m] = time.split(':').map(Number);
  const from = new Date(fromMs);
  for (let i = 0; i < 8; i++) {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i, h, m, 0, 0);
    if (d.getTime() <= fromMs) continue;
    if (days.length === 0 || days.includes(d.getDay())) return d.getTime();
  }
  return null;
}

class Scheduler extends EventEmitter {
  constructor({ now = Date.now, items = [], tickMs = 1000, autoStart = true } = {}) {
    super();
    this.now = now;
    this.tickMs = tickMs;
    this.items = [];
    this._interval = null;
    for (const raw of Array.isArray(items) ? items : []) {
      const item = this._sanitize(raw);
      if (item) this.items.push(item);
    }
    if (autoStart) this.start();
  }

  _sanitize(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const id = typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 64) : newId();
    const label = cleanLabel(raw.label);
    const createdAt = Number.isFinite(raw.createdAt) ? raw.createdAt : this.now();

    if (raw.kind === 'alarm') {
      if (typeof raw.time !== 'string' || !TIME_RE.test(raw.time)) return null;
      const days = cleanDays(raw.days);
      const enabled = raw.enabled !== false;
      let fireAt = Number.isFinite(raw.fireAt) ? raw.fireAt : null;
      if (enabled && fireAt === null) fireAt = nextOccurrence(raw.time, days, this.now());
      return { id, kind: 'alarm', time: raw.time, days, label, enabled, fireAt: enabled ? fireAt : null, createdAt };
    }

    if (raw.kind === 'timer') {
      if (!Number.isFinite(raw.fireAt) || !Number.isFinite(raw.durationMs) || raw.durationMs <= 0) return null;
      const durationMs = Math.min(MAX_TIMER_MS, Math.round(raw.durationMs));
      const startedAt = Number.isFinite(raw.startedAt) ? raw.startedAt : raw.fireAt - durationMs;
      return { id, kind: 'timer', label, durationMs, startedAt, fireAt: raw.fireAt, enabled: true, createdAt, snoozed: raw.snoozed === true };
    }
    return null;
  }

  addAlarm({ time, days = [], label = '' } = {}) {
    if (typeof time !== 'string' || !TIME_RE.test(time)) throw new Error('Alarm time must look like 07:30');
    this._assertRoom();
    const item = {
      id: newId(),
      kind: 'alarm',
      time,
      days: cleanDays(days),
      label: cleanLabel(label),
      enabled: true,
      fireAt: null,
      createdAt: this.now(),
    };
    item.fireAt = nextOccurrence(item.time, item.days, this.now());
    this.items.push(item);
    this._changed();
    return clone(item);
  }

  addTimer({ durationMs, label = '', snoozed = false } = {}) {
    if (!Number.isFinite(durationMs) || durationMs < 1000 || durationMs > MAX_TIMER_MS) {
      throw new Error('Timer must be between 1 second and 99 hours');
    }
    this._assertRoom();
    const startedAt = this.now();
    const ms = Math.round(durationMs);
    const item = {
      id: newId(),
      kind: 'timer',
      label: cleanLabel(label),
      durationMs: ms,
      startedAt,
      fireAt: startedAt + ms,
      enabled: true,
      createdAt: startedAt,
      snoozed: snoozed === true,
    };
    this.items.push(item);
    this._changed();
    return clone(item);
  }

  // Snoozing is just a short timer that carries the alarm's label.
  snooze({ label = '', minutes = 5 } = {}) {
    const mins = Math.min(60, Math.max(1, Number(minutes) || 5));
    return this.addTimer({ durationMs: mins * 60000, label: label || 'Alarm', snoozed: true });
  }

  remove(id) {
    const index = this.items.findIndex((item) => item.id === id);
    if (index < 0) return false;
    this.items.splice(index, 1);
    this._changed();
    return true;
  }

  setEnabled(id, enabled) {
    const item = this.items.find((entry) => entry.id === id && entry.kind === 'alarm');
    if (!item) return false;
    item.enabled = Boolean(enabled);
    item.fireAt = item.enabled ? nextOccurrence(item.time, item.days, this.now()) : null;
    this._changed();
    return true;
  }

  list() {
    const rank = (item) => (item.kind === 'timer' ? 0 : item.enabled ? 1 : 2);
    return this.items
      .map(clone)
      .sort((a, b) => rank(a) - rank(b) || (a.fireAt ?? Infinity) - (b.fireAt ?? Infinity) || a.time?.localeCompare(b.time ?? '') || 0);
  }

  serialize() {
    return this.items.map(clone);
  }

  tick() {
    const now = this.now();
    let changed = false;
    for (const item of [...this.items]) {
      if (!item.enabled || item.fireAt === null || now < item.fireAt) continue;
      const missed = now - item.fireAt > MISSED_AFTER_MS;
      const snapshot = clone(item);
      if (item.kind === 'timer') {
        this.items.splice(this.items.indexOf(item), 1);
      } else if (item.days.length > 0) {
        item.fireAt = nextOccurrence(item.time, item.days, now);
      } else {
        item.enabled = false;
        item.fireAt = null;
      }
      changed = true;
      this.emit(missed ? 'missed' : 'fire', snapshot);
    }
    if (changed) this._changed();
  }

  start() {
    if (this._interval) return;
    this._interval = setInterval(() => this.tick(), this.tickMs);
    if (this._interval.unref) this._interval.unref();
  }

  stop() {
    clearInterval(this._interval);
    this._interval = null;
  }

  _assertRoom() {
    if (this.items.length >= MAX_ITEMS) throw new Error('Too many alarms and timers. Remove one first.');
  }

  _changed() {
    this.emit('change', this.list());
  }
}

module.exports = { Scheduler, nextOccurrence, TIME_RE, MISSED_AFTER_MS, MAX_TIMER_MS };
