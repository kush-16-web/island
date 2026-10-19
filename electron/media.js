'use strict';
// Watches the Windows media session (Spotify, browsers, Media Player...) via a PowerShell helper.
// Emits 'state' with { active, title, artist, album, app, status, positionMs, durationMs, art, reportedAt }.

const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { createLineSplitter, parseMediaLine, toMediaState, validArt } = require('./media-parse');

const ACTIONS = new Set(['playpause', 'next', 'previous']);
const RESTART_DELAY_MS = 5000;

class MediaWatcher extends EventEmitter {
  constructor({ workDir, scriptSource }) {
    super();
    this.workDir = workDir;
    this.scriptSource = scriptSource;
    this.scriptFile = null;
    this.child = null;
    this.stopped = true;
    this.restartTimer = null;
    this.art = null; // { key, data }
    this.artCache = new Map();
    this.pendingLookups = new Set();
    this.lastRaw = null;
  }

  start() {
    if (process.platform !== 'win32') return false;
    this.stopped = false;
    try {
      fs.mkdirSync(this.workDir, { recursive: true });
      this.scriptFile = path.join(this.workDir, 'island-smtc.ps1');
      // BOM so Windows PowerShell 5.1 reads the file as UTF-8.
      fs.writeFileSync(this.scriptFile, `﻿${this.scriptSource}`, 'utf8');
    } catch (err) {
      console.warn('[media] could not write helper script:', err.message);
      return false;
    }
    this._spawn();
    return true;
  }

  _spawn() {
    if (this.stopped) return;
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', this.scriptFile, '-Mode', 'watch'],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    this.child = child;

    const splitter = createLineSplitter();
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      for (const line of splitter.push(chunk)) this._onLine(line);
    });
    child.stderr.on('data', (chunk) => console.warn('[media]', String(chunk).trim()));
    child.on('error', (err) => console.warn('[media] could not start PowerShell:', err.message));
    child.on('exit', () => {
      if (this.child === child) this.child = null;
      if (this.stopped) return;
      this.emit('state', { active: false });
      this.restartTimer = setTimeout(() => this._spawn(), RESTART_DELAY_MS);
    });
  }

  _onLine(line) {
    const raw = parseMediaLine(line);
    if (!raw) return;
    this.lastRaw = raw;
    if (raw.ok === true && raw.key) {
      const art = validArt(raw.art);
      if (art) this.art = { key: raw.key, data: art };
    }
    const currentArt = raw.ok === true && this.art && this.art.key === raw.key ? this.art.data : null;
    this.emit('state', toMediaState(raw, Date.now(), currentArt));

    if (raw.ok === true && raw.key && !currentArt && raw.title) {
      this._resolveOnlineArt(raw.key, raw.title, raw.artist);
    }
  }

  _resolveOnlineArt(key, title, artist) {
    const cleanTitle = (title || '')
      .replace(/[\(\[\{].*?(official|video|audio|lyrics|remaster|hd|4k|mv|visualizer).*?[\)\]\}]/gi, ' ')
      .replace(/\b(feat|ft)\.?\s+[^\-]+/gi, ' ')
      .replace(/[()[\]{}\-–—]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const query = `${cleanTitle} ${artist || ''}`.replace(/[()[\]{}\-–—]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!query) return;
    if (this.artCache.has(key)) {
      const cached = this.artCache.get(key);
      if (cached && (!this.art || this.art.key !== key)) {
        this.art = { key, data: cached };
        if (this.lastRaw && this.lastRaw.key === key) {
          this.emit('state', toMediaState(this.lastRaw, Date.now(), cached));
        }
      }
      return;
    }
    if (this.pendingLookups.has(key)) return;
    this.pendingLookups.add(key);

    const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&limit=1`;
    const req = https.get(itunesUrl, { headers: { 'User-Agent': 'Island/1.0' }, timeout: 4500 }, (res) => {
      if (res.statusCode !== 200) {
        this.pendingLookups.delete(key);
        res.resume();
        return;
      }
      let text = '';
      res.on('data', (c) => (text += c));
      res.on('end', () => {
        try {
          const json = JSON.parse(text);
          const item = json.results && json.results[0];
          const artUrl = item && (item.artworkUrl100 || item.artworkUrl60);
          if (!artUrl) {
            this.pendingLookups.delete(key);
            return;
          }
          const hiRes = artUrl.replace('100x100bb.jpg', '512x512bb.jpg');
          this._downloadArtAsBase64(hiRes, (base64Data) => {
            this.pendingLookups.delete(key);
            if (base64Data) {
              this.artCache.set(key, base64Data);
              if (!this.art || this.art.key !== key) {
                this.art = { key, data: base64Data };
                if (this.lastRaw && this.lastRaw.key === key) {
                  this.emit('state', toMediaState(this.lastRaw, Date.now(), base64Data));
                }
              }
            }
          });
        } catch {
          this.pendingLookups.delete(key);
        }
      });
    });
    req.on('error', () => this.pendingLookups.delete(key));
    req.on('timeout', () => {
      req.destroy();
      this.pendingLookups.delete(key);
    });
  }

  _downloadArtAsBase64(url, cb) {
    const req = https.get(url, { timeout: 5000 }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return cb(null);
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        const mime = res.headers['content-type'] || 'image/jpeg';
        cb(`data:${mime};base64,${buf.toString('base64')}`);
      });
    });
    req.on('error', () => cb(null));
    req.on('timeout', () => {
      req.destroy();
      cb(null);
    });
  }

  control(action) {
    if (process.platform !== 'win32' || !ACTIONS.has(action) || !this.scriptFile) return;
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', this.scriptFile, '-Mode', 'control', '-Action', action],
      { windowsHide: true, stdio: 'ignore' },
    );
    child.on('error', () => {});
    child.unref();
  }

  seek(positionSec) {
    if (process.platform !== 'win32' || !this.scriptFile) return;
    const sec = Math.max(0, Number(positionSec) || 0);
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', this.scriptFile, '-Mode', 'control', '-Action', 'seek', '-Position', String(sec)],
      { windowsHide: true, stdio: 'ignore' },
    );
    child.on('error', () => {});
    child.unref();
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.restartTimer);
    if (this.child) this.child.kill();
    this.child = null;
  }
}

module.exports = { MediaWatcher };
