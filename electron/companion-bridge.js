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
    this.lastDispatchedCommand = null;
    this.lastAck = null;
    this.lastError = null;

    // Authoritative volume state coordinator (Phase 2 - Task 3)
    this.volumeState = {
      isDucked: false,
      confirmedDucked: false,
      pendingRestore: false,
      currentMultiplier: 1.0,
      originalVolume: null,
      uncertain: false,
      inFlightVolumeId: null,
      activeSpeechSession: null,
    };
  }

  /**
   * Determine if the companion extension is currently connected and active.
   */
  isConnected() {
    if (!this.lastPingTimestamp) return false;
    const connected = Date.now() - this.lastPingTimestamp <= this.pingExpiryMs;
    if (!connected && (this.volumeState.isDucked || this.volumeState.confirmedDucked)) {
      this.volumeState.uncertain = true;
    }
    return connected;
  }

  /**
   * Return comprehensive diagnostics to distinguish extension state:
   * 'connected', 'service_worker_active', 'disconnected', 'playback_failed', 'autoplay_blocked'
   */
  getDiagnostics() {
    const now = Date.now();
    const isConnected = this.isConnected();
    const lastSeenMs = this.lastPingTimestamp ? now - this.lastPingTimestamp : Infinity;

    let connectionState = 'disconnected';
    let detail = 'Extension not detected or heartbeat timed out';

    if (isConnected) {
      if (this.companionInfo.isYtMusicActive) {
        connectionState = 'connected';
        detail = `Connected to YouTube Music (${this.companionInfo.tabsCount || 1} tab(s))`;
      } else {
        connectionState = 'service_worker_active';
        detail = 'Extension service worker active, but no YouTube Music tab is open';
      }
    } else if (this.lastPingTimestamp > 0) {
      connectionState = 'disconnected';
      detail = `Lost companion connection ${Math.round(lastSeenMs / 1000)}s ago`;
    }

    return {
      connectionState,
      detail,
      connected: isConnected,
      isYtMusicActive: Boolean(this.companionInfo.isYtMusicActive),
      tabsCount: this.companionInfo.tabsCount || (this.companionInfo.isYtMusicActive ? 1 : 0),
      playbackState: isConnected ? this.companionInfo.playbackState : 'disconnected',
      lastSeenMs,
      pendingCommandsCount: this.pendingCommands.length,
      inFlightCommandsCount: this.inFlightCommands.size,
      lastCommand: this.lastDispatchedCommand,
      lastAck: this.lastAck,
      lastError: this.lastError,
      currentTrack: this.companionInfo.currentTrack,
      volumeState: { ...this.volumeState },
    };
  }

  /**
   * Get the current snapshot of companion connection and playback status.
   */
  getStatus() {
    const diag = this.getDiagnostics();

    return {
      connected: diag.connected,
      connectionState: diag.connectionState,
      connectionDetail: diag.detail,
      isYtMusicActive: diag.isYtMusicActive,
      tabsCount: diag.tabsCount,
      tabUrl: diag.connected ? this.companionInfo.tabUrl : null,
      currentTrack: diag.connected ? this.companionInfo.currentTrack : null,
      playbackState: diag.playbackState,
      lastSeenMs: diag.lastSeenMs,
    };
  }

  /**
   * Handle incoming heartbeat ping from browser companion service worker.
   */
  handlePing(payload = {}) {
    const now = Date.now();
    const prevConnected = this.isConnected();
    this.lastPingTimestamp = now;

    const isYtMusicActive = Boolean(payload.isYtMusic);

    this.companionInfo = {
      connected: true,
      isYtMusicActive,
      tabsCount: Number(payload.tabsCount) || (isYtMusicActive ? 1 : 0),
      tabUrl: typeof payload.url === 'string' ? payload.url : this.companionInfo.tabUrl,
      currentTrack: payload.currentTrack || this.companionInfo.currentTrack,
      playbackState: payload.status || this.companionInfo.playbackState || 'idle',
      source: payload.source || 'service_worker',
      version: payload.version || '1.2.0',
      lastSeenMs: 0,
    };

    if (!prevConnected) {
      if (this.volumeState.uncertain) {
        this.volumeState.uncertain = false;
        this.dispatchCommand({ action: 'restore_volume' }).catch(() => {});
      }
      this.emit('connection-change', { connected: true, info: this.getStatus() });
    }

    this.emit('ping', this.getStatus());
    return { ok: true, status: this.getStatus(), diagnostics: this.getDiagnostics() };
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
  dispatchCommand({ action = 'play_track', videoId = null, title = '', artist = '', url = null, level = null, volume = null, timeoutMs = null } = {}) {
    const now = Date.now();
    const isVolumeCmd = action === 'duck' || action === 'restore_volume' || action === 'set_volume';

    // 0. Best-effort volume commands: fail-fast immediately if companion is not connected or no YTM tab is active
    if (isVolumeCmd && (!this.isConnected() || !this.companionInfo.isYtMusicActive)) {
      if (action === 'restore_volume') {
        this.volumeState.isDucked = false;
        this.volumeState.confirmedDucked = false;
        this.volumeState.pendingRestore = false;
      }
      return Promise.resolve({
        ok: false,
        status: 'no_player',
        action,
        message: 'No active YouTube Music tab to control volume',
      });
    }

    // Deduplicate redundant restore_volume requests:
    // If volume is already completely idle/restored and not in flight, resolve immediately
    if (action === 'restore_volume') {
      if (!this.volumeState.isDucked && !this.volumeState.confirmedDucked && !this.volumeState.pendingRestore && !this.volumeState.inFlightVolumeId) {
        return Promise.resolve({
          ok: true,
          status: 'already_restored',
          action: 'restore_volume',
          message: 'Volume is already restored',
        });
      }

      // If an existing restore_volume is already in flight, return its promise
      for (const inFlight of this.inFlightCommands.values()) {
        if (inFlight.command.action === 'restore_volume') {
          return inFlight.promise;
        }
      }
    }

    // 1. Deduplication: Check if identical command was dispatched in the last 1000ms
    for (const inFlight of this.inFlightCommands.values()) {
      const c = inFlight.command;
      if (c.action === action && c.videoId === videoId && c.title === title && now - c.timestamp < 1000) {
        return inFlight.promise;
      }
    }

    // 2. Superseding: Any previous in-flight command for the same action is safely superseded
    for (const [inFlightId, inFlight] of this.inFlightCommands.entries()) {
      if (inFlight.command.action === action) {
        clearTimeout(inFlight.timer);
        this.inFlightCommands.delete(inFlightId);
        inFlight.resolve({
          ok: true,
          status: 'superseded',
          command: inFlight.command,
          message: `Command superseded by newer request for ${title || videoId || action}`,
        });
        this.emit('command-settled', {
          commandId: inFlightId,
          status: 'superseded',
          action,
        });
      }
    }

    // Clear stale pending queue for this action
    this.pendingCommands = this.pendingCommands.filter((c) => c.action !== action);

    const id = `cmd_${Date.now()}_${++this.commandCounter}`;
    const command = {
      id,
      action,
      videoId,
      title,
      artist,
      url,
      level,
      volume,
      timestamp: Date.now(),
    };

    if (action === 'duck') {
      this.volumeState.isDucked = true;
      this.volumeState.pendingRestore = false;
      this.volumeState.currentMultiplier = Number(level) || 0.10;
      this.volumeState.inFlightVolumeId = id;
    } else if (action === 'restore_volume') {
      this.volumeState.isDucked = false;
      this.volumeState.pendingRestore = true;
      this.volumeState.inFlightVolumeId = id;
    }

    const effectiveTimeout = timeoutMs || (isVolumeCmd ? 6000 : this.commandTimeoutMs);

    let inFlightEntry;
    const promise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!this.inFlightCommands.has(id)) return;
        this.inFlightCommands.delete(id);
        this.pendingCommands = this.pendingCommands.filter((c) => c.id !== id);

        this.lastError = `Command "${action}" timed out after ${effectiveTimeout}ms`;
        this.emit('command-settled', { commandId: id, status: 'timed_out', error: this.lastError });

        if (action === 'duck') {
          this.volumeState.inFlightVolumeId = null;
          // Failed or timed out ducking must not prevent Island from speaking or cause unhandled error
          resolve({ ok: false, status: 'timed_out', action, error: this.lastError });
          return;
        }

        if (action === 'restore_volume') {
          this.volumeState.inFlightVolumeId = null;
          this.volumeState.pendingRestore = false;
          resolve({ ok: false, status: 'timed_out', action, error: this.lastError });
          return;
        }

        const err = new Error(this.lastError);
        err.code = 'COMMAND_TIMEOUT';
        err.commandId = id;
        err.command = command;
        reject(err);
      }, effectiveTimeout);

      inFlightEntry = { command, resolve, reject, timer };
      this.inFlightCommands.set(id, inFlightEntry);
      this.pendingCommands.push(command);
      this.lastDispatchedCommand = command;

      this.emit('command-queued', command);
    });

    inFlightEntry.promise = promise;
    return promise;
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
    const { commandId, status, error, videoId } = ack;
    this.lastAck = ack;
    if (error) this.lastError = error;

    if (!commandId || !this.inFlightCommands.has(commandId)) {
      // Late ack from superseded or expired command
      return { ok: false, error: 'Unknown or expired commandId', status: 'ignored' };
    }

    const { command, resolve, reject, timer } = this.inFlightCommands.get(commandId);
    clearTimeout(timer);
    this.inFlightCommands.delete(commandId);

    let finalStatus = status;

    if (command.action === 'duck') {
      this.volumeState.confirmedDucked = true;
      this.volumeState.inFlightVolumeId = null;
      if (ack.originalVolume != null) {
        this.volumeState.originalVolume = ack.originalVolume;
      }
    } else if (command.action === 'restore_volume') {
      this.volumeState.confirmedDucked = false;
      this.volumeState.pendingRestore = false;
      this.volumeState.currentMultiplier = 1.0;
      this.volumeState.inFlightVolumeId = null;
    }

    if (status === 'playing' || status === 'confirmed_playing') {
      finalStatus = 'confirmed_playing';
      this.companionInfo.playbackState = 'confirmed_playing';
      if (videoId || command.videoId) {
        this.companionInfo.currentTrack = {
          videoId: videoId || command.videoId,
          title: ack.title || command.title,
          artist: ack.artist || command.artist,
        };
      }
      resolve({ ok: true, status: 'confirmed_playing', command, ack });
    } else if (status === 'autoplay_blocked') {
      finalStatus = 'autoplay_blocked';
      this.companionInfo.playbackState = 'autoplay_blocked';
      resolve({ ok: true, status: 'autoplay_blocked', command, ack });
    } else if (status === 'navigated' || status === 'navigation_completed_but_not_playing') {
      finalStatus = 'navigation_completed_but_not_playing';
      this.companionInfo.playbackState = 'waiting_for_player';
      resolve({ ok: true, status: 'navigated', command, ack });
    } else if (status === 'failed') {
      finalStatus = 'failed';
      this.companionInfo.playbackState = 'failed';
      if (command.action === 'duck' || command.action === 'restore_volume') {
        resolve({ ok: false, status: 'failed', command, ack, error: error || 'Volume command failed' });
      } else {
        const err = new Error(error || 'Companion failed to execute command');
        err.code = 'COMMAND_FAILED';
        err.command = command;
        err.commandId = commandId;
        reject(err);
      }
    } else {
      resolve({ ok: true, status: status || 'ok', command, ack });
    }

    this.emit('command-settled', { commandId, status: finalStatus, ack });
    this.emit('command-acked', { commandId, status: finalStatus, ack });
    return { ok: true, status: finalStatus };
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
    this.lastDispatchedCommand = null;
    this.lastAck = null;
    this.lastError = null;
    this.companionInfo = {
      connected: false,
      isYtMusicActive: false,
      tabsCount: 0,
      tabUrl: null,
      currentTrack: null,
      playbackState: 'idle',
      lastSeenMs: Infinity,
    };
    this.volumeState = {
      isDucked: false,
      confirmedDucked: false,
      pendingRestore: false,
      currentMultiplier: 1.0,
      originalVolume: null,
      uncertain: false,
      inFlightVolumeId: null,
      activeSpeechSession: null,
    };
  }
}

module.exports = {
  CompanionBridge,
  PING_EXPIRY_MS,
  COMMAND_TIMEOUT_MS,
};
