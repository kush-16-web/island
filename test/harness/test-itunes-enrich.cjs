const { enrichTrackMetadata, upgradeProviderArtUrl } = require('../../src/lib/music/art-resolver.js');

async function testArt() {
  const tracks = [
    { title: 'Lovesong', artist: 'Adele' },
    { title: 'Borderline', artist: 'Tame Impala' },
    { title: 'Cry For Me', artist: 'The Weeknd' },
    { title: "Feet Don't Fail Me Now", artist: 'Joy Crookes' },
    { title: "We Don't Talk Anymore", artist: 'Charlie Puth' },
  ];

  for (const t of tracks) {
    const res = await enrichTrackMetadata(t.title, t.artist);
    console.log(`"${t.title}" by ${t.artist}:`);
    console.log(`  Source: ${res.artworkSource}`);
    console.log(`  Artwork URL: ${res.artwork}`);
  }
}

testArt();
