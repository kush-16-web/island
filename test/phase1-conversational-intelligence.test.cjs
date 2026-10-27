'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');
const https = require('node:https');

// Mock localStorage for Node test environment
if (typeof globalThis.localStorage === 'undefined') {
  const memoryStore = {};
  globalThis.localStorage = {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(memoryStore, k) ? memoryStore[k] : null),
    setItem: (k, v) => { memoryStore[k] = String(v); },
    removeItem: (k) => { delete memoryStore[k]; },
    clear: () => { Object.keys(memoryStore).forEach((k) => delete memoryStore[k]); },
  };
}
if (typeof globalThis.window === 'undefined') {
  globalThis.window = {
    localStorage: globalThis.localStorage,
    dispatchEvent: () => {},
  };
}

class MockStore {
  constructor(initial = {}) {
    this._data = { ...initial };
  }
  get(k, fallback = null) {
    return Object.prototype.hasOwnProperty.call(this._data, k) ? this._data[k] : fallback;
  }
  set(k, v) {
    this._data[k] = v;
  }
}

// 1. Core Services & Modules
const { GroqService, ISLAND_MUSIC_TOOLS, ISLAND_SCHEDULER_TOOLS } = require('../electron/groq.js');

test('PHASE 1 REGRESSION SUITE: Conversational Intelligence & Tool Gating', async (t) => {
  // Dynamically import ESM modules
  const { interpretLocalMusicCommand } = await import('../src/lib/music/music-command-interpreter.js');
  const { musicContext } = await import('../src/lib/music/music-conversation-context.js');
  const { processTurnIntent, isActionAuthorized, parseActionIntent } = await import('../src/lib/nlu/voice-intent.js');
  const { planUserIntent, ACTION_TYPES } = await import('../src/lib/nlu/semantic-tool-planner.js');
  const { executeMusicAction } = await import('../src/lib/music/music-actions.js');
  const { addFavorite, removeFavorite, getAllFavorites } = await import('../src/lib/music/favorites.js');

  const testStore = new MockStore();
  const groqService = new GroqService({ store: testStore });
  groqService.apiKey = 'gsk_mock_valid_key_for_testing';

  // Seed sample favorites for test assertions
  localStorage.clear();
  const sampleTrack = {
    id: 'fav-1',
    title: 'Starboy',
    artist: 'The Weeknd',
    provider: 'spotify',
    providerTrackId: 'spotify:track:starboy123',
  };
  localStorage.setItem('island_favorites_v2', JSON.stringify([sampleTrack]));

  const mockEnv = {
    media: { active: false, status: 'stopped', title: null },
    onControl: (cmd) => { mockEnv.lastControl = cmd; },
    onOpenUrl: (url) => { mockEnv.lastOpenedUrl = url; },
    lastControl: null,
    lastOpenedUrl: null,
  };

  await t.test('1. "What\'s your favourite Marvel character?" → Conversational response, zero music tools', async () => {
    musicContext.reset();
    const utterance = "What's your favourite Marvel character?";

    // 1A. Local interpreter must NOT execute music actions
    const localRes = interpretLocalMusicCommand(utterance, mockEnv);
    assert.strictEqual(localRes.handledLocally, false);
    assert.strictEqual(localRes.fallbackToLlm, true);
    assert.strictEqual(localRes.reason, 'conversational_question');

    // 1B. Tool eligibility layer must yield ZERO tools for Groq
    const tools = groqService.resolveEligibleTools(utterance);
    assert.strictEqual(tools.length, 0, 'No tools should be eligible for conversational inquiry');

    // 1C. Action authorization guard must reject any accidental favorite playback
    const rogueIntent = { action: 'play_random_favorite' };
    const auth = isActionAuthorized(rogueIntent, utterance, mockEnv);
    assert.strictEqual(auth.authorized, false);
    assert.strictEqual(auth.reason, 'conversational_question_mismatch');

    // 1D. Real Turn Processor must discard rogue tool tag and preserve natural speech
    const mockLlmReply = "I'm a big fan of Iron Man! [[ACTION:{\"action\":\"play_random_favorite\"}]]";
    const turnRes = processTurnIntent(mockLlmReply, mockEnv, utterance);
    assert.strictEqual(turnRes.executed, false);
    assert.strictEqual(turnRes.intent, null);
    assert.strictEqual(turnRes.spokenText, "I'm a big fan of Iron Man!");
  });

  await t.test('2. "Who is Iron Man?" → Conversational response, general knowledge plan', async () => {
    const utterance = "Who is Iron Man?";

    // 2A. Local interpreter must yield to conversational LLM
    const localRes = interpretLocalMusicCommand(utterance, mockEnv);
    assert.strictEqual(localRes.handledLocally, false);
    assert.strictEqual(localRes.fallbackToLlm, true);

    // 2B. Semantic planner must classify as general_knowledge, not music_trivia
    const plan = planUserIntent(utterance);
    assert.strictEqual(plan.plan.type, ACTION_TYPES.CONVERSATION_INFO);
    assert.strictEqual(plan.plan.topic, 'general_knowledge');

    // 2C. Groq tools layer must give zero tools
    const tools = groqService.resolveEligibleTools(utterance);
    assert.strictEqual(tools.length, 0);
  });

  await t.test('3. "Tell me about your favourite superhero." → No music action', async () => {
    const utterance = "Tell me about your favourite superhero.";

    // 3A. Local interpreter must not trigger playback
    const localRes = interpretLocalMusicCommand(utterance, mockEnv);
    assert.strictEqual(localRes.handledLocally, false);
    assert.strictEqual(localRes.fallbackToLlm, true);

    // 3B. Tool eligibility must be empty
    const tools = groqService.resolveEligibleTools(utterance);
    assert.strictEqual(tools.length, 0);

    // 3C. Authorization guard must deny playback
    const auth = isActionAuthorized({ action: 'play_random_favorite' }, utterance);
    assert.strictEqual(auth.authorized, false);
  });

  await t.test('4. "Play my favourite songs." → Music action', async () => {
    const utterance = "Play my favourite songs.";

    // 4A. Local interpreter must handle locally and shuffle favorites
    const localRes = interpretLocalMusicCommand(utterance, mockEnv);
    assert.strictEqual(localRes.handledLocally, true);
    assert.strictEqual(localRes.actionResult.ok, true);
    assert.strictEqual(localRes.actionResult.action, 'play_favorite');

    // 4B. Verification with "Play my favorite songs." (US spelling)
    const localResUS = interpretLocalMusicCommand("Play my favorite songs.", mockEnv);
    assert.strictEqual(localResUS.handledLocally, true);
    assert.strictEqual(localResUS.actionResult.ok, true);

    // 4C. Tool eligibility layer provides music tools when requested
    const tools = groqService.resolveEligibleTools(utterance);
    assert.strictEqual(tools.length, ISLAND_MUSIC_TOOLS.length);

    // 4D. Action authorization allows legitimate playback
    const auth = isActionAuthorized({ action: 'play_random_favorite' }, utterance);
    assert.strictEqual(auth.authorized, true);
  });

  await t.test('5. "Play something relaxing." → Valid music request', async () => {
    const utterance = "Play something relaxing.";

    // 5A. Local interpreter executes play_track request for relaxing music
    const localRes = interpretLocalMusicCommand(utterance, mockEnv);
    assert.strictEqual(localRes.handledLocally, true);
    assert.strictEqual(localRes.actionResult.ok, true);
    assert.strictEqual(localRes.actionResult.action, 'play_track');
    assert.strictEqual(localRes.actionResult.playbackState.toUpperCase(), 'OPENING_PROVIDER');

    // 5B. Action authorization permits play_track with query
    const auth = isActionAuthorized({ action: 'play_track', query: 'something relaxing' }, utterance);
    assert.strictEqual(auth.authorized, true);
  });

  await t.test('6. "Pause the music." → Pause action', async () => {
    const utterance = "Pause the music.";
    mockEnv.media = { active: true, status: 'playing', title: 'Starboy' };

    // 6A. Local interpreter triggers pause action
    const localRes = interpretLocalMusicCommand(utterance, mockEnv);
    assert.strictEqual(localRes.handledLocally, true);
    assert.strictEqual(localRes.actionResult.ok, true);
    assert.strictEqual(localRes.actionResult.action, 'pause');
    assert.strictEqual(mockEnv.lastControl, 'pause');

    // 6B. Semantic tool planner also recognizes high confidence pause
    const plan = planUserIntent(utterance);
    assert.strictEqual(plan.plan.type, ACTION_TYPES.MUSIC_CONTROL);
    assert.strictEqual(plan.plan.operation, 'pause');
  });

  await t.test('7. "Play another one." after music context → Valid follow-up', async () => {
    musicContext.reset();
    // Simulate active playback context
    musicContext.recordSuccess('play_favorite', sampleTrack);
    mockEnv.media = { active: true, status: 'playing', title: 'Starboy' };

    const utterance = "Play another one.";
    const localRes = interpretLocalMusicCommand(utterance, mockEnv);
    assert.strictEqual(localRes.handledLocally, true);
    assert.strictEqual(localRes.actionResult.ok, true);
    assert.strictEqual(localRes.actionResult.action, 'next_track');
  });

  await t.test('8. "Play another one." without context → Clarification', async () => {
    musicContext.reset();
    mockEnv.media = { active: false, status: 'stopped', title: null };

    const utterance = "Play another one.";
    const localRes = interpretLocalMusicCommand(utterance, mockEnv);
    assert.strictEqual(localRes.handledLocally, true);
    assert.strictEqual(localRes.actionResult.ok, false);
    assert.strictEqual(localRes.actionResult.clarificationNeeded, true);
    assert.strictEqual(localRes.actionResult.action, 'clarification_needed');
    assert.strictEqual(localRes.actionResult.spokenConfirmation, 'What would you like me to play?');
  });

  await t.test('9. Mispronounced or incomplete conversational questions → No unrelated playback', async () => {
    musicContext.reset();
    const mispronounced = [
      "what fav superhero",
      "who is iron mang",
      "tell me fav movie",
      "what's your fav color",
    ];

    for (const phrase of mispronounced) {
      const localRes = interpretLocalMusicCommand(phrase, mockEnv);
      assert.strictEqual(localRes.handledLocally, false, `Phrase "${phrase}" should not be hijacked locally`);
      
      const tools = groqService.resolveEligibleTools(phrase);
      assert.strictEqual(tools.length, 0, `Phrase "${phrase}" must not be granted music tools`);

      const auth = isActionAuthorized({ action: 'play_random_favorite' }, phrase);
      assert.strictEqual(auth.authorized, false, `Rogue action on "${phrase}" must be rejected`);
    }
  });

  await t.test('10. Switch from music discussion to Marvel discussion → No music action & context suspended', async () => {
    musicContext.reset();
    // Step 1: User plays a song
    musicContext.recordSuccess('play_favorite', sampleTrack);
    assert.notStrictEqual(musicContext.lastSuccessfulAction, null);

    // Step 2: User switches topic to Marvel discussion
    const topicSwitchUtterance = "What do you think of Spider-Man?";
    
    // Suspend context should clear pending correction & candidate context
    const suspended = musicContext.suspendOnTopicSwitch(topicSwitchUtterance);
    assert.strictEqual(suspended, true);
    assert.strictEqual(musicContext.pendingIntent, null);
    assert.strictEqual(musicContext.previousCandidates.length, 0);

    // Local interpreter does not hijack
    const localRes = interpretLocalMusicCommand(topicSwitchUtterance, mockEnv);
    assert.strictEqual(localRes.handledLocally, false);
    assert.strictEqual(localRes.fallbackToLlm, true);

    // Groq tools eligibility layer yields zero tools
    const tools = groqService.resolveEligibleTools(topicSwitchUtterance);
    assert.strictEqual(tools.length, 0);

    // Turn processor executes no music actions
    const llmTurnRes = processTurnIntent("Spider-Man is great! He's one of Marvel's most relatable heroes.", mockEnv, topicSwitchUtterance);
    assert.strictEqual(llmTurnRes.executed, false);
    assert.strictEqual(llmTurnRes.intent, null);
    assert.strictEqual(llmTurnRes.spokenText.includes("Spider-Man"), true);

    // Step 3: Verify user favorites were preserved and not deleted
    const favs = getAllFavorites();
    assert.strictEqual(favs.length, 1);
    assert.strictEqual(favs[0].title, 'Starboy');
  });
});
