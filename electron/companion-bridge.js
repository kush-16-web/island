'use strict';
/**
 * companion-bridge.js: Lightweight, secure loopback bridge for Island Browser Companion.
 *
 * Responsibilities:
 * 1. Track companion connection health (pings, active YouTube Music tabs).
 * 2. Manage bidirectional command/ack lifecycle (dispatching play_track, resume, pause).
 * 3. Track explicit playback states:
 *    - resolving
 *    - opening_provider
 *    - waiting_for_player
 *    - playback_requested
 *    - confirmed_playing
 *    - autoplay_blocked
 *    - failed
 * 4. Safe fallback when companion is disconnected or browser is closed.
 * 5. Low-power, event-driven design without aggressive polling.
 */

const { EventEmitter } = require('events');

const PING_EXPIRY_MS = 8000; // Companion considered disconnected if no ping for 8s
const COMMAND_TIMEOUT_MS = 12000; // Command expires if not acked in 12s

class CompanionBridge extends EventEmitter {
  constructor({ pingExpiryMs = PING_EXPIRY_MS, commandTimeoutMs = COMMAND_TIMEOUT_MS } = {}) {
    super();
    this.pingExpiryMs = pingExpiryMs;
    this.commandTimeoutMs = commandTimeoutMs;

    this.lastPingTimestamp = 0;
    this.companionInfo = {
      connected: false,
      isYtMusicActive: false,
      tabUrl: null,
      currentTrack: null,
      playbackState: 'idle',
      lastSeenMs: Infinity,
    };

    this.pendingCommands = [];
    this.inFlightCommands = new Map();
    this.commandCounter = 0;
  }

  /**
   * Determine if the companion extension is currently connected and active.
   */
  isConnected() {
    if (!this.lastPingTimestamp) return false;
    return Date.now() - this.lastPingTimestamp <= this.pingExpiryMs;
  }

  /**
   * Get the current snapshot of companion connection and playback status.
   */
  getStatus() {
    const now = Date.now();
    const connected = this.isConnected();
    const lastSeenMs = this.lastPingTimestamp ? now - this.lastPingTimestamp : Infinity;

    return {
      connected,
      isYtMusicActive: connected && Boolean(this.companionInfo.isYtMusicActive),
      tabUrl: connected ? this.companionInfo.tabUrl : null,
      currentTrack: connected ? this.companionInfo.currentTrack : null,
      playbackState: connected ? this.companionInfo.playbackState : 'disconnected',
      lastSeenMs,
    };
  }

  /**
   * Handle incoming heartbeat ping from browser companion.
   */
  handlePing(payload = {}) {
    const now = Date.now();
    this.lastPingTimestamp = now;

    const prevConnected = this.companionInfo.connected;
    const isYtMusicActive = Boolean(payload.isYtMusic);

    this.companionInfo = {
      connected: true,
      isYtMusicActive,
      tabUrl: typeof payload.url === 'string' ? payload.url : this.companionInfo.tabUrl,
      currentTrack: payload.currentTrack || this.companionInfo.currentTrack,
      playbackState: payload.status || this.companionInfo.playbackState || 'idle',
      lastSeenMs: 0,
    };

    if (!prevConnected) {
      this.emit('connection-change', { connected: true, info: this.getStatus() });
    }

    this.emit('ping', this.getStatus());
    return { ok: true, status: this.getStatus() };
  }

  /**
   * Handle real-time DOM playback state events from YouTube Music.
   * e.g. { event: 'playing', videoId: '...', title: '...', artist: '...', currentTime: 1.2 }
   */
  handleStateUpdate(payload = {}) {
    this.lastPingTimestamp = Date.now();
    const event = payload.event || payload.status || 'unknown';

    if (payload.videoId || payload.title) {
      this.companionInfo.currentTrack = {
        videoId: payload.videoId || null,
        title: payload.title || '',
        artist: payload.artist || '',
        duration: Number(payload.duration) || 0,
      };
    }

    if (event === 'playing') {
      this.companionInfo.playbackState = 'confirmed_playing';
    } else if (event === 'paused') {
      this.companionInfo.playbackState = 'paused';
    } else if (event === 'autoplay_blocked') {
      this.companionInfo.playbackState = 'autoplay_blocked';
    } else if (event === 'ended') {
      this.companionInfo.playbackState = 'ended';
    }

    this.emit('state-update', {
      event,
      track: this.companionInfo.currentTrack,
      playbackState: this.companionInfo.playbackState,
      currentTime: payload.currentTime,
      raw: payload,
    });

    return { ok: true };
  }

  /**
   * Dispatch a playback command to the companion.
   * Returns a promise that resolves when the companion acknowledges execution.
   */
  dispatchCommand({ action = 'play_track', videoId = null, title = '', artist = '', url = null, timeoutMs = null } = {}) {
    const id = `cmd_${Date.now()}_${++this.commandCounter}`;
    const command = {
      id,
      action,
      videoId,
      title,
      artist,
      url,
      timestamp: Date.now(),
    };

    const effectiveTimeout = timeoutMs || this.commandTimeoutMs;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.inFlightCommands.delete(id);
        // Remove from pending if still queued
        this.pendingCommands = this.pendingCommands.filter((c) => c.id !== id);
        const err = new Error(`Command "${action}" timed out after ${effectiveTimeout}ms`);
        err.code = 'COMMAND_TIMEOUT';
        err.commandId = id;
        reject(err);
      }, effectiveTimeout);

      this.inFlightCommands.set(id, { command, resolve, reject, timer });
      this.pendingCommands.push(command);

      this.emit('command-queued', command);
    });
  }

  /**
   * Fetch and consume the next pending command for the companion extension.
   */
  pullNextCommand() {
    if (this.pendingCommands.length === 0) {
      return null;
    }
    const cmd = this.pendingCommands.shift();
    return cmd;
  }

  /**
   * Handle command acknowledgment from the companion extension.
   */
  handleAck(ack = {}) {
    const { commandId, status, error } = ack;
    if (!commandId || !this.inFlightCommands.has(commandId)) {
      return { ok: false, error: 'Unknown or expired commandId' };
    }

    const { command, resolve, reject, timer } = this.inFlightCommands.get(commandId);
    clearTimeout(timer);
    this.inFlightCommands.delete(commandId);

    if (status === 'playing' || status === 'confirmed_playing') {
      this.companionInfo.playbackState = 'confirmed_playing';
      resolve({ ok: true, status: 'confirmed_playing', command, ack });
    } else if (status === 'autoplay_blocked') {
      this.companionInfo.playbackState = 'autoplay_blocked';
      resolve({ ok: true, status: 'autoplay_blocked', command, ack });
    } else if (status === 'navigated') {
      this.companionInfo.playbackState = 'waiting_for_player';
      resolve({ ok: true, status: 'navigated', command, ack });
    } else if (status === 'failed') {
      this.companionInfo.playbackState = 'failed';
      const err = new Error(error || 'Companion failed to execute command');
      err.code = 'COMMAND_FAILED';
      err.command = command;
      reject(err);
    } else {
      resolve({ ok: true, status: status || 'ok', command, ack });
    }

    this.emit('command-acked', { commandId, status, ack });
    return { ok: true };
  }

  /**
   * Reset bridge state (for tests and teardown).
   */
  reset() {
    for (const { timer, reject } of this.inFlightCommands.values()) {
      clearTimeout(timer);
      reject(new Error('Bridge reset'));
    }
    this.inFlightCommands.clear();
    this.pendingCommands = [];
    this.lastPingTimestamp = 0;
    this.companionInfo = {
      connected: false,
      isYtMusicActive: false,
      tabUrl: null,
      currentTrack: null,
      playbackState: 'idle',
      lastSeenMs: Infinity,
    };
  }
}

module.exports = {
  CompanionBridge,
  PING_EXPIRY_MS,
  COMMAND_TIMEOUT_MS,
};
