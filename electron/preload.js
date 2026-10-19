'use strict';
// The only bridge between the web UI and the OS side. Nothing here exposes Node or the filesystem.

const { contextBridge, ipcRenderer } = require('electron');

const CHANNELS = new Set(['notification', 'ring', 'media', 'scheduler:state', 'inbox:state', 'hub:toggle', 'window:blur', 'window:pos-changed', 'pet:pos-changed', 'fullscreen:change']);

contextBridge.exposeInMainWorld('island', {
  getState: () => ipcRenderer.invoke('state:get'),

  // Window behaviour: the window is click-through except over the island and pet.
  setIgnoreMouse: (ignore) => ipcRenderer.send('win:ignore-mouse', Boolean(ignore)),
  setFocusable: (focusable) => ipcRenderer.send('win:focusable', Boolean(focusable)),

  // Window position & presets
  moveWindowBy: (dx, dy) => ipcRenderer.send('window:move-by', { dx, dy }),
  setWindowPreset: (preset) => ipcRenderer.send('window:set-preset', preset),
  resetWindowPos: () => ipcRenderer.send('window:reset-pos'),
  getWindowPos: () => ipcRenderer.invoke('window:get-pos'),
  setIslandExpanded: (expanded) => ipcRenderer.send('island:expand', Boolean(expanded)),

  // Standalone Desktop Pet Window
  movePetBy: (dx, dy) => ipcRenderer.send('pet:move-by', { dx, dy }),
  setPetPos: (x, y) => ipcRenderer.send('pet:set-pos', { x, y }),
  getPetPos: () => ipcRenderer.invoke('pet:get-pos'),
  resetPetPos: () => ipcRenderer.send('pet:reset-pos'),
  setPetVisible: (vis) => ipcRenderer.send('pet:set-visible', Boolean(vis)),

  // Fullscreen autohide settings
  getAutohide: () => ipcRenderer.invoke('settings:get-autohide'),
  setAutohide: (enabled) => ipcRenderer.invoke('settings:set-autohide', enabled),
  getAutohidePet: () => ipcRenderer.invoke('settings:get-autohide-pet'),
  setAutohidePet: (enabled) => ipcRenderer.invoke('settings:set-autohide-pet', enabled),

  scheduler: {
    addAlarm: (input) => ipcRenderer.invoke('scheduler:add-alarm', input),
    addTimer: (input) => ipcRenderer.invoke('scheduler:add-timer', input),
    snooze: (input) => ipcRenderer.invoke('scheduler:snooze', input),
    remove: (id) => ipcRenderer.invoke('scheduler:remove', id),
    setEnabled: (id, enabled) => ipcRenderer.invoke('scheduler:set-enabled', id, enabled),
  },

  media: {
    control: (action) => ipcRenderer.send('media:control', action),
  },

  inbox: {
    clear: () => ipcRenderer.send('inbox:clear'),
    remove: (id) => ipcRenderer.send('inbox:remove', id),
    markRead: () => ipcRenderer.send('inbox:mark-read'),
  },

  on: (channel, callback) => {
    if (!CHANNELS.has(channel)) throw new Error(`Unknown channel: ${channel}`);
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
});
