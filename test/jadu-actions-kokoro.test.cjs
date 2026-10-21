'use strict';
/**
 * test/jadu-actions-kokoro.test.cjs
 * Comprehensive deterministic offline test suite for:
 * - Jadu Music Actions (Part B)
 * - Structured Voice Intent Layer (Part C)
 * - Isolated Kokoro Local TTS Prototype (Part D)
 * - Stability, duplicate protection, ambiguity, and failure recovery (Part E)
 *
 * ZERO cloud API calls are made. All models and SMTC state are mocked locally.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

// Dynamic import for ES modules from src/lib
async function loadModules() {
  const musicActions = await import('../src/lib/music-actions.js');
  const voiceIntent = await import('../src/lib/voice-intent.js');
  const { KokoroLocalService } = require('../electron/kokoro-tts.js');
  return { ...musicActions, ...voiceIntent, KokoroLocalService };
}

// In-memory mock storage replicating localStorage
function createMockStorage(initialData = {}) {
  let store = { ...initialData };
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

test('Jadu Music Actions & Kokoro TTS Offline Test Suite', async (t) => {
  const {
    normalizeText,
    stringSimilarity,
    scoreTrack,
    matchTrack,
    executeMusicAction,
    parseActionIntent,
    validateIntentSchema,
    processTurnIntent,
    KokoroLocalService,
  } = await loadModules();

  await t.test('1. Exact favorite match: recognizes and confirms track', () => {
    const storage = createMockStorage({
      island_fav_tracks: JSON.stringify({
        'Blinding Lights|The Weeknd': { title: 'Blinding Lights', artist: 'The Weeknd' },
        'São Paulo|The Weeknd & Anitta': { title: 'São Paulo', artist: 'The Weeknd & Anitta' },
      }),
    });

    let controlledAction = null;
    let openedUrl = null;
    const env = {
      media: { active: true, title: 'Other Song', artist: 'Other', status: 'playing' },
      onControl: (act) => {
        controlledAction = act;
      },
      onOpenUrl: (url) => {
        openedUrl = url;
      },
      customStorage: storage,
    };

    const result = executeMusicAction({ action: 'play_favorite', query: 'Blinding Lights' }, env);

    assert.equal(result.ok, true);
    assert.equal(result.action, 'play_favorite');
    assert.equal(result.track.title, 'Blinding Lights');
    // Crucial fix for Attention/Pashmina failure:
    // Must NOT call onControl('play') because that would continue playing 'Other Song' (Pashmina)
    assert.equal(controlledAction, null);
    assert.ok(openedUrl);
    assert.match(result.spokenConfirmation, /Opening Blinding Lights/i);
  });

  await t.test('2. Fuzzy favorite match: accents, case, and punctuation resilience', () => {
    const storage = createMockStorage({
      island_fav_tracks: JSON.stringify({
        'São Paulo|The Weeknd & Anitta': { title: 'São Paulo', artist: 'The Weeknd & Anitta' },
        'Starboy|The Weeknd': { title: 'Starboy', artist: 'The Weeknd' },
      }),
    });

    const env = {
      media: { active: true, title: 'São Paulo', artist: 'The Weeknd & Anitta', status: 'paused' },
      onControl: () => {},
      customStorage: storage,
    };

    // User speaks without accent and in lowercase: "sao paulo"
    const resultNoAccent = executeMusicAction({ action: 'play_favorite', query: 'sao paulo' }, env);
    assert.equal(resultNoAccent.ok, true);
    assert.equal(resultNoAccent.track.title, 'São Paulo');

    // User speaks with punctuation and extra spaces: "sao-paulo!"
    const resultPunctuation = executeMusicAction({ action: 'play_favorite', query: 'sao-paulo!' }, env);
    assert.equal(resultPunctuation.ok, true);
    assert.equal(resultPunctuation.track.title, 'São Paulo');
  });

  await t.test('3. Ambiguous track names: asks for clarification when scores are equally close', () => {
    const storage = createMockStorage({
      island_fav_tracks: JSON.stringify({
        'São Paulo|The Weeknd': { title: 'São Paulo', artist: 'The Weeknd' },
        'São Paulo (Remix)|The Weeknd & Anitta': { title: 'São Paulo (Remix)', artist: 'The Weeknd & Anitta' },
      }),
    });

    const env = {
      media: { active: false },
      onControl: () => {},
      customStorage: storage,
    };

    const result = executeMusicAction({ action: 'play_favorite', query: 'sao paulo' }, env);

    assert.equal(result.ok, false);
    assert.equal(result.reason, 'ambiguous_match');
    assert.equal(result.clarificationNeeded, true);
    assert.equal(Array.isArray(result.matches), true);
    assert.ok(result.matches.length >= 2);
    assert.match(result.spokenConfirmation, /Which one would you like/i);
  });

  await t.test('4. Missing favorite: reports truth, never fabricates track or plays unrelated', () => {
    const storage = createMockStorage({
      island_fav_tracks: JSON.stringify({
        'Starboy|The Weeknd': { title: 'Starboy', artist: 'The Weeknd' },
      }),
    });

    let controlledAction = null;
    const env = {
      media: { active: false },
      onControl: (act) => {
        controlledAction = act;
      },
      customStorage: storage,
    };

    const result = executeMusicAction({ action: 'play_favorite', query: 'Hotel California' }, env);

    assert.equal(result.ok, false);
    assert.equal(result.reason, 'not_found');
    assert.equal(controlledAction, null); // Nothing was played
    assert.match(result.spokenConfirmation, /couldn't find "Hotel California" in your favorites/i);
  });

  await t.test('5. Empty favorites list: safe failure handling', () => {
    const storage = createMockStorage({
      island_fav_tracks: JSON.stringify({}),
    });

    const env = {
      media: { active: false },
      onControl: () => {},
      customStorage: storage,
    };

    const resultFav = executeMusicAction({ action: 'play_favorite', query: 'Any Song' }, env);
    assert.equal(resultFav.ok, false);
    assert.equal(resultFav.reason, 'empty_favorites');
    assert.match(resultFav.spokenConfirmation, /favorites list is empty/i);

    const resultRandom = executeMusicAction({ action: 'play_random_favorite' }, env);
    assert.equal(resultRandom.ok, false);
    assert.equal(resultRandom.reason, 'empty_favorites');
    assert.match(resultRandom.spokenConfirmation, /favorites list is empty/i);
  });

  await t.test('6. Play random favorite: selects from populated favorites and starts playback', () => {
    const storage = createMockStorage({
      island_fav_tracks: JSON.stringify({
        'Track A|Artist 1': { title: 'Track A', artist: 'Artist 1' },
        'Track B|Artist 2': { title: 'Track B', artist: 'Artist 2' },
      }),
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

    const result = executeMusicAction({ action: 'play_random_favorite' }, env);
    assert.equal(result.ok, true);
    assert.ok(openedUrl);
    assert.ok(['Track A', 'Track B'].includes(result.track.title));
    assert.match(result.spokenConfirmation, /Opening .* in/i);
  });

  await t.test('7. Pause & Resume actions: handles active, already paused, and already playing states', () => {
    let lastControl = null;
    const env = {
      media: { active: true, title: 'Song 1', status: 'playing' },
      onControl: (act) => {
        lastControl = act;
      },
    };

    // Pause while playing -> ok
    const resPause = executeMusicAction({ action: 'pause' }, env);
    assert.equal(resPause.ok, true);
    assert.equal(lastControl, 'pause');
    assert.match(resPause.spokenConfirmation, /Paused music playback/i);

    // Pause while already paused -> already_paused
    env.media.status = 'paused';
    lastControl = null;
    const resPauseAgain = executeMusicAction({ action: 'pause' }, env);
    assert.equal(resPauseAgain.ok, false);
    assert.equal(resPauseAgain.reason, 'already_paused');
    assert.equal(lastControl, null);

    // Resume while paused -> ok
    const resResume = executeMusicAction({ action: 'resume' }, env);
    assert.equal(resResume.ok, true);
    assert.equal(lastControl, 'play');
    assert.match(resResume.spokenConfirmation, /Resumed music playback/i);

    // Resume while already playing -> already_playing
    env.media.status = 'playing';
    lastControl = null;
    const resResumeAgain = executeMusicAction({ action: 'resume' }, env);
    assert.equal(resResumeAgain.ok, false);
    assert.equal(resResumeAgain.reason, 'already_playing');
    assert.equal(lastControl, null);

    // Pause/Resume while idle -> nothing_playing
    env.media = { active: false };
    const resIdle = executeMusicAction({ action: 'pause' }, env);
    assert.equal(resIdle.ok, false);
    assert.equal(resIdle.reason, 'nothing_playing');
  });

  await t.test('8. Next & Previous track: dispatches SMTC commands safely', () => {
    let lastControl = null;
    const env = {
      media: { active: true, title: 'Active Track', status: 'playing' },
      onControl: (act) => {
        lastControl = act;
      },
    };

    const nextRes = executeMusicAction({ action: 'next_track' }, env);
    assert.equal(nextRes.ok, true);
    assert.equal(lastControl, 'next');

    const prevRes = executeMusicAction({ action: 'previous_track' }, env);
    assert.equal(prevRes.ok, true);
    assert.equal(lastControl, 'previous');
  });

  await t.test('9. Add & Remove Current Track to/from favorites', () => {
    const storage = createMockStorage({});
    const env = {
      media: { active: true, title: 'In Your Eyes', artist: 'The Weeknd', status: 'playing' },
      onControl: () => {},
      customStorage: storage,
    };

    // Add current to favorites
    const addRes = executeMusicAction({ action: 'add_current_to_favorites' }, env);
    assert.equal(addRes.ok, true);
    assert.match(addRes.spokenConfirmation, /Added In Your Eyes to your favorites/i);

    // Check storage
    const raw = JSON.parse(storage.getItem('island_fav_tracks'));
    assert.ok(raw['In Your Eyes|The Weeknd']);

    // Remove current from favorites
    const removeRes = executeMusicAction({ action: 'remove_current_from_favorites' }, env);
    assert.equal(removeRes.ok, true);
    assert.match(removeRes.spokenConfirmation, /Removed In Your Eyes from your favorites/i);

    const rawAfter = JSON.parse(storage.getItem('island_fav_tracks'));
    assert.equal(rawAfter['In Your Eyes|The Weeknd'], undefined);

    // Try removing again -> not_in_favorites
    const removeAgain = executeMusicAction({ action: 'remove_current_from_favorites' }, env);
    assert.equal(removeAgain.ok, false);
    assert.equal(removeAgain.reason, 'not_in_favorites');
  });

  await t.test('10. Voice Intent Parser: extracts allowlisted actions from natural response', () => {
    const naturalWithAction = 'Sure, playing that right away! [[ACTION:{"action":"play_favorite","query":"São Paulo"}]]';
    const parsed = parseActionIntent(naturalWithAction);

    assert.equal(parsed.hasIntent, true);
    assert.equal(parsed.intent.action, 'play_favorite');
    assert.equal(parsed.intent.query, 'São Paulo');
    assert.equal(parsed.cleanedText, 'Sure, playing that right away!');

    // Pure conversational text with no tags
    const conversational = 'I am doing great today, thanks for asking!';
    const parsedConv = parseActionIntent(conversational);
    assert.equal(parsedConv.hasIntent, false);
    assert.equal(parsedConv.intent, null);
    assert.equal(parsedConv.cleanedText, conversational);
  });

  await t.test('11. Malformed model action: rejects invalid JSON, unknown actions, and syntax errors', () => {
    // Unknown action name
    const badAction = '[[ACTION:{"action":"delete_all_files"}]]';
    const parsedBad = parseActionIntent(badAction);
    assert.equal(parsedBad.hasIntent, false);
    assert.ok(parsedBad.error);

    // Malformed JSON syntax
    const badJson = '[[ACTION:{action:"play_track" query:broken}]]';
    const parsedBroken = parseActionIntent(badJson);
    assert.equal(parsedBroken.hasIntent, false);
    assert.ok(parsedBroken.error);

    // Empty object
    const validation = validateIntentSchema({});
    assert.equal(validation.valid, false);
  });

  await t.test('12. Grounded confirmation pipeline: replaces model assumptions with verified truth', () => {
    // Model assumes song is playing, but track is NOT in favorites
    const storage = createMockStorage({
      island_fav_tracks: JSON.stringify({
        'Starboy|The Weeknd': { title: 'Starboy', artist: 'The Weeknd' },
      }),
    });
    const env = {
      media: { active: false },
      onControl: () => {},
      customStorage: storage,
    };

    const modelResponse = 'I have started playing São Paulo for you! [[ACTION:{"action":"play_favorite","query":"São Paulo"}]]';
    const turnResult = processTurnIntent(modelResponse, env);

    assert.equal(turnResult.executed, true);
    assert.equal(turnResult.actionResult.ok, false);
    // Spoken output must NEVER repeat model's false claim "I have started playing"; it must state the truth:
    assert.match(turnResult.spokenText, /couldn't find "São Paulo" in your favorites/i);
    assert.match(turnResult.transcriptText, /couldn't find "São Paulo" in your favorites/i);
  });

  await t.test('13. Kokoro Service: initial state, safety checks, and no auto-downloads', () => {
    const kokoro = new KokoroLocalService();
    const status = kokoro.getStatus();

    assert.equal(typeof status, 'object');
    assert.equal(status.isLoaded, false);
    assert.equal(status.isLoading, false);
    assert.equal(Array.isArray(status.availableFemaleVoices), true);
    assert.ok(status.availableFemaleVoices.some((v) => v.id === 'af_heart'));

    // Loading without installed weights returns clear, polite offline error (zero automatic download)
    return kokoro.loadModel().then((res) => {
      assert.equal(res.ok, false);
      assert.match(res.error, /not installed/i);
    });
  });

  await t.test('14. Kokoro Service: cancellation and resource disposal', () => {
    const kokoro = new KokoroLocalService();

    // Cancel signal
    const cancelRes = kokoro.cancel();
    assert.equal(cancelRes.ok, true);
    assert.equal(cancelRes.cancelled, true);

    // Resource disposal
    const disposeRes = kokoro.dispose();
    assert.equal(disposeRes.ok, true);
    assert.equal(disposeRes.disposed, true);
    assert.equal(kokoro.model, null);
  });
});
