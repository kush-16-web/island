'use strict';
// The only bridge between the web UI and the OS side. Nothing here exposes Node or the filesystem.

const { contextBridge, ipcRenderer } = require('electron');

const CHANNELS = new Set([
  'notification',
  'ring',
  'media',
  'scheduler:state',
  'inbox:state',
  'hub:toggle',
  'hub:open',
  'window:blur',
  'window:pos-changed',
  'window:dock-changed',
  'pet:pos-changed',
  'fullscreen:change',
  'video:ambient-update',
  'voice:toggle',
  'voice:state',
  'system:accent-color',
  'companion:playback-state',
  'companion:status-changed',
  'groq:stream-token',
  'groq:stream-chunk',
]);

contextBridge.exposeInMainWorld('island', {
  getState: () => ipcRenderer.invoke('state:get'),

  // Sanitized window & UI lifecycle diagnostics
  logLifecycle: (event, extra) => ipcRenderer.send('window:log-lifecycle', { event, ...extra }),
  getCrashDiagnostics: () => ipcRenderer.invoke('diagnostics:get-crash-logs'),

  // Window behaviour: the window is click-through except over the island and pet.
  setIgnoreMouse: (ignore) => ipcRenderer.send('win:ignore-mouse', Boolean(ignore)),
  setFocusable: (focusable) => ipcRenderer.send('win:focusable', Boolean(focusable)),

  // Window position & 4-edge docking
  startWindowDrag: () => ipcRenderer.send('window:drag-start'),
  moveWindowDrag: () => ipcRenderer.send('window:drag-move'),
  moveWindowBy: (dx, dy) => ipcRenderer.send('window:move-by', { dx, dy }),
  endWindowDrag: () => ipcRenderer.send('window:drag-end'),
  setWindowPreset: (preset, edge) => ipcRenderer.send('window:set-preset', { preset, edge }),
  resetWindowPos: () => ipcRenderer.send('window:reset-pos'),
  getWindowPos: () => ipcRenderer.invoke('window:get-pos'),
  getWindowDock: () => ipcRenderer.invoke('window:get-dock'),
  setIslandExpanded: (expanded) => ipcRenderer.send('island:expand', Boolean(expanded)),

  // Standalone Desktop Pet Window
  movePetBy: (dx, dy) => ipcRenderer.send('pet:move-by', { dx, dy }),
  setPetPos: (x, y) => ipcRenderer.send('pet:set-pos', { x, y }),
  getPetPos: () => ipcRenderer.invoke('pet:get-pos'),
  resetPetPos: () => ipcRenderer.send('pet:reset-pos'),
  setPetVisible: (vis) => ipcRenderer.send('pet:set-visible', Boolean(vis)),
  setVoiceMood: (voiceState) => ipcRenderer.send('pet:set-voice-mood', voiceState),

  // Fullscreen autohide & dock mode settings
  getAutohide: () => ipcRenderer.invoke('settings:get-autohide'),
  setAutohide: (enabled) => ipcRenderer.invoke('settings:set-autohide', enabled),
  getAutohidePet: () => ipcRenderer.invoke('settings:get-autohide-pet'),
  setAutohidePet: (enabled) => ipcRenderer.invoke('settings:set-autohide-pet', enabled),
  getDockMode: () => ipcRenderer.invoke('settings:get-dock-mode'),
  setDockMode: (mode) => ipcRenderer.invoke('settings:set-dock-mode', mode),
  getSnapThreshold: () => ipcRenderer.invoke('settings:get-snap-threshold'),
  setSnapThreshold: (dist) => ipcRenderer.invoke('settings:set-snap-threshold', dist),
  getSystemAccentColor: () => ipcRenderer.invoke('system:get-accent-color'),

  // Gemini Voice Service
  gemini: {
    processSpeech: (params) => ipcRenderer.invoke('gemini:process-speech', params),
    synthesizeSpeech: (params) => ipcRenderer.invoke('gemini:synthesize-speech', params),
    getStatus: () => ipcRenderer.invoke('gemini:get-status'),
  },

  // Groq Service (Conversational Llama & Whisper STT)
  groq: {
    chat: (params) => ipcRenderer.invoke('groq:chat', params),
    chatStream: (params) => ipcRenderer.invoke('groq:chat-stream', params),
    abortStream: (streamId) => ipcRenderer.invoke('groq:abort-stream', typeof streamId === 'string' ? { streamId } : streamId),
    transcribe: (params) => ipcRenderer.invoke('groq:transcribe', params),
    getStatus: () => ipcRenderer.invoke('groq:get-status'),
    setKey: (keyOrParams) => ipcRenderer.invoke('groq:set-key', typeof keyOrParams === 'string' ? { key: keyOrParams } : keyOrParams),
    clearKey: () => ipcRenderer.invoke('groq:clear-key'),
    listModels: (params) => ipcRenderer.invoke('groq:list-models', params || {}),
  },

  // Unified Multi-Provider AI Status & Controls
  ai: {
    getStatus: () => ipcRenderer.invoke('ai:get-status'),
    setGroqKey: (key) => ipcRenderer.invoke('groq:set-key', { key }),
    clearGroqKey: () => ipcRenderer.invoke('groq:clear-key'),
  },

  // Kokoro Local TTS Prototype Service (CPU ONNX)
  kokoro: {
    getStatus: () => ipcRenderer.invoke('kokoro:get-status'),
    loadModel: (options) => ipcRenderer.invoke('kokoro:load-model', options),
    installModel: () => ipcRenderer.invoke('kokoro:install-model'),
    synthesize: (params) => ipcRenderer.invoke('kokoro:synthesize', params),
    cancel: () => ipcRenderer.invoke('kokoro:cancel'),
    dispose: () => ipcRenderer.invoke('kokoro:dispose'),
  },

  // Native Windows SAPI TTS Service
  windowsTts: {
    getVoices: () => ipcRenderer.invoke('windows-tts:get-voices'),
    synthesizeSpeech: (params) => ipcRenderer.invoke('windows-tts:synthesize', params),
    cancel: () => ipcRenderer.invoke('windows-tts:cancel'),
  },

  // OpenAI Realtime voice broker (ephemeral token)
  realtime: {
    createSession: (options) => ipcRenderer.invoke('realtime:create-session', options),
  },

  scheduler: {
    addAlarm: (input) => ipcRenderer.invoke('scheduler:add-alarm', input),
    addTimer: (input) => ipcRenderer.invoke('scheduler:add-timer', input),
    snooze: (input) => ipcRenderer.invoke('scheduler:snooze', input),
    remove: (id) => ipcRenderer.invoke('scheduler:remove', id),
    setEnabled: (id, enabled) => ipcRenderer.invoke('scheduler:set-enabled', id, enabled),
  },

  media: {
    control: (action) => ipcRenderer.send('media:control', action),
    seek: (posSec) => ipcRenderer.send('media:seek', Number(posSec)),
    openUrl: (url) => ipcRenderer.send('media:open-url', String(url)),
    getVideoSourceId: () => ipcRenderer.invoke('video:get-source-id'),
    resolveYouTubeId: (query) => ipcRenderer.invoke('video:resolve-youtube-id', query),
    sampleStageColor: () => ipcRenderer.invoke('video:sample-stage-color'),
  },

  inbox: {
    clear: () => ipcRenderer.send('inbox:clear'),
    remove: (id) => ipcRenderer.send('inbox:remove', id),
    markRead: () => ipcRenderer.send('inbox:mark-read'),
  },

  companion: {
    getStatus: () => ipcRenderer.invoke('companion:get-status'),
    getDiagnostics: () => ipcRenderer.invoke('companion:get-diagnostics'),
    dispatchCommand: (cmd) => ipcRenderer.invoke('companion:dispatch', cmd),
  },

  on: (channel, callback) => {
    if (!CHANNELS.has(channel)) throw new Error(`Unknown channel: ${channel}`);
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
});
