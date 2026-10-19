'use strict';

const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');

class FullscreenWatcher extends EventEmitter {
  constructor({ workDir, scriptSource }) {
    super();
    this.workDir = workDir;
    this.scriptSource = scriptSource;
    this.scriptFile = null;
    this.child = null;
    this.stopped = true;
    this.isFullscreen = false;
  }

  start() {
    if (process.platform !== 'win32') return false;
    this.stopped = false;
    try {
      fs.mkdirSync(this.workDir, { recursive: true });
      this.scriptFile = path.join(this.workDir, 'island-fullscreen.ps1');
      fs.writeFileSync(this.scriptFile, `﻿${this.scriptSource}`, 'utf8');
    } catch (err) {
      console.warn('[fullscreen] could not write helper script:', err.message);
      return false;
    }
    this._spawn();
    return true;
  }

  _spawn() {
    if (this.stopped) return;
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', this.scriptFile],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    this.child = child;

    let buffer = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop();
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === 'FULLSCREEN:1') {
          this.isFullscreen = true;
          this.emit('change', true);
        } else if (trimmed === 'FULLSCREEN:0') {
          this.isFullscreen = false;
          this.emit('change', false);
        }
      }
    });

    child.stderr.on('data', () => {});
    child.on('error', (err) => console.warn('[fullscreen] watcher error:', err.message));
    child.on('exit', () => {
      if (this.child === child) this.child = null;
      if (!this.stopped) {
        setTimeout(() => this._spawn(), 4000);
      }
    });
  }

  stop() {
    this.stopped = true;
    if (this.child) {
      this.child.kill();
      this.child = null;
    }
  }
}

module.exports = { FullscreenWatcher };
