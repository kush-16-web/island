const fs = require('fs');

async function run() {
  const url = 'https://lrclib.net/api/get?track_name=Feet%20Don%27t%20Fail%20Me%20Now&artist_name=Joy%20Crookes';
  const res = await fetch(url, { headers: { 'User-Agent': 'IslandAI/0.1.0' } });
  const d = await res.json();
  fs.writeFileSync('test/harness/joy-crookes-yaml.txt', d.lyricsfile || '');
  console.log('Saved joy-crookes-yaml.txt. Length:', (d.lyricsfile || '').length);
}
run();
