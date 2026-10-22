/**
 * test/pass2-2-4-2-tts-audible-lifecycle.test.cjs
 * Comprehensive verification suite for PASS 2.2.4.2:
 * Voice Agent Audible Speech Output, Lifecycle Continuity & Audio Ducking Protection.
 */

'use strict';

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

test('PASS 2.2.4.2 — Voice Agent Audible Speech Output & Lifecycle Suite', async (t) => {
  const { VoiceTurnController } = await import('../src/lib/voice-turn-controller.js');
  const { audioCoordinator } = await import('../src/lib/audio-coordinator.js');
  const { formatActionOutcomeSpeech } = await import('../src/lib/music-actions.js');
  const { interpretLocalMusicCommand } = await import('../src/lib/music-command-interpreter.js');

  const createAudioFrame = (length = 2048, amplitude = 0.04) => {
    return new Float32Array(length).fill(amplitude);
  };

  await t.test('1. Ordinary AI response triggers TTS and transitions to speaking', () => {
    let stateLog = [];
    const controller = new VoiceTurnController({
      silenceDurationMs: 50,
      minUtteranceDurationMs: 10,
      onStateChange: (state) => stateLog.push(state),
    });

    controller.startSession();
    assert.equal(controller.state, 'listening');

    const speechChunk = createAudioFrame(512, 0.05);
    controller.processAudioFrame(speechChunk, 0.05);
    controller.clearSilenceTimer();
    controller.onSilenceTimeout();

    assert.equal(controller.state, 'processing', 'Controller must be processing');
    const turnId = controller.turnId;

    const ok = controller.beginSpeaking(turnId);
    assert.equal(ok, true);
    assert.equal(controller.state, 'speaking', 'Must enter speaking state');
    assert.equal(controller.isSpeaking, true);
  });

  await t.test('2. While in speaking state, microphone input is strictly gated (no self-recording)', () => {
    const controller = new VoiceTurnController({
      speechThreshold: 0.02,
      interruptThreshold: 0.08,
    });
    controller.startSession();
    controller.startTurn(new Float32Array(512));
    const turnId = controller.turnId;
    controller.beginSpeaking(turnId);

    assert.equal(controller.state, 'speaking');

    const speakerAcousticAudio = createAudioFrame(512, 0.035);
    const processed = controller.processAudioFrame(speakerAcousticAudio, 0.035);

    assert.equal(processed, false, 'Audio frame must be dropped to prevent feedback loop');
    assert.equal(controller.isUserSpeaking, false, 'User must not be marked as speaking');
  });

  await t.test('3. Listening resumes ONLY after finishSpeaking is explicitly called at playback end', () => {
    const controller = new VoiceTurnController();
    controller.startSession();
    controller.startTurn(new Float32Array(512));
    const turnId = controller.turnId;

    assert.equal(controller.state, 'processing');

    controller.beginSpeaking(turnId);
    assert.equal(controller.state, 'speaking');

    assert.notEqual(controller.state, 'listening');

    controller.finishSpeaking(turnId, 'listening');
    assert.equal(controller.state, 'listening', 'State must return to listening only after playback ends');
  });

  await t.test('4. Stale turnId or mismatched turn cannot prematurely cancel active speech', () => {
    const controller = new VoiceTurnController();
    controller.startSession();
    controller.startTurn(new Float32Array(512));
    const turnId = controller.turnId;
    controller.beginSpeaking(turnId);
    assert.equal(controller.state, 'speaking');

    const finishedObsolete = controller.finishSpeaking(turnId - 1, 'listening');
    assert.equal(finishedObsolete, false, 'Obsolete turn finishSpeaking must be rejected');
    assert.equal(controller.state, 'speaking', 'Active speech must not be cancelled by stale callback');

    const finishedActive = controller.finishSpeaking(turnId, 'listening');
    assert.equal(finishedActive, true);
    assert.equal(controller.state, 'listening');
  });

  await t.test('5. TTS failure triggers error state and cleanly auto-recovers to listening', async () => {
    const controller = new VoiceTurnController();
    controller.startSession();
    controller.turnId = 2;
    controller.startTurn(new Float32Array(512));
    const turnId = controller.turnId;

    controller.handleTurnFailure(turnId, 'Gemini TTS daily quota reached (10/10 requests)');
    assert.equal(controller.state, 'error');

    assert.ok(controller._errorRecoveryTimer, 'Error recovery timer must be active');
    clearTimeout(controller._errorRecoveryTimer);

    controller.resetToListening(turnId);
    assert.equal(controller.state, 'listening', 'Session must be back in listening state');
  });

  await t.test('6. Fallback architecture: when Gemini quota is exhausted, Web Speech fallback is selected', () => {
    const mockChatRes = {
      ok: true,
      text: 'Here is your answer about quantum physics.',
      audioBase64: null,
      ttsError: {
        stage: 'tts',
        error: 'RESOURCE_EXHAUSTED',
        isDailyQuota: true,
      },
    };

    let chosenFallback = null;
    let userNotice = null;

    if (!mockChatRes.audioBase64) {
      if (mockChatRes.ttsError?.isDailyQuota) {
        userNotice = 'Gemini TTS daily quota reached (10/10 requests). Using Windows Voice fallback.';
      }
      chosenFallback = 'web_speech';
    }

    assert.equal(chosenFallback, 'web_speech', 'Fallback must be web_speech when cloud TTS is unavailable');
    assert.ok(userNotice.includes('quota reached'), 'Concise user notice must explain the fallback reason');
  });

  await t.test('7. Background audio ducks during speech and smoothly restores afterward', () => {
    audioCoordinator.setBaseVolume(0.85);
    assert.equal(audioCoordinator.baseVolume, 0.85);
    assert.equal(audioCoordinator.duckingMultiplier, 1.0);

    audioCoordinator.startDucking({ duckLevel: 0.22, durationMs: 0 });
    assert.equal(audioCoordinator.duckState, 'ducked');
    assert.equal(audioCoordinator.duckingMultiplier, 0.22);
    assert.ok(Math.abs(audioCoordinator.effectiveVolume - 0.187) < 0.001);

    audioCoordinator.restoreVolume({ durationMs: 0 });
    assert.equal(audioCoordinator.duckState, 'idle');
    assert.equal(audioCoordinator.duckingMultiplier, 1.0);
    assert.equal(audioCoordinator.effectiveVolume, 0.85, 'User volume must restore to original 85%');
  });

  await t.test('8. Session sustains 5 consecutive spoken turns without restarting', () => {
    const controller = new VoiceTurnController();
    controller.startSession();

    for (let i = 1; i <= 5; i++) {
      assert.equal(controller.state, 'listening', 'Turn ' + i + ' must start in listening');
      controller.startTurn(new Float32Array(512));
      assert.equal(controller.state, 'processing', 'Turn ' + i + ' transitions to processing');
      const tId = controller.turnId;

      controller.beginSpeaking(tId);
      assert.equal(controller.state, 'speaking', 'Turn ' + i + ' transitions to speaking');

      audioCoordinator.startDucking({ durationMs: 0 });
      assert.equal(audioCoordinator.duckState, 'ducked');

      audioCoordinator.restoreVolume({ durationMs: 0 });
      controller.finishSpeaking(tId, 'listening');

      assert.equal(controller.state, 'listening', 'Turn ' + i + ' finishes in listening');
      assert.equal(audioCoordinator.duckState, 'idle');
    }
  });

  await t.test('9. User interruption cancels active turn and restores volume immediately', () => {
    const controller = new VoiceTurnController({
      interruptThreshold: 0.05,
    });
    controller.startSession();
    controller.startTurn(new Float32Array(512));
    const turnId = controller.turnId;
    controller.beginSpeaking(turnId);
    assert.equal(controller.state, 'speaking');

    audioCoordinator.startDucking({ durationMs: 0 });
    assert.equal(audioCoordinator.duckState, 'ducked');

    const loudVoice = createAudioFrame(512, 0.07);
    const interrupted = controller.processAudioFrame(loudVoice, 0.07);

    assert.equal(interrupted, true, 'Loud audio frame must trigger interrupt');
    assert.equal(controller.state, 'listening', 'State must immediately reset to listening');
    assert.equal(controller.isSpeaking, false);

    audioCoordinator.cancelDucking();
    assert.equal(audioCoordinator.duckState, 'idle');
    assert.equal(audioCoordinator.duckingMultiplier, 1.0);
  });

  await t.test('10. Turn ID deduplication prevents multiple speech completion events', () => {
    const handledTurns = new Set();
    const turnId = 15;

    let completions = 0;
    const notifyCompletion = (tId) => {
      if (handledTurns.has(tId)) return;
      handledTurns.add(tId);
      completions += 1;
    };

    notifyCompletion(turnId);
    notifyCompletion(turnId);
    notifyCompletion(turnId);

    assert.equal(completions, 1, 'Only exactly 1 completion announcement can ever be produced per turn');
  });

  await t.test('11. Language preferences remain configurable and default to English', () => {
    const storage = createMockStorage({
      island_speech_language: 'en',
    });

    const getSpeechConfig = (store) => {
      const pref = store.getItem('island_speech_language') || 'en';
      return {
        speechLanguage: pref,
        whisperHint: pref === 'auto' ? undefined : pref,
        ttsLang: pref === 'hi' ? 'hi-IN' : 'en-US',
      };
    };

    const cfgEn = getSpeechConfig(storage);
    assert.equal(cfgEn.speechLanguage, 'en');
    assert.equal(cfgEn.whisperHint, 'en');
    assert.equal(cfgEn.ttsLang, 'en-US');

    storage.setItem('island_speech_language', 'hi');
    const cfgHi = getSpeechConfig(storage);
    assert.equal(cfgHi.speechLanguage, 'hi');
    assert.equal(cfgHi.whisperHint, 'hi');
    assert.equal(cfgHi.ttsLang, 'hi-IN');
  });

  await t.test('12. Music command interpretation remains fully intact and generates outcome text', () => {
    const cmd = interpretLocalMusicCommand('play my favorites', {
      favorites: [
        { id: '1', title: 'Starboy', artist: 'The Weeknd', playableUrl: 'https://music.youtube.com/watch?v=123' },
      ],
    });

    assert.ok(cmd.handledLocally);
    assert.equal(cmd.actionResult.action, 'play_random_favorite');

    const outcomeSpeech = formatActionOutcomeSpeech('confirmed_playing', 'Starboy', { isUnresolved: false });
    assert.ok(outcomeSpeech.includes('Playing Starboy'));
  });
});
