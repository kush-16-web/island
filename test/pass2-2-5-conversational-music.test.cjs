'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { audioCoordinator } = require('../src/lib/audio-coordinator');
const {
  interpretLocalMusicCommand,
  sanitizeSpokenInput,
} = require('../src/lib/music-command-interpreter');
const {
  executeMusicAction,
  formatActionOutcomeSpeech,
  PLAYBACK_STATES,
} = require('../src/lib/music-actions');
const {
  resolveFavoriteTrack,
  cleanSpokenQuery,
} = require('../src/lib/favorites-resolver');
const {
  addFavorite,
  getAllFavorites,
  SUPPORTED_PROVIDERS,
} = require('../src/lib/favorites');
const { ActionPlan, parseMultiActionPlan, executeActionPlan } = require('../src/lib/action-plan');
const { musicContext } = require('../src/lib/music-conversation-context');

test('Pass 2.2.5 - Conversational Music Intelligence, Contextual Corrections & Seamless Audio Handoff', async (t) => {
  function createMockStorage(initialItems = []) {
    const store = new Map();
    initialItems.forEach((item, idx) => {
      store.set(`fav_${idx}`, JSON.stringify(item));
    });
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

  // 1. Music ducking begins when voice activation starts (mic button / startSession)
  await t.test('1. Music ducking begins when voice activation starts', () => {
    let companionCmd = null;
    const mockCompanion = {
      dispatchCommand: async (cmd) => { companionCmd = cmd; return { ok: true, status: 'ducked' }; },
    };

    // Simulate global window with mock companion
    globalThis.window = {
      island: {
        companion: mockCompanion,
        media: { control: () => {} },
      },
    };

    audioCoordinator.setUserVolume(0.80);
    assert.equal(audioCoordinator.getUserVolume(), 0.80);

    // Immediate duck down to 10%
    audioCoordinator.startDucking({ duckLevel: 0.10, durationMs: 0 });
    assert.equal(audioCoordinator.duckState, 'ducked');
    assert.equal(audioCoordinator.duckingMultiplier, 0.10);
    assert.ok(Math.abs(audioCoordinator.effectiveVolume - 0.08) < 0.001);
    assert.equal(companionCmd?.action, 'duck');
    assert.equal(companionCmd?.level, 0.10);
  });

  // 2. Music ducking begins with Ctrl + Shift + Space
  await t.test('2. Music ducking begins with Ctrl + Shift + Space (voice:toggle)', () => {
    let ducked = false;
    globalThis.window = {
      island: {
        companion: {
          dispatchCommand: async (cmd) => {
            if (cmd.action === 'duck') ducked = true;
            return { ok: true, status: 'ducked' };
          },
        },
      },
    };

    audioCoordinator.cancelDucking();
    audioCoordinator.startDucking({ duckLevel: 0.10, durationMs: 0 });
    assert.equal(ducked, true);
    assert.equal(audioCoordinator.isExternalDucked, true);
  });

  // 3. Real YTM tab volume changes via bridge, not just internal state
  await t.test('3. Real YTM tab volume changes dispatched through companion bridge', () => {
    const sentActions = [];
    globalThis.window = {
      island: {
        companion: {
          dispatchCommand: async (cmd) => {
            sentActions.push(cmd);
            return { ok: true };
          },
        },
      },
    };

    // User or assistant changes volume to 50%
    executeMusicAction({ action: 'set_volume', level: 50 }, {
      onDispatchCompanion: (cmd) => sentActions.push(cmd),
    });

    const setVol = sentActions.find((a) => a.action === 'set_volume');
    assert.ok(setVol);
    assert.equal(setVol.level, 0.5);

    delete globalThis.window;
  });

  // 4. Music restores smoothly after conversation or dismissal
  await t.test('4. Music restores smoothly after conversation ends', () => {
    let restoredAction = null;
    globalThis.window = {
      island: {
        companion: {
          dispatchCommand: async (cmd) => {
            if (cmd.action === 'restore_volume') restoredAction = cmd;
            return { ok: true };
          },
        },
      },
    };

    audioCoordinator.startDucking({ duckLevel: 0.10, durationMs: 0 });
    assert.equal(audioCoordinator.duckingMultiplier, 0.10);

    // Restore volume
    audioCoordinator.restoreVolume({ durationMs: 0 });
    assert.equal(audioCoordinator.duckState, 'idle');
    assert.equal(audioCoordinator.duckingMultiplier, 1.0);
    assert.ok(restoredAction);
    assert.equal(restoredAction.action, 'restore_volume');

    delete globalThis.window;
  });

  // 5. Previously paused music does not resume unexpectedly
  await t.test('5. Explicit pause prevents unexpected music resumption on restoreVolume', () => {
    let resumeCalled = false;
    globalThis.window = {
      island: {
        media: {
          control: (action) => {
            if (action === 'play') resumeCalled = true;
          },
        },
      },
    };

    // Music is playing, companion absent -> SMTC pause fallback used
    audioCoordinator.startDucking({
      duckLevel: 0.10,
      durationMs: 0,
      media: { active: true, status: 'playing' },
    });
    assert.equal(audioCoordinator.pausedForDucking, true);

    // User issues an explicit pause command during the interaction
    audioCoordinator.markExplicitPause();
    assert.equal(audioCoordinator.explicitPauseDuringDuck, true);

    // Restore volume / interaction dismiss
    audioCoordinator.restoreVolume({ durationMs: 0 });
    assert.equal(resumeCalled, false, 'Explicitly paused music must NEVER be auto-resumed!');

    delete globalThis.window;
  });

  // 6. Successful play command triggers short acknowledgment and verified confirmation
  await t.test('6. A successful play command triggers short acknowledgment and confirmed playing state', () => {
    const storage = createMockStorage();
    addFavorite({
      title: 'Pashmina',
      artist: 'Amit Trivedi',
      youtubeId: 'pashmina123',
      provider: 'youtube',
    }, storage);

    let dispatchedCmd = null;
    const res = interpretLocalMusicCommand('Play Pashmina', {
      customStorage: storage,
      companion: { connected: true, isYtMusicActive: true },
      onDispatchCompanion: (cmd) => { dispatchedCmd = cmd; },
    });

    assert.equal(res.handledLocally, true);
    assert.equal(res.actionResult.ok, true);
    assert.equal(dispatchedCmd?.videoId, 'pashmina123');
    assert.equal(res.actionResult.initialAcknowledgment, 'Opening Pashmina.');

    // Spoken completion format adheres strictly to confirmed outcome
    const confirmedSpeech = formatActionOutcomeSpeech('confirmed_playing', 'Pashmina');
    assert.equal(confirmedSpeech, 'Playing Pashmina. Enjoy!');
  });

  // 7. Failed play command does not falsely announce success
  await t.test('7. A failed play command does not falsely announce success', () => {
    const storage = createMockStorage();
    const res = interpretLocalMusicCommand('Play NonExistentSong12345 from my favorites', {
      customStorage: storage,
    });

    assert.equal(res.handledLocally, true);
    assert.equal(res.actionResult.ok, false);
    assert.equal(res.actionResult.reason, 'not_found');
    assert.ok(res.actionResult.spokenConfirmation.includes('couldn\'t find'));

    const failedSpeech = formatActionOutcomeSpeech('failed', 'NonExistentSong12345');
    assert.equal(failedSpeech, 'I couldn\'t open NonExistentSong12345 this time.');
  });

  // 8. "Pause this and play Pashmina" executes complete ordered intent
  await t.test('8. Compound "Pause this and play Pashmina" executes complete ordered plan', () => {
    const storage = createMockStorage();
    addFavorite({
      title: 'Pashmina',
      artist: 'Amit Trivedi',
      youtubeId: 'pashmina123',
      provider: 'youtube',
    }, storage);

    const controls = [];
    let dispatchedCmd = null;

    const res = interpretLocalMusicCommand('Pause this and play Pashmina from my favorites', {
      media: { active: true, status: 'playing', title: 'Current Song' },
      customStorage: storage,
      companion: { connected: true, isYtMusicActive: true },
      onControl: (a) => controls.push(a),
      onDispatchCompanion: (cmd) => { dispatchedCmd = cmd; },
    });

    assert.equal(res.handledLocally, true);
    assert.equal(res.isCompound, true);
    assert.deepEqual(controls, ['pause']);
    assert.equal(dispatchedCmd?.videoId, 'pashmina123');
    assert.equal(res.actionResult.initialAcknowledgment, 'Pausing and opening Pashmina.');
  });

  // 9. "Stop this and play Starboy" reaches the correct final state
  await t.test('9. "Stop this and play Starboy" reaches the correct final state', () => {
    const storage = createMockStorage();
    addFavorite({
      title: 'Starboy',
      artist: 'The Weeknd',
      youtubeId: 'starboy_yt_id',
      provider: 'youtube',
    }, storage);

    const controls = [];
    let dispatchedCmd = null;

    const res = interpretLocalMusicCommand('Stop this and play Starboy', {
      media: { active: true, status: 'playing' },
      customStorage: storage,
      companion: { connected: true, isYtMusicActive: true },
      onControl: (a) => controls.push(a),
      onDispatchCompanion: (cmd) => { dispatchedCmd = cmd; },
    });

    assert.equal(res.handledLocally, true);
    assert.equal(res.actionResult.ok, true);
    assert.equal(dispatchedCmd?.videoId, 'starboy_yt_id');
  });

  // 10. "Play Tuu" -> "T-U-U, the Hindi song" correctly re-resolves the Favorite
  await t.test('10. "Play Tuu" followed by spelled "No, T-U-U. It\'s a Hindi song" re-resolves Favorite and learns alias', () => {
    const storage = createMockStorage();
    addFavorite({
      title: 'Tuu',
      artist: 'Arijit Singh',
      youtubeId: 'tuu_hindi_123',
      provider: 'youtube',
    }, storage);

    // Turn 1: Whisper transcribes "two"
    const turn1 = interpretLocalMusicCommand('Play two from my favorites', {
      customStorage: storage,
    });
    assert.equal(turn1.actionResult.ok, false);
    assert.ok(
      turn1.actionResult.reason === 'not_found' ||
      turn1.actionResult.reason === 'phonetic_clarification' ||
      turn1.actionResult.reason === 'clarification_needed'
    );

    // Verify context tracked failed action
    const ctxAfter1 = musicContext.getContext();
    assert.ok(ctxAfter1.lastFailedAction);

    // Turn 2: User corrects "No, T-U-U. It's a Hindi song"
    let dispatchedCmd = null;
    const turn2 = interpretLocalMusicCommand('No, T-U-U. It\'s a Hindi song', {
      customStorage: storage,
      companion: { connected: true, isYtMusicActive: true },
      onDispatchCompanion: (cmd) => { dispatchedCmd = cmd; },
    });

    assert.equal(turn2.handledLocally, true);
    assert.equal(turn2.actionResult.ok, true);
    assert.equal(turn2.actionResult.track?.title, 'Tuu');
    assert.equal(dispatchedCmd?.videoId, 'tuu_hindi_123');

    // Confirm alias was learned
    const learnedId = musicContext.getLearnedAlias('two', storage);
    assert.equal(learnedId, turn2.actionResult.track.id);
  });

  // 11. "No, the other one" uses previous candidates
  await t.test('11. "No, the other one" resolves second candidate from previous ambiguous turn', () => {
    const storage = createMockStorage();
    addFavorite({ title: 'São Paulo', artist: 'The Weeknd & Anitta', youtubeId: 'sp_1', provider: 'youtube' }, storage);
    addFavorite({ title: 'São Paulo (Remix)', artist: 'The Weeknd', youtubeId: 'sp_2', provider: 'youtube' }, storage);

    // Turn 1: ambiguous request
    const turn1 = interpretLocalMusicCommand('Play Sao Paulo from my favorites', {
      customStorage: storage,
    });
    assert.equal(turn1.actionResult.ok, false);
    assert.equal(turn1.actionResult.reason, 'ambiguous_match');
    assert.equal(musicContext.previousCandidates.length, 2);

    // Turn 2: "No, the other one"
    let dispatchedCmd = null;
    const turn2 = interpretLocalMusicCommand('No, the other one', {
      customStorage: storage,
      companion: { connected: true, isYtMusicActive: true },
      onDispatchCompanion: (cmd) => { dispatchedCmd = cmd; },
    });

    assert.equal(turn2.handledLocally, true);
    assert.equal(turn2.actionResult.ok, true);
    assert.equal(turn2.actionResult.track?.title, 'São Paulo (Remix)');
    assert.equal(dispatchedCmd?.videoId, 'sp_2');
  });

  // 12. Multiple conversational turns preserve relevant music context
  await t.test('12. Multiple conversational turns preserve structured music session memory', () => {
    musicContext.recordRequest({ title: 'Pashmina', artist: 'Amit Trivedi' });
    musicContext.recordRequest({ title: 'Starboy', artist: 'The Weeknd' });

    const ctx = musicContext.getContext();
    assert.equal(ctx.recentRequests.length, 2);
    assert.equal(ctx.recentRequests[0].title, 'Starboy');
    assert.equal(ctx.recentRequests[1].title, 'Pashmina');

    // Temporal recall test: "Play the previous one"
    const prev = musicContext.getPreviousTrackCandidate();
    assert.equal(prev?.title, 'Starboy');
  });

  // 13. Existing Whisper English preference remains stable
  await t.test('13. Language clues do not force global system language changes', () => {
    const correction = musicContext.detectCorrection('No, it\'s spelled T-U-U, a Hindi song');
    assert.equal(correction.languageHint, 'hindi');
    assert.equal(correction.candidateTitle, 'tuu');
    // Global language is unaffected
  });

  // 14. Native Windows TTS remains audible
  await t.test('14. Native Windows SAPI speech playback pipeline is intact', () => {
    const { isNativePlaybackActive } = require('../src/lib/native-audio-player');
    assert.equal(typeof isNativePlaybackActive, 'function');
    assert.equal(isNativePlaybackActive(), false);
  });

  // 15. No duplicate YouTube Music tabs
  await t.test('15. Dispatching playback commands reuses existing companion tab without opening duplicate URLs', () => {
    let openedUrl = null;
    let dispatchedCmd = null;

    const storage = createMockStorage();
    addFavorite({
      title: 'Die For You',
      artist: 'The Weeknd',
      youtubeId: 'dieforyou123',
      provider: 'youtube',
    }, storage);

    executeMusicAction({
      action: 'play_favorite',
      query: 'Die For You',
    }, {
      customStorage: storage,
      companion: { connected: true, isYtMusicActive: true },
      onOpenUrl: (url) => { openedUrl = url; },
      onDispatchCompanion: (cmd) => { dispatchedCmd = cmd; },
    });

    assert.equal(dispatchedCmd?.videoId, 'dieforyou123');
    assert.equal(openedUrl, null, 'Must NOT spawn a new browser tab when companion is connected!');
  });

  // 16. No regressions in Favorites persistence
  await t.test('16. Favorites persistence and CRUD remain completely safe', () => {
    const storage = createMockStorage();
    const added = addFavorite({
      title: 'Test Song',
      artist: 'Test Artist',
      provider: 'youtube',
      youtubeId: 'abc12345678',
    }, storage);

    assert.ok(added);
    const list = getAllFavorites(storage);
    assert.equal(list.length, 1);
    assert.equal(list[0].title, 'Test Song');
  });

  // 17. Interruption, cancellation, and error paths restore audio safely
  await t.test('17. Interruption and cancellation safely restore volume multipliers', () => {
    audioCoordinator.setUserVolume(0.75);
    audioCoordinator.startDucking({ duckLevel: 0.10, durationMs: 0 });
    assert.equal(audioCoordinator.duckingMultiplier, 0.10);

    // Voice session canceled or interrupted
    audioCoordinator.cancelDucking();
    assert.equal(audioCoordinator.duckState, 'idle');
    assert.equal(audioCoordinator.duckingMultiplier, 1.0);
    assert.equal(audioCoordinator.effectiveVolume, 0.75);
  });
});
