'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

test('Precision Horizontal Lyrics Synchronization Suite', async (t) => {
  const { calculateLyricScrollOffset } = await import('../src/lib/lyrics-scroll.js');

  await t.test('1. Short lines: remain completely stationary (offset = 0)', () => {
    const shortLine = {
      id: 'l1',
      timeMs: 5000,
      endMs: 9000,
      text: 'Short line',
    };
    // For non-overflowing text, maxScroll is 0
    assert.equal(calculateLyricScrollOffset(5000, shortLine, 0), 0);
    assert.equal(calculateLyricScrollOffset(7000, shortLine, 0), 0);
    assert.equal(calculateLyricScrollOffset(9000, shortLine, 0), 0);
    assert.equal(calculateLyricScrollOffset(10000, shortLine, 0), 0);
  });

  await t.test('2. Long lines with line-level timestamps: smooth forward progress across duration', () => {
    const longLine = {
      id: 'l2',
      timeMs: 10000,
      endMs: 16000,
      text: 'This is a significantly long line that clearly exceeds the viewport width and requires horizontal tracking',
    };
    const maxScroll = 180;

    // Before line starts
    assert.equal(calculateLyricScrollOffset(8000, longLine, maxScroll), 0);
    assert.equal(calculateLyricScrollOffset(10000, longLine, maxScroll), 0);

    // Initial lead-in pause (first ~300ms)
    assert.equal(calculateLyricScrollOffset(10200, longLine, maxScroll), 0);

    // Mid-phrase progression
    const midOffset = calculateLyricScrollOffset(13000, longLine, maxScroll);
    assert.ok(midOffset > 30 && midOffset < 150, `Mid offset ${midOffset} should be between 30 and 150`);

    // Later in phrase
    const lateOffset = calculateLyricScrollOffset(14500, longLine, maxScroll);
    assert.ok(lateOffset > midOffset, 'Late offset should exceed mid offset');

    // Tail hold (last ~500ms)
    assert.equal(calculateLyricScrollOffset(15800, longLine, maxScroll), maxScroll);
    assert.equal(calculateLyricScrollOffset(16000, longLine, maxScroll), maxScroll);
    assert.equal(calculateLyricScrollOffset(17000, longLine, maxScroll), maxScroll);
  });

  await t.test('3. Fast lyrical line: completes quickly within short phrase duration', () => {
    const fastLine = {
      id: 'l-fast',
      timeMs: 20000,
      endMs: 21500, // 1.5s rapid fire lyrics
      text: 'Rapid fire quick lyrics passing in a flash',
    };
    const maxScroll = 120;

    const at25Percent = calculateLyricScrollOffset(20400, fastLine, maxScroll);
    const at50Percent = calculateLyricScrollOffset(20750, fastLine, maxScroll);
    const at75Percent = calculateLyricScrollOffset(21100, fastLine, maxScroll);

    assert.ok(at25Percent < at50Percent, 'Progress must increase monotonically');
    assert.ok(at50Percent < at75Percent, 'Progress must increase monotonically');
    assert.equal(calculateLyricScrollOffset(21500, fastLine, maxScroll), maxScroll);
  });

  await t.test('4. Slow sustained phrase: smoothly glides across extended duration', () => {
    const slowLine = {
      id: 'l-slow',
      timeMs: 30000,
      endMs: 40000, // 10-second sustained operatic/ambient vocal
      text: 'And I will always cherish this silent timeless horizon forever and ever',
    };
    const maxScroll = 240;

    let previous = 0;
    for (let tMs = 30500; tMs <= 39000; tMs += 500) {
      const current = calculateLyricScrollOffset(tMs, slowLine, maxScroll);
      assert.ok(current >= previous, `Time ${tMs}ms: offset ${current} should be >= ${previous}`);
      previous = current;
    }
    assert.equal(calculateLyricScrollOffset(40000, slowLine, maxScroll), maxScroll);
  });

  await t.test('5. Pause & Forward Playback: holds position when timestamp does not advance', () => {
    const line = {
      id: 'l-pause',
      timeMs: 50000,
      endMs: 56000,
      text: 'Testing audio pause and hold behavior on active line',
    };
    const maxScroll = 160;

    // Playback reaches 53000ms
    const offset1 = calculateLyricScrollOffset(53000, line, maxScroll);

    // Audio is paused for 3 seconds (timestamp remains 53000ms)
    const offset2 = calculateLyricScrollOffset(53000, line, maxScroll);
    const offset3 = calculateLyricScrollOffset(53000, line, maxScroll);

    assert.equal(offset1, offset2, 'Offset must hold exactly steady during pause');
    assert.equal(offset2, offset3, 'Offset must hold exactly steady during pause');
  });

  await t.test('6. Seeking and Repeated Backward Seeking: immediately recalculates without delay', () => {
    const line = {
      id: 'l-seek',
      timeMs: 60000,
      endMs: 68000,
      text: 'Testing repeated seeking rewind and forward jumping',
    };
    const maxScroll = 200;

    // Normal forward position at 66000ms
    const forwardOffset = calculateLyricScrollOffset(66000, line, maxScroll);
    assert.ok(forwardOffset > 100);

    // User rewinds 4 seconds backward to 62000ms
    const rewindOffset1 = calculateLyricScrollOffset(62000, line, maxScroll);
    assert.ok(rewindOffset1 < forwardOffset, 'Rewinding backward must produce smaller target offset');
    assert.ok(rewindOffset1 >= 0);

    // User rewinds even further back to line start (60000ms)
    const rewindOffset2 = calculateLyricScrollOffset(60000, line, maxScroll);
    assert.equal(rewindOffset2, 0, 'Rewinding to line start must immediately yield 0 offset');

    // User seeks forward to 67500ms
    const forwardJump = calculateLyricScrollOffset(67500, line, maxScroll);
    assert.equal(forwardJump, maxScroll, 'Forward seek to near-end yields maxScroll');
  });

  await t.test('7. Word-level timestamps (ELRC): tracks word boundaries and holds during inter-word vocal pauses', () => {
    const wordLine = {
      id: 'l-words',
      timeMs: 70000,
      endMs: 76000,
      text: 'Hold my hand tightly',
      words: [
        { text: 'Hold', startMs: 70200, endMs: 71000 },
        // Inter-word vocal breath pause between 71000ms and 72500ms (1.5s gap!)
        { text: 'my', startMs: 72500, endMs: 73000 },
        { text: 'hand', startMs: 73100, endMs: 74000 },
        // Breath gap 74000ms - 74800ms
        { text: 'tightly', startMs: 74800, endMs: 75600 },
      ],
    };
    const maxScroll = 150;

    // Before singing begins
    assert.equal(calculateLyricScrollOffset(70000, wordLine, maxScroll), 0);
    assert.equal(calculateLyricScrollOffset(70150, wordLine, maxScroll), 0);

    // Singing first word "Hold"
    const holdMid = calculateLyricScrollOffset(70600, wordLine, maxScroll);
    assert.ok(holdMid > 0);

    // End of first word "Hold" (71000ms)
    const holdEnd = calculateLyricScrollOffset(71000, wordLine, maxScroll);

    // During the 1.5s vocal breath gap (71200ms, 71800ms, 72400ms):
    // MUST HOLD STEADY AT THE EXACT SAME OFFSET!
    const pause1 = calculateLyricScrollOffset(71200, wordLine, maxScroll);
    const pause2 = calculateLyricScrollOffset(71800, wordLine, maxScroll);
    const pause3 = calculateLyricScrollOffset(72400, wordLine, maxScroll);

    assert.equal(pause1, holdEnd, 'Position must hold during vocal pause');
    assert.equal(pause2, holdEnd, 'Position must hold during vocal pause');
    assert.equal(pause3, holdEnd, 'Position must hold during vocal pause');

    // Next word "my" starts singing at 72500ms
    const myMid = calculateLyricScrollOffset(72750, wordLine, maxScroll);
    assert.ok(myMid > holdEnd, 'Progress resumes when next word begins');
  });

  await t.test('8. Switching between songs: resets cleanly to initial state', () => {
    const song1Line = {
      id: 'song1-line5',
      timeMs: 15000,
      endMs: 20000,
      text: 'Song 1 ending phrase with full horizontal displacement',
    };
    const maxScroll1 = 200;
    const finalOffsetSong1 = calculateLyricScrollOffset(19500, song1Line, maxScroll1);
    assert.equal(finalOffsetSong1, maxScroll1);

    // New song starts: line 1 at 2000ms
    const song2Line = {
      id: 'song2-line1',
      timeMs: 3000,
      endMs: 8000,
      text: 'Brand new track opening introductory line',
    };
    const maxScroll2 = 180;
    const startOffsetSong2 = calculateLyricScrollOffset(1500, song2Line, maxScroll2);
    assert.equal(startOffsetSong2, 0, 'New song intro must start cleanly at 0');
  });

  await t.test('9. Slow vocal section (São Paulo style): subpixel continuous delta without integer stepping', () => {
    // 8-second slow stretched vocal line
    const saoPauloLine = {
      id: 'sao-paulo-slow',
      timeMs: 100000,
      endMs: 108000,
      text: 'Ela joga a fumaça pro alto enquanto a cidade inteira para pra assistir',
    };
    const maxScroll = 190;

    // Simulate 16.6ms display refresh frames (60fps) during active singing
    let prevOffset = calculateLyricScrollOffset(102000, saoPauloLine, maxScroll, { subpixel: true });
    for (let t = 102016.6; t <= 104000; t += 16.6) {
      const current = calculateLyricScrollOffset(t, saoPauloLine, maxScroll, { subpixel: true });
      assert.ok(current >= prevOffset, `Offset must advance smoothly forward at ${t}ms`);
      const delta = current - prevOffset;
      // In slow vocal sections, per-frame delta should be smooth (under 1.5px per frame), not a sudden 15px jump
      assert.ok(delta < 1.5, `Frame delta ${delta}px should be under 1.5px`);
      prevOffset = current;
    }
  });

  await t.test('10. Irregular playback timestamp updates (SMTC jitter): monotonic forward guarantee', () => {
    const line = {
      id: 'jitter-test',
      timeMs: 40000,
      endMs: 46000,
      text: 'Irregular timestamps arriving from Windows SMTC with latency variations',
    };
    const maxScroll = 150;

    // Simulate irregular arrival timestamps (e.g. 40500, 40580, 40620, 40750, 40760)
    const arrivalTimes = [40350, 40500, 40580, 40620, 40750, 40760, 40900, 41200, 42000, 43500];
    let lastOffset = 0;

    for (const timeMs of arrivalTimes) {
      const offset = calculateLyricScrollOffset(timeMs, line, maxScroll, { subpixel: true });
      assert.ok(offset >= lastOffset, `Offset at ${timeMs}ms (${offset}) must be >= previous (${lastOffset})`);
      lastOffset = offset;
    }
  });

  await t.test('11. Missing or malformed timestamps: safe fallbacks without throwing or NaN', () => {
    const malformed1 = { id: 'bad1', timeMs: null, endMs: null, text: 'No timestamps' };
    const malformed2 = { id: 'bad2', timeMs: NaN, endMs: NaN, text: 'NaN timestamps' };
    const malformed3 = { id: 'bad3', timeMs: 5000, endMs: 3000, text: 'Inverted timestamps' };

    assert.equal(calculateLyricScrollOffset(2000, malformed1, 100), 0);
    assert.doesNotThrow(() => calculateLyricScrollOffset(4000, malformed2, 100));
    assert.doesNotThrow(() => calculateLyricScrollOffset(6000, malformed3, 100));
    assert.ok(!isNaN(calculateLyricScrollOffset(6000, malformed3, 100)));
  });
});
