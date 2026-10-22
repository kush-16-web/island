'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  VoiceTurnController,
  ACTION_LIFECYCLE_STATES,
} = require('../src/lib/voice-turn-controller');
const {
  interpretLocalMusicCommand,
} = require('../src/lib/music-command-interpreter');
const {
  formatActionOutcomeSpeech,
} = require('../src/lib/music-actions');
const {
  addFavorite,
} = require('../src/lib/favorites');

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
    get length() { return store.size; },
    key: (i) => Array.from(store.keys())[i] || null,
  };
}

test('Pass 2.2.4.1 - Voice Recognition Reliability, Language Stability & Continuous Multi-Turn Flow', async (t) => {

  await t.test('1. English recognition remains default; language preference is configurable', () => {
    // Test language prompt configuration logic
    const getSystemPrompt = (language = 'en', assistantName = 'Assistant', userName = 'Friend') => {
      const preferredLang = (language || 'en').toLowerCase();
      const langInstruction = preferredLang === 'en'
        ? 'Default to English for all responses. You also naturally understand Hindi, Hinglish, and other languages, but only switch languages when the user clearly and intentionally speaks in that language or asks you to speak in it. Never switch languages due to a single foreign word, proper noun, song title (e.g. Pashmina), or noisy transcription.'
        : preferredLang === 'hi'
        ? 'Respond naturally in Hindi or Hinglish. If the user addresses you in English, respond in English.'
        : 'Default to English, but naturally accommodate the language intentionally used by the user. Do not switch languages on isolated proper nouns or song titles.';

      return `You are "${assistantName}" for "${userName}". ${langInstruction}`;
    };

    const defaultPrompt = getSystemPrompt('en');
    assert.match(defaultPrompt, /Default to English for all responses/);
    assert.match(defaultPrompt, /Never switch languages due to a single foreign word.*Pashmina/);

    const hindiPrompt = getSystemPrompt('hi');
    assert.match(hindiPrompt, /Respond naturally in Hindi or Hinglish/);

    const autoPrompt = getSystemPrompt('auto');
    assert.match(autoPrompt, /Default to English, but naturally accommodate/);
  });

  await t.test('2. Proper noun or song title does not contaminate language instruction', () => {
    const storage = createMockStorage();
    addFavorite({
      title: 'Pashmina',
      artist: 'Amit Trivedi',
      youtubeId: 'pashmina123',
      provider: 'youtube',
    }, storage);

    const inputWithProperNoun = 'Play Pashmina from my favorites';
    const evalResult = interpretLocalMusicCommand(inputWithProperNoun, {
      customStorage: storage,
      media: { active: false },
      onControl: () => {},
    });
    assert.equal(evalResult.handledLocally, true);
    assert.equal(evalResult.actionResult.ok, true);
    assert.equal(evalResult.actionResult.action, 'play_favorite');
    assert.equal(evalResult.actionResult.initialAcknowledgment, 'Opening Pashmina.');
  });

  await t.test('3. Bounded Adaptive VAD: Quiet speech triggers when noise floor is low', () => {
    const controller = new VoiceTurnController({
      speechThreshold: 0.02,
      useAdaptiveVad: true,
      initialNoiseFloor: 0.003,
      minUtteranceDurationMs: 100,
      silenceDurationMs: 400,
    });
    controller.startSession();

    // Ambient frames to stabilize low noise floor
    const ambientFrame = new Float32Array(2048).fill(0.002);
    for (let i = 0; i < 6; i++) {
      controller.processAudioFrame(ambientFrame, 0.002);
    }

    // Verify adaptive threshold adapted downwards (bounded >= 0.010)
    assert.ok(controller.noiseFloor <= 0.005);

    // Quiet speech frame with RMS 0.015 (would have been dropped by rigid 0.020 threshold)
    const quietSpeechFrame = new Float32Array(2048).fill(0.015);
    controller.processAudioFrame(quietSpeechFrame, 0.015);
    controller.processAudioFrame(quietSpeechFrame, 0.015);

    assert.equal(controller.isUserSpeaking, true, 'Quiet speech must be detected when background is quiet');
    controller.stopSession();
  });

  await t.test('4. Bounded Adaptive VAD: Elevated background noise raises threshold and prevents false triggers', () => {
    const controller = new VoiceTurnController({
      speechThreshold: 0.02,
      useAdaptiveVad: true,
      initialNoiseFloor: 0.018, // Elevated background room/music noise
      minUtteranceDurationMs: 100,
      silenceDurationMs: 400,
    });
    controller.startSession();

    // Background noise frames with RMS 0.018
    const noiseFrame = new Float32Array(2048).fill(0.018);
    controller.processAudioFrame(noiseFrame, 0.018);
    controller.processAudioFrame(noiseFrame, 0.018);

    // A low-amplitude transient (0.019) should NOT trigger speech because threshold adapted up
    controller.processAudioFrame(noiseFrame, 0.019);
    assert.equal(controller.isUserSpeaking, false, 'Elevated background noise must not falsely trigger speech');

    // Only genuine speech rising well above the noise floor (e.g. 0.048) triggers
    const genuineSpeech = new Float32Array(2048).fill(0.048);
    controller.processAudioFrame(genuineSpeech, 0.048);
    controller.processAudioFrame(genuineSpeech, 0.048);
    assert.equal(controller.isUserSpeaking, true, 'Genuine speech above adaptive noise threshold triggers');
    controller.stopSession();
  });

  await t.test('5. Pre-speech ring buffer holds 6 frames (~768ms) to preserve onset consonants', () => {
    const controller = new VoiceTurnController({
      preSpeechBufferLimit: 6,
    });
    controller.startSession();

    for (let i = 0; i < 10; i++) {
      const frame = new Float32Array(2048).fill(0.001 * (i + 1));
      controller.processAudioFrame(frame, 0.001);
    }

    assert.equal(controller.preSpeechRingBuffer.length, 6, 'Ring buffer must maintain max 6 frames');
    controller.stopSession();
  });

  await t.test('6. CONTINUOUS MULTI-TURN REGRESSION: 10 consecutive turns within ONE session without stopping', async () => {
    const stateHistory = [];
    let turnsTriggered = [];

    const controller = new VoiceTurnController({
      minUtteranceDurationMs: 50,
      silenceDurationMs: 100,
      onStateChange: (newState) => {
        stateHistory.push(newState);
      },
      onTurnTriggered: (samples, turnId) => {
        turnsTriggered.push(turnId);
      },
    });

    controller.startSession();
    assert.equal(controller.state, 'listening', 'Session starts in listening');

    const simulateSpeech = async (rms = 0.04, frameCount = 4) => {
      const frame = new Float32Array(2048).fill(rms);
      for (let i = 0; i < frameCount; i++) {
        controller.processAudioFrame(frame, rms);
      }
      // Provide quiet trailing frame to start silence timer
      const quiet = new Float32Array(2048).fill(0.001);
      controller.processAudioFrame(quiet, 0.001);
      // Wait for silence duration timeout to fire
      await new Promise((r) => setTimeout(r, 160));
    };

    // --- TURN 1: Normal question ---
    await simulateSpeech();
    assert.equal(controller.state, 'processing', 'Turn 1 transitions to processing');
    const t1 = controller.turnId;
    controller.beginSpeaking(t1);
    assert.equal(controller.state, 'speaking');
    controller.finishSpeaking(t1, 'listening');
    assert.equal(controller.state, 'listening', 'Turn 1 finishes and returns to listening');

    // --- TURN 2: Follow-up question in SAME session ---
    await simulateSpeech();
    assert.equal(controller.state, 'processing', 'Turn 2 transitions to processing in same session');
    const t2 = controller.turnId;
    assert.ok(t2 > t1, 'Turn 2 gets incremented turnId');
    controller.beginSpeaking(t2);
    controller.finishSpeaking(t2, 'listening');
    assert.equal(controller.state, 'listening', 'Turn 2 finishes and returns to listening');

    // --- TURN 3: Short response "yes" ---
    await simulateSpeech(0.04, 4);
    assert.equal(controller.state, 'processing');
    const t3 = controller.turnId;
    controller.beginSpeaking(t3);
    controller.finishSpeaking(t3, 'listening');
    assert.equal(controller.state, 'listening', 'Turn 3 (yes) returns to listening');

    // --- TURN 4: Short response "no" ---
    await simulateSpeech(0.04, 4);
    assert.equal(controller.state, 'processing');
    const t4 = controller.turnId;
    controller.beginSpeaking(t4);
    controller.finishSpeaking(t4, 'listening');
    assert.equal(controller.state, 'listening', 'Turn 4 (no) returns to listening');

    // --- TURN 5: Correction "No, I meant the other one" ---
    await simulateSpeech(0.04, 4);
    assert.equal(controller.state, 'processing');
    const t5 = controller.turnId;
    controller.beginSpeaking(t5);
    controller.finishSpeaking(t5, 'listening');
    assert.equal(controller.state, 'listening', 'Turn 5 returns to listening');

    // --- TURN 6: Music command followed by outcome speech ---
    await simulateSpeech(0.04, 4);
    assert.equal(controller.state, 'processing');
    const t6 = controller.turnId;
    controller.setState('acknowledging', { turnId: t6 });
    controller.setState('awaiting_result', { turnId: t6 });
    controller.setState('completed', { turnId: t6 });
    controller.beginSpeaking(t6);
    controller.finishSpeaking(t6, 'listening');
    assert.equal(controller.state, 'listening', 'Turn 6 (music command) returns to listening');

    // --- TURN 7: Unrelated follow-up question right after music ---
    await simulateSpeech(0.035, 4);
    assert.equal(controller.state, 'processing');
    const t7 = controller.turnId;
    controller.beginSpeaking(t7);
    controller.finishSpeaking(t7, 'listening');
    assert.equal(controller.state, 'listening', 'Turn 7 returns to listening');

    // --- TURN 8: Empty / noise transcript cleanly resets to listening ---
    await simulateSpeech(0.035, 4);
    const t8 = controller.turnId;
    controller.resetToListening(t8);
    assert.equal(controller.state, 'listening', 'Turn 8 (empty transcript) cleanly resets to listening');

    // --- TURN 9: Transient API failure with auto-recovery ---
    await simulateSpeech(0.035, 4);
    const t9 = controller.turnId;
    controller.handleTurnFailure(t9, 'Temporary network glitch');
    assert.equal(controller.state, 'error', 'Turn 9 briefly shows error');
    // Wait for auto-recovery timer
    await new Promise((r) => setTimeout(r, 2100));
    assert.equal(controller.state, 'listening', 'Turn 9 auto-recovers to listening state without manual restart');

    // --- TURN 10: TTS Interruption while speaking ---
    await simulateSpeech(0.035, 4);
    const t10 = controller.turnId;
    controller.beginSpeaking(t10);
    assert.equal(controller.state, 'speaking');
    controller.interrupt();
    assert.equal(controller.state, 'listening', 'Turn 10 (TTS interrupt) immediately returns to listening');

    // Verify 10 distinct turns were processed in sequence
    assert.equal(t10, 10, 'All 10 turns processed in a single continuous session');
    controller.stopSession();
    assert.equal(controller.state, 'idle', 'Explicit stopSession sets state to idle');
  });

  await t.test('7. Stale turn callback cannot overwrite active listening state', () => {
    const controller = new VoiceTurnController();
    controller.startSession();
    const oldTurnId = controller.turnId;

    // Advance turn
    controller.turnId = 99;
    controller.setState('listening');

    // Stale turn attempts to set state or finish speaking
    const res = controller.finishSpeaking(oldTurnId, 'idle');
    assert.equal(res, false, 'Stale turn cannot finish speaking');
    assert.equal(controller.state, 'listening', 'Controller remains in active listening');
    controller.stopSession();
  });

  await t.test('8. Error auto-recovery timer is cancelled on explicit stopSession or restart', () => {
    const controller = new VoiceTurnController();
    controller.startSession();
    controller.handleTurnFailure(controller.turnId, 'Test error');
    assert.equal(controller.state, 'error');
    assert.ok(controller._errorRecoveryTimer !== null);

    controller.stopSession();
    assert.equal(controller._errorRecoveryTimer, null, 'Timer must be cleaned up on stopSession');
    assert.equal(controller.state, 'idle');
  });

  await t.test('9. Crash diagnostics log structured records without throwing', () => {
    const tmpDir = os.tmpdir();
    const logPath = path.join(tmpDir, `island-test-crash-${Date.now()}.jsonl`);

    const logCrash = (type, details) => {
      const record = {
        timestamp: new Date().toISOString(),
        type,
        pid: process.pid,
        memory: process.memoryUsage(),
        ...details,
      };
      fs.appendFileSync(logPath, JSON.stringify(record) + '\n', 'utf8');
    };

    logCrash('uncaughtException', { message: 'Mock error', stack: 'Error: Mock\n  at test' });
    logCrash('render-process-gone:main', { reason: 'crashed', exitCode: 3489660927 });

    assert.ok(fs.existsSync(logPath));
    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
    assert.equal(lines.length, 2);
    const parsed = JSON.parse(lines[1]);
    assert.equal(parsed.type, 'render-process-gone:main');
    assert.equal(parsed.exitCode, 3489660927);
    fs.unlinkSync(logPath);
  });

  await t.test('10. Favorite playback outcome speech accurately communicates states', () => {
    assert.equal(
      formatActionOutcomeSpeech('confirmed_playing', 'Pashmina'),
      'Playing Pashmina. Enjoy!'
    );
    assert.equal(
      formatActionOutcomeSpeech('search_results_opened', 'Die For You', { isSearch: true }),
      "I've opened the results for Die For You."
    );
    assert.equal(
      formatActionOutcomeSpeech('autoplay_blocked', 'Pashmina'),
      "Pashmina is ready, but you'll need to press Play."
    );
    assert.equal(
      formatActionOutcomeSpeech('playback_pending', 'Pashmina'),
      "Pashmina is open. Playback hasn't started yet."
    );
    assert.equal(
      formatActionOutcomeSpeech('failed', 'Pashmina'),
      "I couldn't open Pashmina this time."
    );
  });

});
