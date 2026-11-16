const { fetchLyrics, findActiveLyricIndex } = require('../../src/lib/lyrics/lyrics.js');

async function testAdele() {
  const result = await fetchLyrics({
    title: 'Lovesong',
    artist: 'Adele',
    durationSec: 316
  });

  console.log('Provider:', result.provider);
  console.log('Format:', result.format);
  console.log('HasWordSync:', result.hasWordSync);
  console.log('SyncType:', result.syncType);
  console.log('Total lines:', result.lines?.length);

  if (result.lines && result.lines.length > 0) {
    console.log('\nFirst 5 lines:');
    result.lines.slice(0, 5).forEach((line, idx) => {
      console.log(`Line ${idx}: [${line.timeMs}ms - ${line.endMs}ms] "${line.text}" (words: ${line.words?.length || 0})`);
      if (line.words) {
        console.log('   Words:', line.words.map(w => `${w.text} (${w.startMs}-${w.endMs})`).join(' '));
      }
    });

    console.log('\nChecking positions:');
    const positions = [0, 3000, 6000, 10000, 15000, 18000, 20000, 25000];
    for (const pos of positions) {
      const idx = findActiveLyricIndex(result.lines, pos);
      console.log(`At ${pos}ms (${pos/1000}s): activeIdx = ${idx} -> ${idx >= 0 ? `"${result.lines[idx].text}"` : '(Intro / No lyric active)'}`);
    }
  }
}

testAdele().catch(console.error);
