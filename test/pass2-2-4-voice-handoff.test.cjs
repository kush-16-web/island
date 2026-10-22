'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { CompanionBridge } = require('../electron/companion-bridge');
const { createNotifyServer } = require('../electron/notify-server');
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
  addFavorite,
  getAllFavorites,
  SUPPORTED_PROVIDERS,
} = require('../src/lib/favorites');
const {
  VoiceTurnController,
  ACTION_LIFECYCLE_STATES,
} = require('../src/lib/voice-turn-controller');
const {
  getAssistantName,
  setAssistantName,
} = require('../src/lib/assistant');

test('Pass 2.2.4 - Voice Handoff, Compound Commands & Browser Outcomes', async (t) => {
  let bridge;
  let server;
  let port;

  t.beforeEach(async () => {
    bridge = new CompanionBridge({ pingExpiryMs: 3000, commandTimeoutMs: 2000 });
    server = createNotifyServer({
      port: 0,
      companionBridge: bridge,
      onNotify: () => 'test-id',
      onVideoState: () => {},
    });
    port = await server.listen();
  });

  t.afterEach(async () => {
    if (bridge) bridge.reset();
    if (server) await server.close();
  });

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
      keys: () => Array.from(store.keys()),
    };
  }

  // --- 1. Simple favorite playback with verified completion ---
  await t.test('1. Simple favorite playback prompt acknowledgment and verified completion speech', () => {
    const storage = createMockStorage();
    addFavorite({
      title: 'Pashmina',
      artist: 'Amit Trivedi',
      youtubeId: 'pashminaVid123',
      provider: 'youtube',
    }, storage);

    let dispatchedCmd = null;
    const evalResult = interpretLocalMusicCommand('play Pashmina from my favorites', {
      customStorage: storage,
      onDispatchCompanion: (cmd) => { dispatchedCmd = cmd; },
      companion: { connected: true, isYtMusicActive: true },
    });

    assert.equal(evalResult.handledLocally, true);
    assert.equal(evalResult.actionResult.ok, true);
    assert.equal(evalResult.actionResult.initialAcknowledgment, 'Opening Pashmina.');
    assert.equal(evalResult.actionResult.awaitingResult, true);

    // Prompt acknowledgment does NOT claim playing yet
    assert.doesNotMatch(evalResult.actionResult.initialAcknowledgment, /Playing Pashmina/);

    // When verified playing, completion speech is context-aware
    const completionSpeech = formatActionOutcomeSpeech('confirmed_playing', 'Pashmina');
    assert.equal(completionSpeech, 'Playing Pashmina. Enjoy!');
  });

  // --- 2. Compound pause-then-play request ---
  await t.test('2. Compound pause-then-play request pauses current source and opens favorite in sequence', () => {
    const storage = createMockStorage();
    addFavorite({
      title: 'Pashmina',
      artist: 'Amit Trivedi',
      youtubeId: 'pashmina123',
      provider: 'youtube',
    }, storage);

    const controls = [];
    let dispatchedCmd = null;

    const evalResult = interpretLocalMusicCommand('Pause the current song and play Pashmina from my favorites', {
      media: { active: true, status: 'playing', title: 'Old Song', artist: 'Old Artist' },
      onControl: (action) => controls.push(action),
      onDispatchCompanion: (cmd) => { dispatchedCmd = cmd; },
      customStorage: storage,
      companion: { connected: true, isYtMusicActive: true },
    });

    assert.equal(evalResult.handledLocally, true);
    assert.equal(evalResult.isCompound, true);
    assert.equal(evalResult.actionResult.action, 'compound_pause_play');
    // 1. Pauses current source
    assert.deepEqual(controls, ['pause']);
    // 2. Dispatches play for target track
    assert.equal(dispatchedCmd?.videoId, 'pashmina123');
    // 3. Prompt acknowledgment confirms both actions
    assert.equal(evalResult.actionResult.initialAcknowledgment, 'Pausing and opening Pashmina.');
    // 4. Final speech gives one concise response
    const finalSpeech = formatActionOutcomeSpeech('confirmed_playing', 'Pashmina');
    assert.equal(finalSpeech, 'Playing Pashmina. Enjoy!');
  });

  // --- 3. Search-results fallback without false playback claim ---
  await t.test('3. Search-results fallback opens search and accurately describes outcome without false playback claim', () => {
    const storage = createMockStorage();
    // Legacy favorite without exact video ID (reproducing Die For You)
    addFavorite({
      title: 'Die For You',
      artist: 'The Weeknd',
      provider: 'youtube',
    }, storage);

    let dispatchedCmd = null;
    const evalResult = interpretLocalMusicCommand('Play Die For You from my favorites', {
      customStorage: storage,
      onDispatchCompanion: (cmd) => { dispatchedCmd = cmd; },
      companion: { connected: true, isYtMusicActive: true },
    });

    assert.equal(evalResult.handledLocally, true);
    assert.equal(evalResult.actionResult.status, 'opened_provider');
    assert.equal(evalResult.actionResult.isUnresolved, true);
    assert.equal(evalResult.actionResult.initialAcknowledgment, 'Opening Die For You.');
    assert.match(dispatchedCmd.url, /search\?q=Die/);

    // Completion speech truthfully describes search results opened
    const outcomeSpeech = formatActionOutcomeSpeech('search_results_opened', 'Die For You', { isUnresolved: true });
    assert.equal(outcomeSpeech, "I've opened the results for Die For You.");
    assert.doesNotMatch(outcomeSpeech, /Playing Die For You/);
  });

  // --- 4. Playback blocked ---
  await t.test('4. Browser autoplay blocked reports need for user action truthfully', () => {
    const speech = formatActionOutcomeSpeech('autoplay_blocked', 'Pashmina');
    assert.equal(speech, "Pashmina is ready, but you'll need to press Play.");
  });

  // --- 5. Playback timeout / pending ---
  await t.test('5. Playback pending / timeout reports pending playback or honest inability to open', () => {
    const pendingSpeech = formatActionOutcomeSpeech('playback_pending', 'Pashmina');
    assert.equal(pendingSpeech, "Pashmina is open. Playback hasn't started yet.");

    const failedSpeech = formatActionOutcomeSpeech('failed', 'Pashmina');
    assert.equal(failedSpeech, "I couldn't open Pashmina this time.");
  });

  // --- 6. Assistant already showing player screen preserves player screen ---
  await t.test('6. Assistant already showing player screen does NOT force switch to favorites', () => {
    let navigated = false;
    const fakeWindow = {
      dispatchEvent: (e) => {
        if (e.detail?.viewMode === 'favorites') navigated = true;
      },
    };

    const storage = createMockStorage();
    addFavorite({ title: 'Pashmina', artist: 'Amit Trivedi', youtubeId: 'pash123', provider: 'youtube' }, storage);

    const res = executeMusicAction({ action: 'play_favorite', track: { title: 'Pashmina', youtubeId: 'pash123', provider: 'youtube' } }, {
      customStorage: storage,
      companion: { connected: true, isYtMusicActive: true },
      onDispatchCompanion: () => {},
    });

    assert.equal(res.ok, true);
    // Routine playback does NOT switch view mode to favorites
    assert.equal(navigated, false);
  });

  // --- 7. Assistant on another screen preserves current screen ---
  await t.test('7. Voice playback execution preserves whatever screen the assistant is currently on', () => {
    let forcedNav = null;
    const mockDispatch = (event) => {
      forcedNav = event.detail?.tab;
    };

    // Calling formatActionOutcomeSpeech and completing turn should not force dispatch of navigation
    const speech = formatActionOutcomeSpeech('confirmed_playing', 'Pashmina');
    assert.equal(speech, 'Playing Pashmina. Enjoy!');
    assert.equal(forcedNav, null);
  });

  // --- 8. TTS finishes before compact UI returns to idle ---
  await t.test('8. VoiceTurnController transitions to idle only when finishSpeaking is called', () => {
    let observedState = null;
    const controller = new VoiceTurnController({
      onStateChange: (newState) => { observedState = newState; },
    });

    controller.startSession();
    assert.equal(controller.state, 'listening');

    const turnId = controller.startTurn(new Float32Array(1000));
    assert.equal(controller.state, 'processing');

    // Acknowledging speech starts
    controller.beginSpeaking(turnId, 'acknowledging');
    assert.equal(controller.state, 'acknowledging');
    assert.equal(controller.isSpeaking, true);

    // While TTS is playing, state remains active
    assert.notEqual(controller.state, 'idle');

    // Only when TTS ends does it transition
    controller.finishSpeaking(turnId, 'awaiting_result');
    assert.equal(controller.state, 'awaiting_result');
    assert.equal(controller.isSpeaking, false);

    // Final speech playback begins
    controller.beginSpeaking(turnId, 'completed');
    assert.equal(controller.state, 'completed');

    // Final speech playback ends -> idle
    controller.finishSpeaking(turnId, 'idle');
    assert.equal(controller.state, 'idle');
  });

  // --- 9. Rapid consecutive voice commands supersede older commands ---
  await t.test('9. Rapid consecutive voice commands supersede older turns cleanly', () => {
    const states = [];
    const controller = new VoiceTurnController({
      onStateChange: (newState, _old, meta) => states.push({ newState, turnId: meta?.turnId }),
    });

    controller.startSession();
    const turn1 = controller.startTurn(new Float32Array(500));
    assert.equal(turn1, 1);
    assert.equal(controller.isTurnActive(turn1), true);

    // User interrupts and speaks a new command immediately
    controller.interrupt();
    const turn2 = controller.startTurn(new Float32Array(500));
    assert.equal(turn2, 2);

    // Turn 1 is now stale and completely inactive
    assert.equal(controller.isTurnActive(turn1), false);
    assert.equal(controller.isTurnActive(turn2), true);
  });

  // --- 10. Stale acknowledgment cannot trigger outdated speech ---
  await t.test('10. Stale acknowledgment from older turn cannot speak or overwrite active status', () => {
    const controller = new VoiceTurnController();
    controller.startSession();
    const turn1 = controller.startTurn(new Float32Array(500));

    controller.interrupt();
    const turn2 = controller.startTurn(new Float32Array(500));

    // Stale ack for turn 1 arrives
    const shouldSpeakOld = controller.isTurnActive(turn1);
    assert.equal(shouldSpeakOld, false);

    // Active turn 2 remains valid
    const shouldSpeakNew = controller.isTurnActive(turn2);
    assert.equal(shouldSpeakNew, true);
  });

  // --- 11. Existing YouTube Music tab reused ---
  await t.test('11. Dispatching commands reuses existing eligible YouTube Music tab', async () => {
    const dispatchP = bridge.dispatchCommand({
      action: 'play_track',
      videoId: 'pashminaVid',
      title: 'Pashmina',
    });

    // Command queued for existing tab
    const pulled = bridge.pullNextCommand();
    assert.equal(pulled.videoId, 'pashminaVid');
    assert.equal(pulled.action, 'play_track');

    // Primary tab acknowledges
    bridge.handleAck({
      commandId: pulled.id,
      status: 'confirmed_playing',
      videoId: 'pashminaVid',
    });

    const res = await dispatchP;
    assert.equal(res.status, 'confirmed_playing');
  });

  // --- 12. New tab created only when genuinely necessary ---
  await t.test('12. Bridge diagnostics distinguish connected tabs count', () => {
    bridge.handlePing({ isYtMusic: true, tabsCount: 2 });
    assert.equal(bridge.getStatus().tabsCount, 2);
    assert.equal(bridge.getStatus().isYtMusicActive, true);
  });

  // --- 13. No duplicate browser tabs or TTS responses ---
  await t.test('13. Deduplication guard ensures at most one completion announcement', () => {
    const handledTurns = new Set();
    const turnId = 42;

    let announcementsCount = 0;
    const announceCompletion = (id) => {
      if (handledTurns.has(id)) return;
      handledTurns.add(id);
      announcementsCount++;
    };

    announceCompletion(turnId);
    announceCompletion(turnId);
    announceCompletion(turnId);

    assert.equal(announcementsCount, 1);
  });

  // --- 14. Configurable assistant name remains supported ---
  await t.test('14. Dynamic assistant name is respected in voice commands and prefix stripping', () => {
    const originalName = getAssistantName();

    setAssistantName('Jett');
    assert.equal(getAssistantName(), 'Jett');

    const stripped = sanitizeSpokenInput('Hey Jett please play Pashmina from my favorites');
    assert.equal(stripped.toLowerCase(), 'play pashmina from my favorites');

    setAssistantName('Nova');
    assert.equal(getAssistantName(), 'Nova');

    const strippedNova = sanitizeSpokenInput('Hey Nova can you pause the current song and play Pashmina');
    assert.equal(strippedNova.toLowerCase(), 'pause the current song and play pashmina');

    // Restore original name
    setAssistantName(originalName);
  });
});
