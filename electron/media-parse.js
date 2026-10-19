'use strict';
// Pure helpers for turning the PowerShell watcher's JSON lines into UI-ready media state.

const KNOWN_APPS = [
  [/spotify/i, 'Spotify'],
  [/msedge|edge/i, 'Edge'],
  [/chrome/i, 'Chrome'],
  [/firefox/i, 'Firefox'],
  [/brave/i, 'Brave'],
  [/opera/i, 'Opera'],
  [/vlc/i, 'VLC'],
  [/zunemusic|zunevideo|mediaplayer|groove/i, 'Media Player'],
  [/applemusic|itunes/i, 'Apple Music'],
  [/amazonmusic/i, 'Amazon Music'],
  [/musicbee/i, 'MusicBee'],
];

function friendlyAppName(id) {
  const raw = String(id || '').trim();
  if (!raw) return '';
  for (const [pattern, name] of KNOWN_APPS) if (pattern.test(raw)) return name;
  const base = raw.split('!')[0].split('_')[0].replace(/\.exe$/i, '');
  const last = base.split('.').filter(Boolean).pop() || base;
  return last.charAt(0).toUpperCase() + last.slice(1);
}

function cleanText(value, max) {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '';
}

function secondsToMs(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 1000) : 0;
}

function parseMediaLine(line) {
  const text = String(line || '').replace(/^﻿/, '').trim();
  if (!text.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function validArt(art) {
  return typeof art === 'string' && /^data:image\/(png|jpeg|jpg|webp|gif|bmp);base64,/i.test(art) && art.length < 900000
    ? art
    : null;
}

function toMediaState(raw, reportedAt, art) {
  if (!raw || raw.ok !== true) return { active: false };
  const status = String(raw.status || '').toLowerCase();
  if (status !== 'playing' && status !== 'paused') return { active: false };
  const title = cleanText(raw.title, 200);
  const artist = cleanText(raw.artist, 200);
  if (!title && !artist) return { active: false };
  return {
    active: true,
    title: title || 'Unknown title',
    artist,
    album: cleanText(raw.album, 200),
    app: friendlyAppName(raw.app),
    status,
    positionMs: secondsToMs(raw.pos),
    durationMs: secondsToMs(raw.dur),
    art: art || null,
    reportedAt,
  };
}

// Splits a stream of text chunks into complete lines.
function createLineSplitter() {
  let buffer = '';
  return {
    push(chunk) {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop();
      if (buffer.length > 2_000_000) buffer = '';
      return lines;
    },
  };
}

module.exports = { friendlyAppName, parseMediaLine, toMediaState, createLineSplitter, validArt };
