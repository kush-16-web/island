'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

// Import ES module from src/lib/lyrics.js
test('lyrics parser: correctly parses standard LRC line timestamps', async () => {
  const { parseLrc, findActiveLyricIndex } = await import('../src/lib/lyrics.js');

  const lrc = `
[00:04.23] Whoa-oh, mm-hmm-mm
[00:09.37] You've been runnin' 'round
[00:14.16] 'Cause you knew that I'd
  `;

  const lines = parseLrc(lrc);
  assert.equal(lines.length, 3);
  assert.equal(lines[0].timeMs, 4230);
  assert.equal(lines[0].text, 'Whoa-oh, mm-hmm-mm');
  assert.equal(lines[0].endMs, 9370);

  assert.equal(lines[1].timeMs, 9370);
  assert.equal(lines[1].text, "You've been runnin' 'round");
  assert.equal(lines[1].endMs, 14160);

  assert.equal(lines[2].timeMs, 14160);
  assert.equal(lines[2].text, "'Cause you knew that I'd");
});

test('lyrics parser: parses word-level ELRC timestamps', async () => {
  const { parseLrc } = await import('../src/lib/lyrics.js');

  const elrc = `
[00:04.23] <00:04.23> Whoa-oh, <00:06.50> mm-hmm-mm
  `;

  const lines = parseLrc(elrc);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].text, 'Whoa-oh, mm-hmm-mm');
  assert.ok(lines[0].words);
  assert.equal(lines[0].words.length, 2);
  assert.equal(lines[0].words[0].text, 'Whoa-oh,');
  assert.equal(lines[0].words[0].startMs, 4230);
  assert.equal(lines[0].words[0].endMs, 6500);
  assert.equal(lines[0].words[1].text, 'mm-hmm-mm');
  assert.equal(lines[0].words[1].startMs, 6500);
});

test('lyrics synchronization: binary search finds active line index accurately', async () => {
  const { findActiveLyricIndex } = await import('../src/lib/lyrics.js');

  const lines = [
    { timeMs: 4000, endMs: 9000, text: 'Line 1' },
    { timeMs: 9000, endMs: 15000, text: 'Line 2' },
    { timeMs: 15000, endMs: 22000, text: 'Line 3' },
  ];

  // Before intro starts
  assert.equal(findActiveLyricIndex(lines, 1000), -1);

  // Exactly at line 1 start
  assert.equal(findActiveLyricIndex(lines, 4000), 0);

  // During line 1
  assert.equal(findActiveLyricIndex(lines, 6500), 0);

  // Right at line 2 start
  assert.equal(findActiveLyricIndex(lines, 9000), 1);

  // During line 3
  assert.equal(findActiveLyricIndex(lines, 18000), 2);

  // Past the end of song
  assert.equal(findActiveLyricIndex(lines, 50000), 2);

  // Empty list
  assert.equal(findActiveLyricIndex([], 5000), -1);
});
