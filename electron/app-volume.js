'use strict';

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

function normalizeVolumePercent(level) {
  const num = Number(level);
  if (!Number.isFinite(num)) return null;
  return Math.max(0, Math.min(100, Math.round(num)));
}

function toNormalizedRatio(percent) {
  const clamped = normalizeVolumePercent(percent);
  if (clamped === null) return null;
  return Math.max(0, Math.min(1, Number((clamped / 100).toFixed(4))));
}

/**
 * AppVolumeController
 *
 * Controls source-specific / per-application volume without modifying Windows Master Volume:
 * 1. When YouTube Music Companion is connected and active, routes ONLY through the companion
 *    bridge using normalized 0.0–1.0 player volume (never simultaneously mutating Chrome's WASAPI session).
 * 2. Otherwise, falls back to per-application Windows WASAPI ISimpleAudioVolume (app-volume.ps1).
 */
class AppVolumeController {
  constructor({ workDir, scriptSource } = {}) {
    this.scriptPath = workDir
      ? path.join(workDir, 'app-volume.ps1')
      : path.join(__dirname, 'ps', 'app-volume.ps1');

    if (workDir && scriptSource) {
      try {
        fs.mkdirSync(workDir, { recursive: true });
        fs.writeFileSync(this.scriptPath, scriptSource, 'utf8');
      } catch {}
    }

    this._inFlight = false;
    this._pendingSet = null;
    this._lastKnownGoodVolume = 75;
    this._muted = false;
  }

  _execPs(args) {
    return new Promise((resolve) => {
      execFile(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', this.scriptPath, ...args],
        { timeout: 3500, windowsHide: true },
        (err, stdout) => {
          if (err || !stdout) {
            resolve({ ok: false, supported: false, error: err?.message || 'PowerShell execution failed' });
            return;
          }
          try {
            const parsed = JSON.parse(String(stdout).trim());
            resolve(parsed);
          } catch {
            resolve({ ok: false, supported: false, error: 'Invalid JSON from app-volume script' });
          }
        },
      );
    });
  }

  _isCompanionActive(companionBridge) {
    if (!companionBridge || typeof companionBridge.isConnected !== 'function') return false;
    if (!companionBridge.isConnected()) return false;
    const status = companionBridge.getStatus?.();
    return Boolean(status?.isYtMusicActive);
  }

  async getVolume(appHint = '', companionBridge = null) {
    if (this._isCompanionActive(companionBridge)) {
      return {
        ok: true,
        supported: true,
        volume: this._lastKnownGoodVolume,
        muted: this._muted,
        source: 'youtube_music_companion',
      };
    }
    const args = ['-Action', 'get'];
    if (appHint) args.push('-AppHint', String(appHint));
    const res = await this._execPs(args);
    if (res?.ok && res?.supported && Number.isFinite(res.volume)) {
      if (res.volume > 0) this._lastKnownGoodVolume = res.volume;
      this._muted = Boolean(res.muted);
    }
    return res;
  }

  async setVolume(appHint = '', level = 75, companionBridge = null) {
    const clamped = normalizeVolumePercent(level);
    if (clamped === null) {
      return { ok: false, supported: false, reason: 'Invalid volume level' };
    }

    // 1. Exclusive YouTube Music Companion routing when YTM tab is active (0.0 - 1.0)
    if (this._isCompanionActive(companionBridge)) {
      const ratio = toNormalizedRatio(clamped);
      try {
        const res = await companionBridge.dispatchCommand({
          action: 'set_volume',
          volume: ratio,
          level: clamped,
        });
        if (res?.ok) {
          if (clamped > 0) this._lastKnownGoodVolume = clamped;
          this._muted = clamped === 0;
          return {
            ok: true,
            supported: true,
            volume: clamped,
            muted: this._muted,
            source: 'youtube_music_companion',
          };
        }
        return {
          ok: false,
          supported: false,
          reason: res?.error || res?.message || 'YouTube Music companion did not confirm volume change',
          source: 'youtube_music_companion',
        };
      } catch (err) {
        return {
          ok: false,
          supported: false,
          reason: err?.message || 'YouTube Music companion error',
          source: 'youtube_music_companion',
        };
      }
    }

    // 2. Per-app Windows WASAPI fallback (coalesced so rapid slider drags never queue PowerShell)
    if (this._inFlight) {
      this._pendingSet = { appHint, clamped };
      return { ok: true, coalesced: true, volume: clamped };
    }

    this._inFlight = true;
    let result;
    try {
      const args = ['-Action', 'set', '-Volume', String(clamped)];
      if (appHint) args.push('-AppHint', String(appHint));
      result = await this._execPs(args);
    } finally {
      this._inFlight = false;
    }

    if (this._pendingSet) {
      const next = this._pendingSet;
      this._pendingSet = null;
      return this.setVolume(next.appHint, next.clamped, companionBridge);
    }

    if (result?.ok && result?.supported) {
      if (clamped > 0) this._lastKnownGoodVolume = clamped;
      this._muted = Boolean(result.muted);
    }
    return result;
  }

  async setMute(appHint = '', muted = false, companionBridge = null) {
    const nextMuted = Boolean(muted);

    if (this._isCompanionActive(companionBridge)) {
      const restoreVol = this._lastKnownGoodVolume > 0 ? this._lastKnownGoodVolume : 75;
      const targetVol = nextMuted ? 0 : restoreVol;
      const ratio = toNormalizedRatio(targetVol);
      try {
        const res = await companionBridge.dispatchCommand({
          action: 'set_volume',
          volume: ratio,
          level: targetVol,
        });
        if (res?.ok) {
          this._muted = nextMuted;
          return {
            ok: true,
            supported: true,
            volume: restoreVol,
            muted: nextMuted,
            source: 'youtube_music_companion',
          };
        }
        return {
          ok: false,
          supported: false,
          reason: res?.error || res?.message || 'Mute toggle failed',
          source: 'youtube_music_companion',
        };
      } catch (err) {
        return {
          ok: false,
          supported: false,
          reason: err?.message || 'Mute toggle failed',
          source: 'youtube_music_companion',
        };
      }
    }

    const args = ['-Action', 'mute', '-Muted', nextMuted ? 'true' : 'false'];
    if (appHint) args.push('-AppHint', String(appHint));
    const res = await this._execPs(args);
    if (res?.ok && res?.supported) {
      this._muted = Boolean(res.muted);
    }
    return res;
  }
}

module.exports = { AppVolumeController, normalizeVolumePercent, toNormalizedRatio };
