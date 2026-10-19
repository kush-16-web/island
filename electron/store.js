'use strict';
// Tiny JSON file store with debounced, atomic writes.

const fs = require('fs');
const path = require('path');

class Store {
  constructor(file, delayMs = 300) {
    this.file = file;
    this.delayMs = delayMs;
    this.data = {};
    this._timer = null;
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) this.data = parsed;
    } catch {
      // first run or unreadable file: start fresh
    }
  }

  get(key, fallback) {
    return key in this.data ? this.data[key] : fallback;
  }

  set(key, value) {
    this.data[key] = value;
    if (this._timer) return;
    this._timer = setTimeout(() => {
      this._timer = null;
      this.flush();
    }, this.delayMs);
    if (this._timer.unref) this._timer.unref();
  }

  flush() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.data), 'utf8');
      fs.renameSync(tmp, this.file);
    } catch (err) {
      console.warn('[store] could not save:', err.message);
    }
  }
}

module.exports = { Store };
