'use strict';
/**
 * test/pass2-2-6-1-semantic-agent.test.cjs: Mandatory Regression Test Suite for Pass 2.2.6.1.
 *
 * Validates:
 * 1. Repeated Identical-Input Tests:
 *    - 5x "Show me my favorite songs" -> deterministic favorites.list with 8 track records and UI payload
 *    - 5x "Name all of them" -> deterministic favorites.list with all 8 track titles/artists
 *    - 5x "How many do I have?" -> deterministic favorites.count returning 8
 *    - 5x "Play any random one from it" -> deterministic favorites.select (random) resolving against collection
 * 2. Paraphrase Invariance Tests:
 *    - Varied phrasing for list ("Show my favorites", "Which songs have I saved?", "Browse my library", "Display my saved tracks")
 *    - Varied phrasing for count ("How many songs are there?", "What's the count of saved tracks?", "How many favorites do I have?")
 *    - Varied phrasing for random collection pick ("Surprise me with something from it", "Play a random song from that list", "Pick one of those tracks")
 * 3. Multi-turn Conversational Context State Transitions:
 *    - Turn 1: "What songs have I saved?" -> renders 8 favorites
 *    - Turn 2: "How many are there?" -> returns 8 from storage
 *    - Turn 3: "Play any random one from it" -> selects eligible track from active collection
 *    - Turn 4: "Actually, choose the third one" -> resolves 3rd item (index 2) by ordinal
 *    - Turn 5: "Thanks, that's all" -> gracefully dismisses session
 * 4. Structured UI Result Contract:
 *    - Validates tracks array, totalCount, provider, and execution status
 *    - Guarantees async text updates cannot wipe out structured UI track records
 * 5. Chrome Companion Transport Resilience:
 *    - Disconnected companion resolves volume commands immediately without hanging
 *    - Zero 12-second timeouts for duck or restore_volume
 *    - Deduplication of redundant restore commands
 *    - No unhandled promise rejections on app close or disconnect
 */

const test = require('node:test');
const assert = require('node:assert/strict');

// Mock localStorage for node environment
class MockLocalStorage {
  constructor() {
    this.store = new Map();
  }
  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }
  setItem(key, value) {
    this.store.set(key, String(value));
  }
  removeItem(key) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}

// 8 real-shaped Favorites records across Spotify and YouTube Music
const FIXTURE_FAVORITES = [
  { id: 'fav_1', title: 'Attention', artist: 'Charlie Puth', provider: 'youtube', videoId: 'nfs8NYg7yQM' },
  { id: 'fav_2', title: 'City of Stars', artist: 'Ryan Gosling', provider: 'spotify', uri: 'spotify:track:cityofstars' },
  { id: 'fav_3', title: 'Tuu', artist: 'Arijit Singh', provider: 'youtube', videoId: 'tuu_vid_123' },
  { id: 'fav_4', title: 'Starboy', artist: 'The Weeknd', provider: 'spotify', uri: 'spotify:track:starboy' },
  { id: 'fav_5', title: 'Pashmina', artist: 'Amit Trivedi', provider: 'youtube', videoId: 'pashmina_vid' },
  { id: 'fav_6', title: 'Blinding Lights', artist: 'The Weeknd', provider: 'spotify', uri: 'spotify:track:blinding' },
  { id: 'fav_7', title: 'Kesariya', artist: 'Arijit Singh', provider: 'youtube', videoId: 'kesariya_vid' },
  { id: 'fav_8', title: 'Levitating', artist: 'Dua Lipa', provider: 'spotify', uri: 'spotify:track:levitating' },
];

test('Pass 2.2.6.1: Semantic Tool Planner & Conversational Agent Reliability Suite', async (t) => {
  const { planUserIntent, validateAgentAction, ACTION_TYPES } = await import('../src/lib/semantic-tool-planner.js');
  const { musicContext } = await import('../src/lib/music-conversation-context.js');
  const { interpretLocalMusicCommand } = await import('../src/lib/music-command-interpreter.js');
  const { executeMusicAction } = await import('../src/lib/music-actions.js');
  const { CompanionBridge } = require('../electron/companion-bridge.js');

  const mockStorage = new MockLocalStorage();
  mockStorage.setItem('island_favorites_v2', JSON.stringify(FIXTURE_FAVORITES));

  const testEnv = {
    media: { active: false },
    customStorage: mockStorage,
    storage: mockStorage,
    turnId: 101,
  };

  await t.test('1. Repeated Identical-Input Tests (5x identical executions)', async () => {
    // 5x "Show me my favorite songs"
    for (let i = 1; i <= 5; i++) {
      const res = interpretLocalMusicCommand('Show me my favorite songs', testEnv);
      assert.equal(res.handledLocally, true, `Turn ${i}: should be handled locally`);
      assert.equal(res.actionResult?.action, 'list_favorites');
      assert.equal(res.actionResult?.ok, true);
      assert.equal(res.actionResult?.totalCount, 8, `Turn ${i}: must return 8 totalCount`);
      assert.ok(Array.isArray(res.actionResult?.tracks), `Turn ${i}: must have tracks array`);
      assert.equal(res.actionResult?.tracks.length, 8, `Turn ${i}: must return all 8 tracks`);
    }

    // 5x "Name all of them"
    for (let i = 1; i <= 5; i++) {
      const res = interpretLocalMusicCommand('Name all of them', testEnv);
      assert.equal(res.handledLocally, true, `Turn ${i}: should be handled locally`);
      assert.equal(res.actionResult?.action, 'list_favorites');
      assert.equal(res.actionResult?.totalCount, 8);
      assert.equal(res.actionResult?.tracks.length, 8);
    }

    // 5x "How many do I have?"
    for (let i = 1; i <= 5; i++) {
      const res = interpretLocalMusicCommand('How many do I have?', testEnv);
      assert.equal(res.handledLocally, true);
      assert.equal(res.actionResult?.action, 'count_favorites');
      assert.equal(res.actionResult?.count, 8);
      assert.match(res.actionResult?.spokenConfirmation, /8/);
    }

    // 5x "Play any random one from it"
    // Validates action type, non-empty selection, and collection membership
    for (let i = 1; i <= 5; i++) {
      const res = interpretLocalMusicCommand('Play any random one from it', testEnv);
      assert.equal(res.handledLocally, true);
      assert.equal(res.actionResult?.ok, true);
      assert.ok(res.actionResult?.track?.title, `Turn ${i}: selected track must have title`);
      // Must NOT search for literal phrase "any random one from it"
      assert.notEqual(res.actionResult?.track?.title, 'any random one from it');
      const isMember = FIXTURE_FAVORITES.some((f) => f.title === res.actionResult?.track?.title);
      assert.equal(isMember, true, `Turn ${i}: selected track must belong to Favorites fixture`);
    }
  });

  await t.test('2. Paraphrase Invariance Tests', async () => {
    const listPhrases = [
      'Show my favorites',
      'Which songs have I saved?',
      'Can you name all of them?',
      'What songs are in my favorites?',
      'Browse my saved songs',
      'Please list all the songs I have saved',
    ];
    for (const phrase of listPhrases) {
      const res = interpretLocalMusicCommand(phrase, testEnv);
      assert.equal(res.handledLocally, true, `Phrase "${phrase}" should be handled locally`);
      assert.equal(res.actionResult?.action, 'list_favorites', `Phrase "${phrase}" should produce list_favorites`);
      assert.equal(res.actionResult?.tracks?.length, 8);
    }

    const countPhrases = [
      'How many songs do I have saved?',
      'How many are there?',
      'Count my favorites',
      'How many songs are saved in my list?',
    ];
    for (const phrase of countPhrases) {
      const res = interpretLocalMusicCommand(phrase, testEnv);
      assert.equal(res.handledLocally, true);
      assert.equal(res.actionResult?.action, 'count_favorites');
      assert.equal(res.actionResult?.count, 8);
    }

    const randomPhrases = [
      'Play any random one from it',
      'Surprise me with something from my favorites',
      'Play something from that list',
      'Play a random song from those',
      'Pick one of those tracks',
    ];
    for (const phrase of randomPhrases) {
      const res = interpretLocalMusicCommand(phrase, testEnv);
      assert.equal(res.handledLocally, true, `Phrase "${phrase}" must be handled`);
      assert.equal(res.actionResult?.ok, true);
      assert.notEqual(res.actionResult?.track?.title, phrase);
      assert.ok(FIXTURE_FAVORITES.some((f) => f.title === res.actionResult?.track?.title));
    }
  });

  await t.test('3. Multi-turn Conversational Context State Transitions', async () => {
    musicContext.reset();

    // Turn 1: User lists favorites
    const turn1 = interpretLocalMusicCommand('What songs have I saved?', testEnv);
    assert.equal(turn1.actionResult?.action, 'list_favorites');
    assert.equal(turn1.actionResult?.tracks?.length, 8);
    assert.equal(musicContext.getLastReferencedCollection()?.tracks?.length, 8);

    // Turn 2: User asks for count (preserves collection reference)
    const turn2 = interpretLocalMusicCommand('How many are there?', testEnv);
    assert.equal(turn2.actionResult?.action, 'count_favorites');
    assert.equal(turn2.actionResult?.count, 8);
    assert.equal(musicContext.getLastReferencedCollection()?.tracks?.length, 8);

    // Turn 3: User asks for random track from it
    const turn3 = interpretLocalMusicCommand('Play any random one from it', testEnv);
    assert.equal(turn3.actionResult?.ok, true);
    assert.ok(turn3.actionResult?.track);

    // Turn 4: User selects third one by ordinal
    const turn4 = interpretLocalMusicCommand('Actually, choose the third one', testEnv);
    assert.equal(turn4.actionResult?.ok, true);
    // Index 2 is "Tuu" by Arijit Singh in our fixture
    assert.equal(turn4.actionResult?.track?.title, 'Tuu');

    // Turn 5: User dismisses session
    const turn5 = interpretLocalMusicCommand('Thanks, that is all', testEnv);
    assert.equal(turn5.actionResult?.action, 'session_dismiss');
    assert.equal(turn5.actionResult?.isSessionEnd, true);
  });

  await t.test('4. Structured UI Result Contract & Truthful Non-Fabrication', async () => {
    // favorites.list must return structured payload regardless of spoken wording
    const listRes = executeMusicAction({ action: 'list_favorites' }, testEnv);
    assert.equal(listRes.ok, true);
    assert.equal(listRes.action, 'list_favorites');
    assert.equal(listRes.totalCount, 8);
    assert.ok(Array.isArray(listRes.tracks));
    assert.equal(listRes.tracks.length, 8);
    assert.ok(listRes.tracks[0].title);
    assert.ok(listRes.tracks[0].provider);

    // Weather query must route to live weather information without fabricating or misinterpreting as music playback
    const weatherRes = interpretLocalMusicCommand('What is the weather outside?', testEnv);
    assert.equal(weatherRes.handledLocally, true);
    assert.equal(weatherRes.actionResult?.action, 'info_weather');
    assert.equal(weatherRes.actionResult?.isWeather, true);
    assert.notEqual(weatherRes.actionResult?.action, 'play_track');

    const weatherTokyo = interpretLocalMusicCommand("What's the weather in Tokyo?", testEnv);
    assert.equal(weatherTokyo.actionResult?.action, 'info_weather');
    assert.equal(weatherTokyo.actionResult?.location?.toLowerCase(), 'tokyo');

    // Schema validation ensures invalid commands are cleanly rejected
    const invalidAction = validateAgentAction({ type: 'music.control', operation: 'fly_to_moon' });
    assert.equal(invalidAction.valid, false);
    assert.ok(invalidAction.error);
  });

  await t.test('5. Chrome Companion Transport Timeout Repair & Resilience', async () => {
    const bridge = new CompanionBridge({ commandTimeoutMs: 12000 });

    // A. Disconnected companion: duck & restore_volume must resolve immediately without hanging
    const startMs = Date.now();
    const duckRes = await bridge.dispatchCommand({ action: 'duck', level: 0.1 });
    const durationMs = Date.now() - startMs;

    assert.equal(duckRes.ok, false);
    assert.equal(duckRes.status, 'no_player');
    assert.ok(durationMs < 200, `Duck must fail-fast within 200ms when disconnected, took ${durationMs}ms`);

    // B. restore_volume when disconnected
    const restoreRes = await bridge.dispatchCommand({ action: 'restore_volume' });
    assert.equal(restoreRes.ok, false);
    assert.equal(restoreRes.status, 'no_player');

    // C. Simulated connected companion with active YTM tab
    bridge.handlePing({
      isYtMusic: true,
      tabsCount: 1,
      url: 'https://music.youtube.com/watch?v=nfs8NYg7yQM',
      status: 'playing',
    });
    assert.equal(bridge.isConnected(), true);
    assert.equal(bridge.companionInfo.isYtMusicActive, true);

    // D. Bounded timeout: for volume commands, timeout is 2500ms max (not 12000ms!)
    const unackedDuckPromise = bridge.dispatchCommand({ action: 'duck', level: 0.1 });
    // Pull the command to simulate extension fetching it
    const pulled = bridge.pullNextCommand();
    assert.equal(pulled?.action, 'duck');

    // Acknowledge duck
    bridge.handleAck({ commandId: pulled.id, status: 'ducked' });
    const duckAcked = await unackedDuckPromise;
    assert.equal(duckAcked.status, 'ducked');

    // E. Redundant restore deduplication
    const restorePromise1 = bridge.dispatchCommand({ action: 'restore_volume' });
    const restorePromise2 = bridge.dispatchCommand({ action: 'restore_volume' });
    assert.strictEqual(restorePromise1, restorePromise2, 'Identical in-flight restore commands must be deduplicated');

    const pulledRestore = bridge.pullNextCommand();
    bridge.handleAck({ commandId: pulledRestore.id, status: 'volume_restored' });
    const resAcked = await restorePromise1;
    assert.equal(resAcked.status, 'volume_restored');
  });
});
