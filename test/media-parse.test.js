'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { friendlyAppName, parseMediaLine, toMediaState, createLineSplitter, validArt } = require('../electron/media-parse');

test('friendlyAppName maps common players and falls back sensibly', () => {
  assert.equal(friendlyAppName('Spotify.exe'), 'Spotify');
  assert.equal(friendlyAppName('chrome.exe'), 'Chrome');
  assert.equal(friendlyAppName('MSEdge'), 'Edge');
  assert.equal(friendlyAppName('Microsoft.ZuneMusic_8wekyb3d8bbwe!Microsoft.ZuneMusic'), 'Media Player');
  assert.equal(friendlyAppName('foo.exe'), 'Foo');
  assert.equal(friendlyAppName(''), '');
});

test('parseMediaLine ignores noise and strips a BOM', () => {
  assert.equal(parseMediaLine('warning: something'), null);
  assert.equal(parseMediaLine('{broken'), null);
  assert.deepEqual(parseMediaLine('﻿{"ok":false}'), { ok: false });
});

test('toMediaState shapes playing, paused and inactive sessions', () => {
  const raw = { ok: true, app: 'Spotify.exe', title: 'Neon Tides', artist: 'Aurora Vale', album: 'Low Orbit', status: 'Playing', pos: 12.5, dur: 214 };
  const playing = toMediaState(raw, 1000, 'data:image/png;base64,AAAA');
  assert.equal(playing.active, true);
  assert.equal(playing.status, 'playing');
  assert.equal(playing.app, 'Spotify');
  assert.equal(playing.positionMs, 12500);
  assert.equal(playing.durationMs, 214000);
  assert.equal(playing.reportedAt, 1000);
  assert.equal(toMediaState({ ...raw, status: 'Paused' }, 1).status, 'paused');
  assert.deepEqual(toMediaState({ ...raw, status: 'Stopped' }, 1), { active: false });
  assert.deepEqual(toMediaState({ ok: false }, 1), { active: false });
  assert.deepEqual(toMediaState({ ...raw, title: '', artist: '' }, 1), { active: false });
  assert.equal(toMediaState({ ...raw, pos: -5, dur: 'x' }, 1).positionMs, 0);
});

test('createLineSplitter reassembles lines split across chunks', () => {
  const split = createLineSplitter();
  assert.deepEqual(split.push('{"a":1}\n{"b'), ['{"a":1}']);
  assert.deepEqual(split.push('":2}\r\n'), ['{"b":2}']);
  assert.deepEqual(split.push('partial'), []);
});

test('validArt only accepts reasonably sized image data URLs', () => {
  assert.equal(validArt('data:image/jpeg;base64,AAAA'), 'data:image/jpeg;base64,AAAA');
  assert.equal(validArt('javascript:alert(1)'), null);
  assert.equal(validArt('data:text/html;base64,AAAA'), null);
  assert.equal(validArt(`data:image/png;base64,${'A'.repeat(900000)}`), null);
});
