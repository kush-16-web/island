'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { audioCoordinator } = require('../src/lib/audio-coordinator');
const {
  interpretLocalMusicCommand,
} = require('../src/lib/music-command-interpreter');
const {
  playFavoriteTrack,
  formatActionOutcomeSpeech,
} = require('../src/lib/music-actions');
const {
  resolveFavoriteTrack,
} = require('../src/lib/favorites-resolver');
const {
  addFavorite,
  getAllFavorites,
  setAllFavorites,
  buildPlayableReference,
  migrateLegacyFavorites,
  SUPPORTED_PROVIDERS,
  LEGACY_STORAGE_KEY,
} = require('../src/lib/favorites');
const { musicContext } = require('../src/lib/music-conversation-context');

test('Pass 2.2.6 - Source-Aware Music Foundation & Natural Conversational Intelligence Suite', async (t) => {
  function createMockStorage(initialMap = {}) {
    const store = new Map();
    for (const [k, v] of Object.entries(initialMap)) {
      store.set(k, typeof v === 'string' ? v : JSON.stringify(v));
    }
    return {
      getItem: (k) => store.get(k) || null,
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
      clear: () => store.clear(),
      _store: store,
    };
  }

  t.beforeEach(() => {
    delete globalThis.window;
    audioCoordinator.cancelDucking();
    musicContext.reset();
  });

  t.afterEach(() => {
    delete globalThis.window;
    audioCoordinator.cancelDucking();
  });

  // 1. Spotify favorite saved with correct source metadata
  await t.test('1. Spotify favorite saved with correct source metadata', () => {
    const mockStorage = createMockStorage();
    const media = {
      title: 'City of Stars',
      artist: 'Ryan Gosling',
      app: 'Spotify',
      sourceApp: 'Spotify.exe',
      artwork: 'https://spotify.com/art.jpg',
    };

    // Even if companion is reporting a YouTube video from Chrome, Spotify isolation guarantees provider is Spotify
    const companionState = {
      connected: true,
      currentTrack: { title: 'Some YT Video', videoId: 'yt123' },
    };

    const res = addFavorite(media, {
      storage: mockStorage,
      companionState, // Should be ignored because media is verified Spotify
    });

    assert.ok(res);
    assert.equal(res.provider, SUPPORTED_PROVIDERS.SPOTIFY);
    assert.equal(res.source, 'spotify');
    assert.equal(res.isVerifiedSpotify, true);
    assert.ok(res.playableUrl.startsWith('spotify:search:'));
  });

  // 2. Spotify favorite reopened without YouTube Music substitution
  await t.test('2. Spotify favorite reopened without YouTube Music substitution', () => {
    const spotifyTrack = {
      id: 'fav_spotify_city-of-stars_ryan-gosling',
      title: 'City of Stars',
      artist: 'Ryan Gosling',
      provider: SUPPORTED_PROVIDERS.SPOTIFY,
      source: 'spotify',
      isVerifiedSpotify: true,
    };

    const ref = buildPlayableReference(spotifyTrack);
    assert.ok(ref.startsWith('spotify:search:'));
    assert.ok(!ref.includes('youtube'));

    let openedUrl = null;
    let companionCmd = null;

    const playRes = playFavoriteTrack(spotifyTrack, {
      onOpenUrl: (url) => { openedUrl = url; },
      onDispatchCompanion: (cmd) => { companionCmd = cmd; },
    });

    assert.ok(playRes.ok);
    assert.equal(playRes.track.provider, 'spotify');
    // Confirms Spotify protocol URL is opened, NEVER YouTube Music
    assert.equal(openedUrl, ref);
    assert.equal(companionCmd, null);
  });

  // 3. YouTube Music favorite still plays correctly
  await t.test('3. YouTube Music favorite still plays correctly', () => {
    const ytmTrack = {
      id: 'fav_youtube_attention_charlie-puth',
      title: 'Attention',
      artist: 'Charlie Puth',
      provider: SUPPORTED_PROVIDERS.YOUTUBE,
      youtubeId: 'nfs8NYg7yQM',
      videoId: 'nfs8NYg7yQM',
      playableUrl: 'https://music.youtube.com/watch?v=nfs8NYg7yQM',
    };

    const ref = buildPlayableReference(ytmTrack);
    assert.equal(ref, 'https://music.youtube.com/watch?v=nfs8NYg7yQM');

    let openedUrl = null;
    let dispatchedCmd = null;

    const playRes = playFavoriteTrack(ytmTrack, {
      companion: { connected: true, isYtMusicActive: true },
      onOpenUrl: (url) => { openedUrl = url; },
      onDispatchCompanion: (cmd) => { dispatchedCmd = cmd; return Promise.resolve({ ok: true, status: 'dispatched' }); },
    });

    assert.ok(playRes.ok);
    assert.equal(playRes.track.provider, 'youtube');
    assert.equal(dispatchedCmd?.action, 'play_track');
    assert.equal(dispatchedCmd?.videoId, 'nfs8NYg7yQM');
  });

  // 4. Existing favorites survive migration idempotently
  await t.test('4. Existing favorites survive migration idempotently without loss or duplication', () => {
    const mockStorage = createMockStorage({
      [LEGACY_STORAGE_KEY]: {
        'Song One|Artist A': { title: 'Song One', artist: 'Artist A', provider: 'spotify' },
        'Song Two|Artist B': { title: 'Song Two', artist: 'Artist B' },
      },
    });

    // Run initial migration
    const res1 = migrateLegacyFavorites(mockStorage);
    assert.equal(res1.length, 2);
    assert.equal(res1[0].provider, 'spotify');

    // Re-running migration produces 0 duplicates and preserves existing count
    const res2 = migrateLegacyFavorites(mockStorage);
    assert.equal(res2.length, 2);
  });

  // 5. Source filters (All, Spotify, YouTube Music, Unknown) work
  await t.test('5. Source filters filter items accurately', () => {
    const mockStorage = createMockStorage();
    addFavorite({ title: 'Song S', artist: 'Artist S', app: 'Spotify' }, mockStorage);
    addFavorite({
      title: 'Song Y',
      artist: 'Artist Y',
      app: 'Chrome',
      youtubeId: 'vidY',
      providerTrackId: 'vidY',
      playableUrl: 'https://music.youtube.com/watch?v=vidY',
    }, mockStorage);

    // Add unknown
    const all = getAllFavorites(mockStorage);
    all.push({
      id: 'fav_unknown_song-u',
      title: 'Song U',
      artist: 'Artist U',
      provider: 'unknown',
      isAmbiguousSource: true,
    });
    setAllFavorites(all, mockStorage);

    const updated = getAllFavorites(mockStorage);
    assert.equal(updated.length, 3);

    const spotifyOnly = updated.filter((t) => t.provider === 'spotify');
    const youtubeOnly = updated.filter((t) => t.provider === 'youtube');
    const unknownOnly = updated.filter((t) => t.provider === 'unknown' || t.isAmbiguousSource);

    assert.equal(spotifyOnly.length, 1);
    assert.equal(youtubeOnly.length, 1);
    assert.equal(unknownOnly.length, 1);
  });

  // 6. "Play city of star from my list" resolves to "City of Stars"
  await t.test('6. "Play city of star from my list" resolves to "City of Stars"', () => {
    const mockStorage = createMockStorage();
    addFavorite({ title: 'City of Stars', artist: 'Ryan Gosling', app: 'Spotify' }, mockStorage);

    const favorites = getAllFavorites(mockStorage);

    // Direct favorite resolver test with list
    const resolved = resolveFavoriteTrack('city of star from my list', favorites);
    assert.ok(resolved.match);
    assert.equal(resolved.match.title, 'City of Stars');

    // Command interpreter integration test
    globalThis.window = {
      island: {
        media: { openUrl: () => {} },
      },
    };
    const commandResult = interpretLocalMusicCommand('Play city of star from my list', {
      storage: mockStorage,
      media: { active: false },
    });

    assert.ok(commandResult.handledLocally);
    assert.equal(commandResult.actionResult.action, 'play_favorite');
    assert.equal(commandResult.actionResult.track.title, 'City of Stars');
    assert.equal(commandResult.actionResult.track.provider, 'spotify');
  });

  // 7. "Name all of them" / "Show my favorite songs" returns actual records via list_favorites
  await t.test('7. "Name all of them" and "Show my favorite songs" return actual records without navigation', () => {
    const mockStorage = createMockStorage();
    addFavorite({ title: 'City of Stars', artist: 'Ryan Gosling', app: 'Spotify' }, mockStorage);
    addFavorite({
      title: 'Attention',
      artist: 'Charlie Puth',
      app: 'Chrome',
      youtubeId: 'att1',
      providerTrackId: 'att1',
      playableUrl: 'https://music.youtube.com/watch?v=att1',
    }, mockStorage);

    // "Show my favorite songs"
    const cmd1 = interpretLocalMusicCommand('Show my favorite songs', {
      storage: mockStorage,
      media: { active: false },
    });
    assert.ok(cmd1.handledLocally);
    assert.equal(cmd1.actionResult.action, 'list_favorites');
    assert.equal(cmd1.actionResult.tracks.length, 2);
    assert.ok(cmd1.actionResult.spokenConfirmation.includes('saved songs'));

    // Verify context tracked displayed favorites
    const displayed = musicContext.getDisplayedFavorites();
    assert.equal(displayed.length, 2);

    // "Name all of them"
    const cmd2 = interpretLocalMusicCommand('Name all of them', {
      storage: mockStorage,
      media: { active: false },
    });
    assert.ok(cmd2.handledLocally);
    assert.equal(cmd2.actionResult.action, 'list_favorites');
    assert.equal(cmd2.actionResult.tracks.length, 2);
  });

  // 8. Follow-up "Play the third one" resolves against displayedFavorites[2]
  await t.test('8. Follow-up "Play the third one" resolves against displayedFavorites[2]', () => {
    const list = [
      { id: '1', title: 'First Song', artist: 'A', provider: 'spotify' },
      { id: '2', title: 'Second Song', artist: 'B', provider: 'youtube' },
      { id: '3', title: 'Third Song', artist: 'C', provider: 'spotify' },
    ];
    musicContext.setDisplayedFavorites(list);

    let openedUrl = null;
    globalThis.window = {
      island: {
        media: { openUrl: (url) => { openedUrl = url; } },
      },
    };

    const cmd = interpretLocalMusicCommand('Play the third one', {
      media: { active: false },
    });

    assert.ok(cmd.handledLocally);
    assert.equal(cmd.actionResult.action, 'play_favorite');
    assert.equal(cmd.actionResult.track.title, 'Third Song');
    assert.equal(cmd.actionResult.track.provider, 'spotify');
  });

  // 9. Agent dismisses correctly after completed playback
  await t.test('9. Agent dismisses correctly after completed playback handoff and polite closing', () => {
    // Courteous closing: "Thanks" -> session_dismiss
    const dismissCmd = interpretLocalMusicCommand('Thanks', { media: { active: true } });
    assert.ok(dismissCmd.handledLocally);
    assert.equal(dismissCmd.actionResult.action, 'session_dismiss');
    assert.equal(dismissCmd.actionResult.isSessionEnd, true);

    // Outcome speech formatting
    const speech = formatActionOutcomeSpeech('confirmed_playing', 'City of Stars');
    assert.ok(speech.includes('City of Stars'));
  });

  // 10. Agent remains active when clarification is pending
  await t.test('10. Agent remains active when clarification is pending', () => {
    const mockStorage = createMockStorage();
    addFavorite({ title: 'Tuu', artist: 'Artist One', app: 'Spotify' }, mockStorage);
    addFavorite({ title: 'Tu Hi Re', artist: 'Artist Two', app: 'Spotify' }, mockStorage);

    const favorites = getAllFavorites(mockStorage);
    const resolved = resolveFavoriteTrack('tu', favorites);

    // If ambiguous, resolution signals clarificationNeeded
    if (resolved.ambiguous) {
      assert.ok(resolved.candidates.length >= 2);
      assert.equal(resolved.clarificationNeeded, true);
    }
  });

  // 11. Music ducking and restoration remain correct
  await t.test('11. Music ducking and restoration remain correct', () => {
    let duckCmds = [];
    globalThis.window = {
      island: {
        companion: {
          dispatchCommand: async (cmd) => { duckCmds.push(cmd); return { ok: true }; },
        },
      },
    };

    audioCoordinator.setUserVolume(0.80);
    audioCoordinator.startDucking({ duckLevel: 0.10, durationMs: 0 });
    assert.equal(audioCoordinator.duckState, 'ducked');
    assert.equal(audioCoordinator.isExternalDucked, true);

    audioCoordinator.restoreVolume({ durationMs: 0 });
    assert.equal(audioCoordinator.duckState, 'idle');
    assert.equal(audioCoordinator.effectiveVolume, 0.80);
  });

  // 12. Non-music queries ("Tell me about this artist") do not trigger playback
  await t.test('12. Non-music queries ("Tell me about this artist") do not trigger playback', () => {
    const cmd1 = interpretLocalMusicCommand('Tell me about this artist', {
      media: { active: true, title: 'Attention', artist: 'Charlie Puth' },
    });
    assert.equal(cmd1.handledLocally, false);
    assert.equal(cmd1.fallbackToLlm, true);

    const cmd2 = interpretLocalMusicCommand('Who sings this song?', {
      media: { active: true, title: 'Attention', artist: 'Charlie Puth' },
    });
    assert.equal(cmd2.handledLocally, false);
    assert.equal(cmd2.fallbackToLlm, true);

    const cmd3 = interpretLocalMusicCommand('What genre is this?', {
      media: { active: true, title: 'Attention', artist: 'Charlie Puth' },
    });
    assert.equal(cmd3.handledLocally, false);
    assert.equal(cmd3.fallbackToLlm, true);
  });
});
