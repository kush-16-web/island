const path = require('path');
const { fetchLyrics, findActiveLyricIndex } = require('../../src/lib/lyrics/lyrics.js');

const songs = [
  { title: 'Lovesong', artist: 'Adele', durationSec: 316 },
  { title: 'Borderline', artist: 'Tame Impala', durationSec: 237 },
  { title: 'Cry For Me', artist: 'The Weeknd', durationSec: 224 },
  { title: "Feet Don't Fail Me Now", artist: 'Joy Crookes', durationSec: 198 },
  { title: "We Don't Talk Anymore", artist: 'Charlie Puth', durationSec: 217 },
];

async function run() {
  console.log('=== TESTING REAL SONGS LYRICS PIPELINE ===\n');

  for (const song of songs) {
    console.log(`--------------------------------------------------`);
    console.log(`Checking: "${song.title}" by ${song.artist} (${song.durationSec}s)`);
    try {
      const res = await fetchLyrics({
        title: song.title,
        artist: song.artist,
        durationSec: song.durationSec,
      });

      console.log(`  Found: ${res.found} | Provider: ${res.provider} | Format: ${res.format} | SyncType: ${res.syncType}`);
      console.log(`  isSynced: ${res.isSynced} | hasWordSync: ${res.hasWordSync}`);
      
      if (!res.lines || res.lines.length === 0) {
        console.log(`  No lines returned!`);
        continue;
      }

      console.log(`  Line count: ${res.lines.length}`);
      console.log(`  First 3 lines:`);
      for (let i = 0; i < Math.min(3, res.lines.length); i++) {
        const l = res.lines[i];
        console.log(`    [${i}] timeMs: ${l.timeMs} (${(l.timeMs / 1000).toFixed(1)}s), endMs: ${l.endMs}, sync: ${l.syncType}, words: ${l.words ? l.words.length : 0}, text: "${l.text.slice(0, 35)}"`);
      }
      console.log(`  Last 3 lines:`);
      for (let i = Math.max(0, res.lines.length - 3); i < res.lines.length; i++) {
        const l = res.lines[i];
        console.log(`    [${i}] timeMs: ${l.timeMs} (${(l.timeMs / 1000).toFixed(1)}s), endMs: ${l.endMs}, sync: ${l.syncType}, words: ${l.words ? l.words.length : 0}, text: "${l.text.slice(0, 35)}"`);
      }

      // Check if lines are strictly sorted by timeMs
      let isSorted = true;
      let hasInvalidTime = false;
      for (let i = 0; i < res.lines.length; i++) {
        const l = res.lines[i];
        if (typeof l.timeMs !== 'number' || isNaN(l.timeMs)) {
          hasInvalidTime = true;
        }
        if (i > 0 && res.lines[i].timeMs < res.lines[i - 1].timeMs) {
          isSorted = false;
          console.log(`  [UNSORTED DETECTED] Line ${i} (${res.lines[i].timeMs}ms) < Line ${i - 1} (${res.lines[i - 1].timeMs}ms)`);
        }
      }
      console.log(`  Strictly sorted: ${isSorted} | Has invalid time: ${hasInvalidTime}`);

      // Test active line selection across timeline
      const sampleTimesSec = [0, 5, 15, 30, 60, 90, 120, 180, song.durationSec - 10];
      console.log(`  Timeline active line indices:`);
      sampleTimesSec.forEach((s) => {
        const posMs = s * 1000;
        const activeIdx = findActiveLyricIndex(res.lines, posMs);
        const activeLine = activeIdx >= 0 ? res.lines[activeIdx] : null;
        console.log(`    t=${s}s (${posMs}ms) -> activeIdx=${activeIdx} [${activeLine ? `${(activeLine.timeMs / 1000).toFixed(1)}s: "${activeLine.text.slice(0, 25)}"` : 'none'}]`);
      });

    } catch (e) {
      console.log(`  Error fetching lyrics:`, e.message);
    }
    console.log();
  }
}

run();
