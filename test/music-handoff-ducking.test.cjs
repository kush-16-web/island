/**
 * test/music-handoff-ducking.test.cjs
 * Comprehensive verification suite for PASS 2:
 * Intelligent Favorites Playback, Audio Ducking, and Provider Identity.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

function createMockStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
  };
}

test('ISLAND — PASS 2: Intelligent Favorites Playback & Audio Ducking Suite', async (t) => {
  const { resolveFavoriteTrack, cleanSpokenQuery } = await import('../src/lib/favorites-resolver.js');
  const { interpretLocalMusicCommand } = await import('../src/lib/music-command-interpreter.js');
  const { audioCoordinator } = await import('../src/lib/audio-coordinator.js');
  const {
    getAllFavorites,
    addFavorite,
    detectProvider,
    buildPlayableReference,
    createFavoriteId,
    SUPPORTED_PROVIDERS,
  } = await import('../src/lib/favorites.js');
  const { enrichTrackMetadata } = await import('../src/lib/art-resolver.js');

  const sampleFavorites = [
    {
      id: 'youtube:die_for_you__the_weeknd',
      title: 'Die For You',
      artist: 'The Weeknd',
      provider: SUPPORTED_PROVIDERS.YOUTUBE,
      playableUrl: 'https://music.youtube.com/watch?v=dQw4w9WgXcQ',
      youtubeId: 'dQw4w9WgXcQ',
      addedAt: 1000,
    },
    {
      id: 'spotify:attention__charlie_puth',
      title: 'Attention',
      artist: 'Charlie Puth',
      provider: SUPPORTED_PROVIDERS.SPOTIFY,
      playableUrl: 'spotify:search:Attention%20Charlie%20Puth',
      addedAt: 2000,
    },
    {
      id: 'apple:sao_paulo__the_weeknd',
      title: 'São Paulo',
      artist: 'The Weeknd',
      provider: SUPPORTED_PROVIDERS.APPLE,
      playableUrl: 'https://music.apple.com/search?term=Sao%20Paulo',
      addedAt: 3000,
    },
    {
      id: 'youtube:die_for_you__joji',
      title: 'Die For You',
      artist: 'Joji',
      provider: SUPPORTED_PROVIDERS.YOUTUBE,
      playableUrl: 'https://music.youtube.com/watch?v=joji1234567',
      youtubeId: 'joji1234567',
      addedAt: 4000,
    },
    {
      id: 'youtube:recently_liked__test_artist',
      title: 'Latest Favorite',
      artist: 'Test Artist',
      provider: SUPPORTED_PROVIDERS.YOUTUBE,
      playableUrl: 'https://music.youtube.com/watch?v=latest12345',
      youtubeId: 'latest12345',
      addedAt: 5000,
    },
  ];

  const storage = createMockStorage({
    island_favorites_v2: JSON.stringify(sampleFavorites),
  });

  // ==========================================
  // PART C: Accurate Favorites Matching
  // ==========================================

  await t.test('1. Exact title match resolves favorite', () => {
    const res = resolveFavoriteTrack({ query: 'Attention', storage });
    assert.ok(res.match);
    assert.equal(res.match.title, 'Attention');
    assert.equal(res.match.artist, 'Charlie Puth');
  });

  await t.test('2. Exact title and artist disambiguates duplicate song titles', () => {
    // "Die For You" exists by both "The Weeknd" and "Joji"
    const resWeeknd = resolveFavoriteTrack({
      query: 'Die For You by The Weeknd',
      title: 'Die For You',
      artist: 'The Weeknd',
      storage,
    });
    assert.ok(resWeeknd.match);
    assert.equal(resWeeknd.match.artist, 'The Weeknd');

    const resJoji = resolveFavoriteTrack({
      query: 'Die For You by Joji',
      title: 'Die For You',
      artist: 'Joji',
      storage,
    });
    assert.ok(resJoji.match);
    assert.equal(resJoji.match.artist, 'Joji');
  });

  await t.test('3. Case, diacritics, and punctuation differences match cleanly', () => {
    const res = resolveFavoriteTrack({ query: 'sao paulo!', storage });
    assert.ok(res.match);
    assert.equal(res.match.title, 'São Paulo');
  });

  await t.test('4. Common Whisper transcription variations normalized ("the weekend" -> "the weeknd")', () => {
    assert.equal(cleanSpokenQuery('play die for you by the weekend'), 'play die for you by the weeknd');
    const res = resolveFavoriteTrack({ query: 'Die For You by the weekend', storage });
    assert.ok(res.match);
    assert.equal(res.match.artist, 'The Weeknd');
  });

  await t.test('5. Duplicate titles without artist prompt concise clarification (ambiguity detection)', () => {
    // Two songs titled "Die For You" with no artist specified
    const res = resolveFavoriteTrack({ query: 'Die For You', title: 'Die For You', storage });
    assert.equal(res.match, null);
    assert.equal(res.ambiguous, true);
    assert.equal(res.candidates.length, 2);
  });

  await t.test('6. Non-matching favorite returns honest not_found result without guessing', () => {
    const res = resolveFavoriteTrack({ query: 'Bohemian Rhapsody', storage });
    assert.equal(res.match, null);
    assert.equal(res.ambiguous, false);
    assert.equal(res.reason, 'not_found');
  });

  await t.test('7. Random favorite selection returns valid playable favorite', () => {
    const res = resolveFavoriteTrack({ random: true, storage });
    assert.ok(res.match);
    assert.ok(sampleFavorites.some((f) => f.id === res.match.id));
  });

  await t.test('8. Most recently liked favorite returns item with latest addedAt', () => {
    const res = resolveFavoriteTrack({ mostRecent: true, storage });
    assert.ok(res.match);
    assert.equal(res.match.title, 'Latest Favorite');
    assert.equal(res.match.addedAt, 5000);
  });

  // ==========================================
  // PART B: Local-first Command Understanding
  // ==========================================

  await t.test('9. Local transport commands (pause, resume, next, previous) execute locally', () => {
    let lastControl = null;
    const env = {
      media: { active: true, status: 'playing', title: 'Test' },
      onControl: (cmd) => { lastControl = cmd; },
      customStorage: storage,
    };

    const resPause = interpretLocalMusicCommand('pause the music', env);
    assert.equal(resPause.handledLocally, true);
    assert.equal(lastControl, 'pause');

    env.media.status = 'paused';
    const resResume = interpretLocalMusicCommand('resume playback', env);
    assert.equal(resResume.handledLocally, true);
    assert.equal(lastControl, 'play');

    const resNext = interpretLocalMusicCommand('play the next song', env);
    assert.equal(resNext.handledLocally, true);
    assert.equal(lastControl, 'next');

    const resPrev = interpretLocalMusicCommand('go back to the previous track', env);
    assert.equal(resPrev.handledLocally, true);
    assert.equal(lastControl, 'previous');
  });

  await t.test('10. "Play [song] from my favorites" resolves locally without Groq chat', () => {
    let openedUrl = null;
    const env = {
      media: { active: false },
      onOpenUrl: (url) => { openedUrl = url; },
      customStorage: storage,
    };

    const res = interpretLocalMusicCommand('Play Attention from my favorites', env);
    assert.equal(res.handledLocally, true);
    assert.equal(res.actionResult.ok, true);
    assert.equal(res.actionResult.track.title, 'Attention');
    assert.equal(openedUrl, 'spotify:search:Attention%20Charlie%20Puth');
  });

  await t.test('11. Conversational speech containing "play" is NOT intercepted as music', () => {
    const resGame = interpretLocalMusicCommand("Let's play a game of chess", { customStorage: storage });
    assert.equal(resGame.handledLocally, false);
    assert.equal(resGame.fallbackToLlm, true);

    const resRole = interpretLocalMusicCommand('She had a major role to play', { customStorage: storage });
    assert.equal(resRole.handledLocally, false);
    assert.equal(resRole.fallbackToLlm, true);
  });

  // ==========================================
  // PART D: YouTube Music vs Apple Music Provider Identity
  // ==========================================

  await t.test('12. detectProvider accurately detects YouTube Music from PWA, URL, and AppUserModelId', () => {
    const pwaMedia = { app: 'Chrome', rawAppId: 'Google.Chrome.cinhimbnkkaohfgiekfkjhmbdcndachm', title: 'Song' };
    assert.equal(detectProvider(pwaMedia), SUPPORTED_PROVIDERS.YOUTUBE);

    const desktopMedia = { app: 'YouTube Music', title: 'Song' };
    assert.equal(detectProvider(desktopMedia), SUPPORTED_PROVIDERS.YOUTUBE);

    const ytIdMedia = { app: 'Edge', youtubeId: 'dQw4w9WgXcQ', title: 'Song' };
    assert.equal(detectProvider(ytIdMedia), SUPPORTED_PROVIDERS.YOUTUBE);

    const appleMedia = { app: 'Apple Music', title: 'Song' };
    assert.equal(detectProvider(appleMedia), SUPPORTED_PROVIDERS.APPLE);
  });

  await t.test('13. enrichTrackMetadata does NOT overwrite song provider to Apple Music', async () => {
    // Calling enrichTrackMetadata fetches artwork info but does not have provider: 'apple'
    // Note: Fetch in offline test will catch gracefully
    const enriched = await enrichTrackMetadata('Test Song', 'Test Artist');
    assert.notEqual(enriched.provider, 'apple');
  });

  await t.test('14. Corrupted YouTube Music favorites with provider: apple are automatically repaired on load', () => {
    const corruptStorage = createMockStorage({
      island_favorites_v2: JSON.stringify([
        {
          id: 'apple:corrupt_song',
          title: 'Corrupt YouTube Song',
          artist: 'Artist',
          provider: 'apple', // Mistakenly labeled as apple
          playableUrl: 'https://music.youtube.com/watch?v=12345678901',
          youtubeId: '12345678901',
          addedAt: 100,
        },
      ]),
    });

    const repaired = getAllFavorites(corruptStorage);
    assert.equal(repaired.length, 1);
    assert.equal(repaired[0].provider, SUPPORTED_PROVIDERS.YOUTUBE);
    assert.ok(repaired[0].playableUrl.includes('music.youtube.com'));
  });

  // ==========================================
  // PART E: Audio Ducking & Volume Coordination
  // ==========================================

  await t.test('15. Volume ownership: user volume is never overwritten by ducking', () => {
    const coordStorage = createMockStorage();
    audioCoordinator.setBaseVolume(0.80);
    assert.equal(audioCoordinator.baseVolume, 0.80);
    assert.equal(audioCoordinator.duckingMultiplier, 1.0);
    assert.equal(audioCoordinator.effectiveVolume, 0.80);

    // Start ducking to 22%
    audioCoordinator.startDucking({ duckLevel: 0.22, durationMs: 0 });
    assert.equal(audioCoordinator.baseVolume, 0.80); // Stays 80%!
    assert.equal(audioCoordinator.duckingMultiplier, 0.22);
    assert.ok(Math.abs(audioCoordinator.effectiveVolume - 0.176) < 0.001); // 0.80 * 0.22 = 0.176

    // User changes base volume while ducked (e.g. from 80% to 50%)
    audioCoordinator.setBaseVolume(0.50);
    assert.equal(audioCoordinator.baseVolume, 0.50);
    // Effective volume updates with current ducking multiplier
    assert.ok(Math.abs(audioCoordinator.effectiveVolume - 0.11) < 0.001); // 0.50 * 0.22 = 0.11

    // Restore volume after speech
    audioCoordinator.restoreVolume({ durationMs: 0 });
    assert.equal(audioCoordinator.baseVolume, 0.50);
    assert.equal(audioCoordinator.duckingMultiplier, 1.0);
    assert.equal(audioCoordinator.effectiveVolume, 0.50); // Restores to NEW volume (0.50)!
  });

  await t.test('16. Interruption and cancellation immediately restores 100% volume multiplier', () => {
    audioCoordinator.setBaseVolume(0.70);
    audioCoordinator.startDucking({ duckLevel: 0.22, durationMs: 0 });
    assert.equal(audioCoordinator.duckState, 'ducked');

    audioCoordinator.cancelDucking();
    assert.equal(audioCoordinator.duckState, 'idle');
    assert.equal(audioCoordinator.duckingMultiplier, 1.0);
    assert.equal(audioCoordinator.effectiveVolume, 0.70);
  });
});
