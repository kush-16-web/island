/**
 * test/pass2-1-playback-provider-repair.test.cjs
 * Comprehensive verification suite for PASS 2.1:
 * Real Favorites Playback, Provider Identity Repair, & Audio Handoff.
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

test('ISLAND — PASS 2.1: Real Favorites Playback & Provider Repair Verification Suite', async (t) => {
  const {
    getAllFavorites,
    addFavorite,
    updateFavorite,
    reconnectFavoriteProvider,
    migrateLegacyFavorites,
    detectProvider,
    isVerifiedYouTube,
    isVerifiedSpotify,
    isVerifiedApple,
    buildPlayableReference,
    createFavoriteId,
    SUPPORTED_PROVIDERS,
    UNIFIED_STORAGE_KEY,
    BACKUP_STORAGE_KEY,
  } = await import('../src/lib/favorites.js');

  const {
    resolveFavoriteTrack,
    cleanSpokenQuery,
    scoreFavoriteCandidate,
  } = await import('../src/lib/favorites-resolver.js');

  const {
    executeMusicAction,
    handlePlaybackExecution,
    playFavoriteTrack,
  } = await import('../src/lib/music-actions.js');

  const {
    interpretLocalMusicCommand,
    sanitizeSpokenInput,
  } = await import('../src/lib/music-command-interpreter.js');

  const {
    getAssistantName,
    setAssistantName,
  } = await import('../src/lib/assistant.js');

  const { audioCoordinator } = await import('../src/lib/audio-coordinator.js');

  // Scenario 1: YouTube Music favorite with exact video ID
  await t.test('1. YouTube Music favorite with exact video ID opens exact track URL', () => {
    const track = {
      id: 'youtube:attention__charlie_puth',
      title: 'Attention',
      artist: 'Charlie Puth',
      provider: SUPPORTED_PROVIDERS.YOUTUBE,
      youtubeId: 'nfs8NYg7yQM',
      playableUrl: 'https://music.youtube.com/watch?v=nfs8NYg7yQM',
    };

    let openedUrl = null;
    let smtcControlled = null;

    const result = handlePlaybackExecution(track, {
      action: 'play_favorite',
      media: { active: false },
      onOpenUrl: (url) => { openedUrl = url; },
      onControl: (cmd) => { smtcControlled = cmd; },
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, 'opened_provider');
    assert.equal(openedUrl, 'https://music.youtube.com/watch?v=nfs8NYg7yQM');
    assert.equal(smtcControlled, null, 'Never sends generic SMTC play for non-current track');
    assert.match(result.spokenConfirmation, /Opening Attention in YouTube Music/i);
  });

  // Scenario 2: Verified Apple Music favorite
  await t.test('2. Verified Apple Music favorite reports honest manual start limitation', () => {
    const verifiedAppleTrack = {
      id: 'apple:attention__charlie_puth',
      title: 'Attention',
      artist: 'Charlie Puth',
      provider: SUPPORTED_PROVIDERS.APPLE,
      rawAppId: 'AppleMusic_8wekyb3d8bbwe!App',
      app: 'Apple Music',
      playableUrl: 'https://music.apple.com/us/album/attention/1228224534?i=1228224541',
    };

    assert.equal(isVerifiedApple(verifiedAppleTrack), true);

    let openedUrl = null;
    const result = handlePlaybackExecution(verifiedAppleTrack, {
      action: 'play_favorite',
      media: { active: false },
      onOpenUrl: (url) => { openedUrl = url; },
    });

    assert.equal(result.ok, false);
    assert.equal(result.reason, 'apple_music_manual_start_required');
    assert.equal(openedUrl, verifiedAppleTrack.playableUrl);
    assert.match(result.spokenConfirmation, /automatic playback is not supported by Apple Music/i);
  });

  // Scenario 3: Corrupted Apple Music label with surviving YouTube ID
  await t.test('3. Corrupted Apple Music label with surviving YouTube ID is auto-repaired to YouTube Music', () => {
    const corruptedTrack = {
      id: 'apple:attention__charlie_puth',
      title: 'Attention',
      artist: 'Charlie Puth',
      provider: 'apple', // Mistakenly labeled as Apple Music
      youtubeId: 'nfs8NYg7yQM', // Surviving evidence
      artwork: 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/cover.jpg',
    };

    const storage = createMockStorage({
      [UNIFIED_STORAGE_KEY]: JSON.stringify([corruptedTrack]),
    });

    const repairedList = migrateLegacyFavorites(storage);
    assert.equal(repairedList.length, 1);
    const repaired = repairedList[0];

    assert.equal(repaired.provider, SUPPORTED_PROVIDERS.YOUTUBE);
    assert.equal(repaired.isAmbiguousSource, false);
    assert.match(repaired.playableUrl, /music\.youtube\.com/);
  });

  // Scenario 4: Corrupted provider label without surviving source evidence
  await t.test('4. Corrupted provider label without surviving evidence is marked ambiguous with non-destructive fallback', () => {
    const ambiguousTrack = {
      id: 'apple:attention__charlie_puth',
      title: 'Attention',
      artist: 'Charlie Puth',
      provider: 'apple', // Corrupted by iTunes artwork search
      artwork: 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/cover.jpg',
      // No youtubeId, no rawAppId, no playableUrl
    };

    const storage = createMockStorage({
      [UNIFIED_STORAGE_KEY]: JSON.stringify([ambiguousTrack]),
    });

    const repairedList = migrateLegacyFavorites(storage);
    const item = repairedList[0];

    assert.equal(item.provider, SUPPORTED_PROVIDERS.UNKNOWN);
    assert.equal(item.isAmbiguousSource, true);
    assert.ok(item.playableUrl, 'Always supplies a resilient playable fallback URL');

    // Executing playback on ambiguous track reports source confirmation needed
    const execRes = handlePlaybackExecution(item, {
      media: { active: false },
      onOpenUrl: () => {},
    });
    assert.equal(execRes.ok, false);
    assert.equal(execRes.reason, 'ambiguous_provider_source');
    assert.match(execRes.spokenConfirmation, /music source needs to be confirmed/i);

    // User re-connects source to YouTube Music
    const reconnected = reconnectFavoriteProvider(item.id, SUPPORTED_PROVIDERS.YOUTUBE, storage);
    assert.equal(reconnected, true);

    const updatedList = getAllFavorites(storage);
    assert.equal(updatedList[0].provider, SUPPORTED_PROVIDERS.YOUTUBE);
    assert.equal(updatedList[0].isAmbiguousSource, false);
  });

  // Scenario 5: Duplicate titles by different artists
  await t.test('5. Duplicate titles by different artists disambiguate accurately without collision', () => {
    const storage = createMockStorage();
    const fav1 = {
      title: 'Attention',
      artist: 'Charlie Puth',
      provider: SUPPORTED_PROVIDERS.YOUTUBE,
      youtubeId: 'nfs8NYg7yQM',
    };
    const fav2 = {
      title: 'Attention',
      artist: 'NewJeans',
      provider: SUPPORTED_PROVIDERS.SPOTIFY,
      providerTrackId: 'spotify:track:2NZNlFmC8jGf4bC7Q4yJ3N',
    };

    addFavorite(fav1, storage);
    addFavorite(fav2, storage);

    // Querying with only title prompts clarification
    const genericRes = resolveFavoriteTrack({ query: 'Attention', title: 'Attention', storage });
    assert.equal(genericRes.ambiguous, true);
    assert.equal(genericRes.candidates.length, 2);

    // Explicit artist resolves unique song
    const puthRes = resolveFavoriteTrack({ query: 'Attention by Charlie Puth', title: 'Attention', artist: 'Charlie Puth', storage });
    assert.equal(puthRes.ambiguous, false);
    assert.equal(puthRes.match.artist, 'Charlie Puth');

    const njRes = resolveFavoriteTrack({ query: 'Attention by NewJeans', title: 'Attention', artist: 'NewJeans', storage });
    assert.equal(njRes.ambiguous, false);
    assert.equal(njRes.match.artist, 'NewJeans');
  });

  // Scenario 6: Favorite without a playable identifier
  await t.test('6. Favorite without a playable identifier is automatically healed with valid playable URL', () => {
    const rawTrack = {
      id: 'youtube:die_for_you__the_weeknd',
      title: 'Die For You',
      artist: 'The Weeknd',
      provider: 'youtube',
      playableUrl: null, // Missing!
    };

    const storage = createMockStorage({
      [UNIFIED_STORAGE_KEY]: JSON.stringify([rawTrack]),
    });

    const list = getAllFavorites(storage);
    assert.ok(list[0].playableUrl, 'Playable URL must not be null');
    assert.match(list[0].playableUrl, /https:\/\/music\.youtube\.com\/search/);
  });

  // Scenario 7: User requests Attention while Pashmina is paused
  await t.test('7. Requesting Attention while Pashmina is paused NEVER unpauses Pashmina', () => {
    const storage = createMockStorage();
    addFavorite({
      title: 'Attention',
      artist: 'Charlie Puth',
      provider: SUPPORTED_PROVIDERS.YOUTUBE,
      youtubeId: 'nfs8NYg7yQM',
    }, storage);

    let smtcActionSent = null;
    let urlOpened = null;

    // Active session has Pashmina paused
    const mediaEnv = {
      media: { active: true, title: 'Pashmina', artist: 'Amit Trivedi', status: 'paused' },
      onControl: (act) => { smtcActionSent = act; },
      onOpenUrl: (url) => { urlOpened = url; },
      customStorage: storage,
    };

    const parsed = interpretLocalMusicCommand('play Attention', mediaEnv);
    assert.equal(parsed.handledLocally, true);
    assert.equal(parsed.actionResult.ok, true);
    assert.equal(smtcActionSent, null, 'Must NOT send SMTC play to unpause unrelated song!');
    assert.match(urlOpened, /music\.youtube\.com/);
  });

  // Scenario 8: Favorite resolver preserves selected track identity
  await t.test('8. Local interpreter preserves full resolved favorite identity through pipeline', () => {
    const storage = createMockStorage();
    const specificTrack = {
      id: 'youtube:die_for_you_remix__the_weeknd',
      title: 'Die For You (Remix)',
      artist: 'The Weeknd ft. Ariana Grande',
      provider: SUPPORTED_PROVIDERS.YOUTUBE,
      youtubeId: 'remixVideoId',
    };
    addFavorite(specificTrack, storage);

    let openedUrl = null;
    const mediaEnv = {
      media: { active: false },
      onOpenUrl: (u) => { openedUrl = u; },
      customStorage: storage,
    };

    const res = interpretLocalMusicCommand('play Die For You Remix', mediaEnv);
    assert.equal(res.handledLocally, true);
    assert.equal(res.actionResult.ok, true);
    assert.equal(res.actionResult.track.title, 'Die For You (Remix)');
    assert.equal(res.actionResult.track.artist, 'The Weeknd ft. Ariana Grande');
    assert.equal(openedUrl, 'https://music.youtube.com/watch?v=remixVideoId');
  });

  // Scenario 9: Generic SMTC Play never substitutes for track selection
  await t.test('9. SMTC play is ONLY sent when requested track IS the currently active track', () => {
    const currentTrack = {
      title: 'Attention',
      artist: 'Charlie Puth',
      provider: SUPPORTED_PROVIDERS.YOUTUBE,
    };

    let smtcAction = null;
    // When track is current and paused
    const res = handlePlaybackExecution(currentTrack, {
      media: { active: true, title: 'Attention', artist: 'Charlie Puth', status: 'paused' },
      onControl: (cmd) => { smtcAction = cmd; },
      onOpenUrl: () => {},
    });

    assert.equal(res.ok, true);
    assert.equal(res.status, 'resumed_current');
    assert.equal(smtcAction, 'play');
  });

  // Scenario 10: Provider launch without confirmed playback
  await t.test('10. Provider launch without confirmed playback reports honest opening confirmation', () => {
    const track = {
      title: 'Attention',
      artist: 'Charlie Puth',
      provider: SUPPORTED_PROVIDERS.YOUTUBE,
      playableUrl: 'https://music.youtube.com/watch?v=nfs8NYg7yQM',
    };

    const res = handlePlaybackExecution(track, {
      media: { active: false },
      onOpenUrl: () => {},
    });

    assert.equal(res.status, 'opened_provider');
    assert.doesNotMatch(res.spokenConfirmation, /^Playing Attention/);
    assert.match(res.spokenConfirmation, /^Opening Attention in YouTube Music/);
  });

  // Scenario 11: Manual Favorites play button and assistant use the same action
  await t.test('11. Manual Favorites playback calls the authoritative playFavoriteTrack pipeline', () => {
    const track = {
      title: 'Attention',
      artist: 'Charlie Puth',
      provider: SUPPORTED_PROVIDERS.YOUTUBE,
      playableUrl: 'https://music.youtube.com/watch?v=nfs8NYg7yQM',
    };

    let opened = null;
    const manualRes = playFavoriteTrack(track, {
      media: { active: false },
      onOpenUrl: (u) => { opened = u; },
    });

    const voiceRes = executeMusicAction({ action: 'play_favorite', track }, {
      media: { active: false },
      onOpenUrl: () => {},
    });

    assert.equal(manualRes.status, voiceRes.status);
    assert.equal(manualRes.spokenConfirmation, voiceRes.spokenConfirmation);
    assert.equal(opened, track.playableUrl);
  });

  // Scenario 12: Existing favorites remain intact after repair
  await t.test('12. Existing favorites store is backed up and preserves all entries after migration', () => {
    const initialList = [
      { id: '1', title: 'Song One', artist: 'Artist A', provider: 'youtube', addedAt: 12345, playableUrl: 'https://music.youtube.com/1' },
      { id: '2', title: 'Song Two', artist: 'Artist B', provider: 'spotify', addedAt: 12346, playableUrl: 'spotify:search:Song%20Two' },
    ];
    const storage = createMockStorage({
      [UNIFIED_STORAGE_KEY]: JSON.stringify(initialList),
    });

    const migrated = migrateLegacyFavorites(storage);
    assert.equal(migrated.length, 2);
    assert.ok(storage.getItem(BACKUP_STORAGE_KEY), 'Backup key must be populated');
    assert.equal(migrated[0].title, 'Song One');
    assert.equal(migrated[1].title, 'Song Two');
    assert.equal(migrated[0].addedAt, 12345);
  });

  // Scenario 13: Assistant display-name changes do not break commands
  await t.test('13. Assistant display name changes dynamically without hardcoded names', () => {
    // Test with configured name "Nova"
    setAssistantName('Nova');
    assert.equal(getAssistantName(), 'Nova');
    const inputNova = sanitizeSpokenInput('Hey Nova, please play Attention');
    assert.equal(inputNova.toLowerCase(), 'play attention');

    // Test with configured name "Aria"
    setAssistantName('Aria');
    assert.equal(getAssistantName(), 'Aria');
    const inputAria = sanitizeSpokenInput('Aria can you pause the music');
    assert.equal(inputAria.toLowerCase(), 'pause the music');

    // Restore default
    setAssistantName('Nova');
  });

  // Scenario 14: Correct Now Playing navigation
  await t.test('14. show_favorites opens library view mode cleanly', () => {
    const storage = createMockStorage();
    addFavorite({ title: 'Attention', artist: 'Charlie Puth', provider: 'youtube' }, storage);

    const res = executeMusicAction({ action: 'show_favorites' }, { customStorage: storage });
    assert.equal(res.ok, true);
    assert.equal(res.action, 'show_favorites');
    assert.equal(res.count, 1);
    assert.match(res.spokenConfirmation, /Opening your favorites/);
  });

  // Scenario 15: External audio ducking does not alter Windows master volume
  await t.test('15. Audio coordinator ducking controls internal multiplier without touching OS master volume', () => {
    audioCoordinator.setBaseVolume(0.85);
    assert.equal(audioCoordinator.baseVolume, 0.85);

    audioCoordinator.startDucking({ duckLevel: 0.22, durationMs: 0 });
    assert.equal(audioCoordinator.duckState, 'ducked');
    assert.equal(audioCoordinator.duckingMultiplier, 0.22);
    assert.equal(audioCoordinator.baseVolume, 0.85, 'User base volume must remain completely untouched');

    audioCoordinator.restoreVolume({ durationMs: 0 });
    assert.equal(audioCoordinator.duckState, 'idle');
    assert.equal(audioCoordinator.duckingMultiplier, 1.0);
    assert.equal(audioCoordinator.effectiveVolume, 0.85);
  });
});
