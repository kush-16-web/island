async function run() {
  const url = 'https://lrclib.net/api/get?track_name=Feet%20Don%27t%20Fail%20Me%20Now&artist_name=Joy%20Crookes';
  const res = await fetch(url, { headers: { 'User-Agent': 'IslandAI/0.1.0' } });
  const d = await res.json();
  console.log('hasWordSync:', d.hasWordSync);
  console.log('syncedLyrics (first 250 chars):\n', d.syncedLyrics ? d.syncedLyrics.slice(0, 250) : 'none');
  console.log('\nlyricsfile (first 250 chars):\n', d.lyricsfile ? d.lyricsfile.slice(0, 250) : 'none');
}
run();
