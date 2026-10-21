'use strict';
/**
 * test/unified-favorites-jadu.test.cjs
 * Comprehensive offline test suite for:
 * - Unified Multi-Provider Favorites Architecture (Part 2 & 3)
 * - Idempotent Migration from legacy island_fav_tracks to island_favorites_v2
 * - Jadu Attention/Pashmina Playback Recovery & Honest Status Reporting (Part 1 & 4)
 * - Provider Filtering & Non-colliding Identifiers
 * - Kokoro Offline Safety, Cancellation, and No Silent Cloud Fallback (Part 5)
 *
 * STRICT ZERO CLOUD API CALLS.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

async function loadModules() {
  const favorites = await import('../src/lib/favorites.js');
  const musicActions = await import('../src/lib/music-actions.js');
  const voiceIntent = await import('../src/lib/voice-intent.js');
  const { KokoroLocalService } = require('../electron/kokoro-tts.js');
  return { ...favorites, ...musicActions, ...voiceIntent, KokoroLocalService };
}

function createMockStorage(initial = {}) {
  let store = { ...initial };
  return {
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, val) => {
      store[key] = String(val);
    },
    removeItem: (key) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    _getRaw: () => store,
  };
}

test('Unified Favorites & Jadu Recovery Test Suite', async (t) => {
  const {
    SUPPORTED_PROVIDERS,
    detectProvider,
    createFavoriteId,
    buildPlayableReference,
    migrateLegacyFavorites,
    getAllFavorites,
    addFavorite,
    removeFavorite,
    isTrackFavorite,
    executeMusicAction,
    processTurnIntent,
    KokoroLocalService,
  } = await loadModules();

  await t.test('1. Provider detection accurately classifies media metadata', () => {
    assert.equal(detectProvider({ app: 'Spotify', title: 'Song' }), SUPPORTED_PROVIDERS.SPOTIFY);
    assert.equal(detectProvider({ app: 'Chrome', title: 'Song - YouTube Music' }), SUPPORTED_PROVIDERS.YOUTUBE);
    assert.equal(detectProvider({ app: 'msedge', title: 'Song | YouTube Music' }), SUPPORTED_PROVIDERS.YOUTUBE);
    assert.equal(detectProvider({ app: 'Apple Music', title: 'Song' }), SUPPORTED_PROVIDERS.APPLE);
    assert.equal(detectProvider({ app: 'VLC', title: 'Local Audio' }), SUPPORTED_PROVIDERS.LOCAL);
    assert.equal(detectProvider({ title: 'Generic Track' }), SUPPORTED_PROVIDERS.GENERIC);
  });

  await t.test('2. Multi-provider identity: identical titles on different services do NOT collide', () => {
    const spotifyId = createFavoriteId('Attention', 'Charlie Puth', SUPPORTED_PROVIDERS.SPOTIFY);
    const youtubeId = createFavoriteId('Attention', 'Charlie Puth', SUPPORTED_PROVIDERS.YOUTUBE);
    const appleId = createFavoriteId('Attention', 'Charlie Puth', SUPPORTED_PROVIDERS.APPLE);

    assert.notEqual(spotifyId, youtubeId);
    assert.notEqual(spotifyId, appleId);
    assert.notEqual(youtubeId, appleId);
    assert.ok(spotifyId.startsWith('spotify:'));
    assert.ok(youtubeId.startsWith('youtube:'));
  });

  await t.test('3. Idempotent migration preserves legacy records without loss or duplicates', () => {
    const storage = createMockStorage({
      island_fav_tracks: JSON.stringify({
        'Pashmina|Amit Trivedi': { title: 'Pashmina', artist: 'Amit Trivedi' },
        'Attention|Charlie Puth': { title: 'Attention', artist: 'Charlie Puth' },
      }),
    });

    // First migration pass
    const pass1 = migrateLegacyFavorites(storage);
    assert.equal(pass1.length, 2);
    assert.ok(pass1.some((f) => f.title === 'Pashmina'));
    assert.ok(pass1.some((f) => f.title === 'Attention'));

    // Second migration pass must be strictly idempotent
    const pass2 = migrateLegacyFavorites(storage);
    assert.equal(pass2.length, 2);

    // Stored unified format
    const all = getAllFavorites(storage);
    assert.equal(all.length, 2);
    assert.ok(all[0].id);
    assert.ok(all[0].playableUrl);
  });

  await t.test('4. Add and remove favorite updates unified store and legacy map', () => {
    const storage = createMockStorage();

    const track = {
      title: 'Starboy',
      artist: 'The Weeknd',
      app: 'Spotify',
      album: 'Starboy',
    };

    assert.equal(isTrackFavorite(track, storage), false);

    // Add
    const added = addFavorite(track, storage);
    assert.equal(added.title, 'Starboy');
    assert.equal(added.provider, SUPPORTED_PROVIDERS.SPOTIFY);
    assert.equal(isTrackFavorite(track, storage), true);

    // Verify stored
    const list = getAllFavorites(storage);
    assert.equal(list.length, 1);
    assert.equal(list[0].provider, SUPPORTED_PROVIDERS.SPOTIFY);

    // Remove
    const removed = removeFavorite(track, storage);
    assert.equal(removed, true);
    assert.equal(isTrackFavorite(track, storage), false);
    assert.equal(getAllFavorites(storage).length, 0);
  });

  await t.test('5. Attention vs Pashmina diagnosis: Jadu never falsely resumes Pashmina when Attention is requested', () => {
    const storage = createMockStorage({
      island_favorites_v2: JSON.stringify([
        {
          id: 'spotify:attention__charlie_puth',
          title: 'Attention',
          artist: 'Charlie Puth',
          provider: 'spotify',
          playableUrl: 'spotify:search:Attention%20Charlie%20Puth',
        },
        {
          id: 'spotify:pashmina__amit_trivedi',
          title: 'Pashmina',
          artist: 'Amit Trivedi',
          provider: 'spotify',
          playableUrl: 'spotify:search:Pashmina%20Amit%20Trivedi',
        },
      ]),
    });

    let smtcControlCalled = null;
    let providerUrlOpened = null;

    const env = {
      media: {
        active: true,
        title: 'Pashmina',
        artist: 'Amit Trivedi',
        status: 'playing',
      },
      onControl: (act) => {
        smtcControlCalled = act;
      },
      onOpenUrl: (url) => {
        providerUrlOpened = url;
      },
      customStorage: storage,
    };

    // User asks for "Attention"
    const result = executeMusicAction({ action: 'play_favorite', query: 'Attention' }, env);

    assert.equal(result.ok, true);
    assert.equal(result.track.title, 'Attention');
    // SMTC play MUST NOT be called! If it were called, Pashmina would continue playing!
    assert.equal(smtcControlCalled, null);
    // Instead, the provider URI must be dispatched:
    assert.equal(providerUrlOpened, 'spotify:search:Attention%20Charlie%20Puth');
    // Spoken confirmation must state the truth:
    assert.match(result.spokenConfirmation, /Opening Attention in Spotify/i);
  });

  await t.test('6. Jadu resumes SMTC only when requested song IS the current session', () => {
    const storage = createMockStorage({
      island_favorites_v2: JSON.stringify([
        {
          id: 'spotify:attention__charlie_puth',
          title: 'Attention',
          artist: 'Charlie Puth',
          provider: 'spotify',
        },
      ]),
    });

    let smtcControlCalled = null;
    const env = {
      media: {
        active: true,
        title: 'Attention',
        artist: 'Charlie Puth',
        status: 'paused',
      },
      onControl: (act) => {
        smtcControlCalled = act;
      },
      customStorage: storage,
    };

    const result = executeMusicAction({ action: 'play_favorite', query: 'Attention' }, env);
    assert.equal(result.ok, true);
    assert.equal(smtcControlCalled, 'play');
    assert.match(result.spokenConfirmation, /Resuming Attention by Charlie Puth/i);
  });

  await t.test('7. Provider filtering: "play my spotify favorites" filters accurately', () => {
    const storage = createMockStorage({
      island_favorites_v2: JSON.stringify([
        {
          id: 'spotify:track1__artist',
          title: 'Spotify Track',
          artist: 'Artist',
          provider: 'spotify',
          playableUrl: 'spotify:search:Spotify%20Track',
        },
        {
          id: 'youtube:track2__artist',
          title: 'YouTube Track',
          artist: 'Artist',
          provider: 'youtube',
          playableUrl: 'https://music.youtube.com/search?q=YouTube%20Track',
        },
      ]),
    });

    let openedUrl = null;
    const env = {
      media: { active: false },
      onControl: () => {},
      onOpenUrl: (url) => {
        openedUrl = url;
      },
      customStorage: storage,
    };

    const result = executeMusicAction({ action: 'play_favorite', query: 'play my spotify favorites' }, env);
    assert.equal(result.ok, true);
    assert.equal(result.track.title, 'Spotify Track');
    assert.equal(result.track.provider, 'spotify');
    assert.ok(openedUrl.startsWith('spotify:'));
  });

  await t.test('8. show_favorites action opens native library and reports count', () => {
    const storage = createMockStorage({
      island_favorites_v2: JSON.stringify([
        { id: '1', title: 'Song 1', artist: 'Artist 1', provider: 'spotify' },
        { id: '2', title: 'Song 2', artist: 'Artist 2', provider: 'youtube' },
      ]),
    });

    const result = executeMusicAction({ action: 'show_favorites' }, { customStorage: storage });
    assert.equal(result.ok, true);
    assert.equal(result.action, 'show_favorites');
    assert.equal(result.count, 2);
    assert.match(result.spokenConfirmation, /Opening your favorites.*2 saved songs/i);
  });

  await t.test('9. Kokoro isolation: model weights require explicit setup, no auto-downloads', async () => {
    const kokoro = new KokoroLocalService();
    const status = kokoro.getStatus();

    assert.equal(status.installed, false);
    assert.equal(status.isLoaded, false);

    // Loading without weights returns a graceful error, zero auto-download
    const loadRes = await kokoro.loadModel();
    assert.equal(loadRes.ok, false);
    assert.match(loadRes.error, /not installed/i);
  });
});
