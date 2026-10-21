'use strict';

/**
 * Isolated Offline Test Suite for Jadu Voice Agent Stability & Turn Controller
 * 
 * Tests:
 * 1. Rapid speech pauses: Brief pauses (<1400ms) do not split utterances.
 * 2. Double VAD callbacks: Rapid frame processing does not duplicate timers or turns.
 * 3. In-flight lock: Audio arriving while 'processing' is rejected; 0 overlapping calls.
 * 4. Speaker mic suppression: Assistant speech playback suppresses microphone input.
 * 5. Intentional interrupt: Loud user audio during playback triggers immediate stop.
 * 6. Rate-limit 429 cooldown: Enforces model-specific backoff; locks turns until expired.
 * 7. Turn ID validation: Stale responses from slow or interrupted turns are safely discarded.
 * 8. Pre-speech ring buffer: Leading consonants from ~400ms before VAD threshold are preserved.
 * 9. Session cleanup: Stopping session clears all timers, buffers, and invalidates in-flight turns.
 * 
 * STRICT ZERO NETWORK CALLS: Runs 100% offline with mocked audio and timers.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

test('Jadu Voice Stability & Turn Controller Test Suite', async (t) => {
  // Dynamically import ES Module VoiceTurnController
  const { VoiceTurnController } = await import('../src/lib/voice-turn-controller.js');

  const createDummyAudioChunk = (samplesCount = 2048, value = 0.05) => {
    const chunk = new Float32Array(samplesCount);
    chunk.fill(value);
    return chunk;
  };

  await t.test('1. Rapid speech pauses: pauses under silenceDurationMs (1400ms) do not split utterance', async () => {
    let turnsTriggered = [];
    const controller = new VoiceTurnController({
      silenceDurationMs: 60, // Scaled for fast unit testing
      minUtteranceDurationMs: 10,
      sampleRate: 16000,
      onTurnTriggered: (samples, turnId) => {
        turnsTriggered.push({ turnId, samplesLength: samples.length });
      },
    });

    controller.startSession();
    assert.strictEqual(controller.state, 'listening');

    const frame = createDummyAudioChunk(512, 0.05);

    // Speak word 1
    controller.processAudioFrame(frame, 0.04);
    assert.strictEqual(controller.isUserSpeaking, true);

    // Pause for 20ms (less than 60ms threshold)
    controller.processAudioFrame(frame, 0.005);
    await new Promise((r) => setTimeout(r, 20));

    // Speak word 2 (resuming speech cancels the silence timer)
    controller.processAudioFrame(frame, 0.04);
    assert.strictEqual(turnsTriggered.length, 0, 'Should not have triggered a turn during pause');

    // Wait full silence period (>60ms)
    controller.processAudioFrame(frame, 0.005);
    await new Promise((r) => setTimeout(r, 80));

    assert.strictEqual(turnsTriggered.length, 1, 'Exactly one unified turn should be triggered');
    assert.strictEqual(controller.state, 'processing', 'Should transition to processing state');
  });

  await t.test('2. Double VAD callbacks: multiple rapid quiet frames do not spawn multiple timers or duplicate turns', async () => {
    let turnCount = 0;
    const controller = new VoiceTurnController({
      silenceDurationMs: 40,
      minUtteranceDurationMs: 10,
      onTurnTriggered: () => {
        turnCount += 1;
      },
    });

    controller.startSession();
    const loudFrame = createDummyAudioChunk(512, 0.05);
    const quietFrame = createDummyAudioChunk(512, 0.001);

    // Initial speech
    controller.processAudioFrame(loudFrame, 0.05);

    // Rapid barrage of quiet frames
    for (let i = 0; i < 20; i++) {
      controller.processAudioFrame(quietFrame, 0.002);
    }

    await new Promise((r) => setTimeout(r, 70));

    assert.strictEqual(turnCount, 1, 'Only exactly 1 turn should fire despite multiple quiet callbacks');
  });

  await t.test('3. In-flight lock: microphone input while in "processing" state is completely rejected', () => {
    let submittedTurns = 0;
    const controller = new VoiceTurnController({
      silenceDurationMs: 50,
      minUtteranceDurationMs: 10,
      onTurnTriggered: () => {
        submittedTurns += 1;
      },
    });

    controller.startSession();
    const frame = createDummyAudioChunk(512, 0.05);

    // Start Turn 1
    controller.startTurn(new Float32Array(1000));
    assert.strictEqual(controller.state, 'processing');
    assert.strictEqual(controller.isProcessing, true);

    // User speaks into mic while Gemini is still processing
    const accepted = controller.processAudioFrame(frame, 0.05);
    assert.strictEqual(accepted, false, 'Audio frame must be rejected when turn is in-flight');

    // Attempt direct startTurn
    const secondTurnId = controller.startTurn(new Float32Array(500));
    assert.strictEqual(secondTurnId, null, 'startTurn must return null when lock is active');
    assert.strictEqual(submittedTurns, 1, 'No additional turn should have executed');
  });

  await t.test('4. Speaker mic suppression: assistant speech drops mic audio (eliminates acoustic loop)', () => {
    const controller = new VoiceTurnController();
    controller.startSession();

    const turnId = controller.startTurn(new Float32Array(500));
    controller.beginSpeaking(turnId);

    assert.strictEqual(controller.state, 'speaking');
    assert.strictEqual(controller.isSpeaking, true);

    const normalVoice = createDummyAudioChunk(512, 0.03); // Normal volume from speaker
    const accepted = controller.processAudioFrame(normalVoice, 0.03);

    assert.strictEqual(accepted, false, 'Normal audio during playback must be suppressed');
    assert.strictEqual(controller.accumulatedChunks.length, 0, 'No samples should be accumulated');
    assert.strictEqual(controller.state, 'speaking');
  });

  await t.test('5. Intentional voice interrupt: loud audio (above interruptThreshold) stops assistant playback', () => {
    let stateHistory = [];
    const controller = new VoiceTurnController({
      interruptThreshold: 0.045,
      onStateChange: (newState) => stateHistory.push(newState),
    });

    controller.startSession();
    const turnId = controller.startTurn(new Float32Array(500));
    controller.beginSpeaking(turnId);
    assert.strictEqual(controller.state, 'speaking');

    // Loud utterance from user
    const loudInterrupt = createDummyAudioChunk(512, 0.08);
    const result = controller.processAudioFrame(loudInterrupt, 0.06);

    assert.strictEqual(result, true);
    assert.strictEqual(controller.state, 'listening', 'Should immediately transition to listening upon interrupt');
    assert.strictEqual(controller.isSpeaking, false);
  });

  await t.test('6. Rate-limit 429 cooldown: locks turns and decrements countdown timer', async () => {
    let cooldownTicks = [];
    let stateHistory = [];

    const controller = new VoiceTurnController({
      onStateChange: (newState) => stateHistory.push(newState),
      onCooldownTick: (sec) => cooldownTicks.push(sec),
    });

    controller.startSession();
    const turnId = controller.startTurn(new Float32Array(500));

    // Simulate 429 with 2-second retry delay
    controller.handleTurnFailure(turnId, 'Quota exceeded', { retryDelaySeconds: 2 });

    assert.strictEqual(controller.state, 'cooldown');
    assert.strictEqual(controller.cooldownSeconds, 2);

    // Verify mic audio is rejected during cooldown
    const frame = createDummyAudioChunk(512, 0.05);
    const micAccepted = controller.processAudioFrame(frame, 0.05);
    assert.strictEqual(micAccepted, false, 'Mic must be locked during cooldown');

    // Verify startTurn is rejected
    const blockedTurn = controller.startTurn(frame);
    assert.strictEqual(blockedTurn, null, 'startTurn must be blocked during cooldown');

    // Wait for cooldown to expire (~2.1s)
    await new Promise((r) => setTimeout(r, 2200));

    assert.strictEqual(controller.state, 'listening', 'Should automatically return to listening after cooldown');
    assert.strictEqual(controller.cooldownSeconds, 0);
  });

  await t.test('7. Turn ID validation: discards responses from stale or interrupted turns', () => {
    const controller = new VoiceTurnController();
    controller.startSession();

    // Turn 1 starts
    const turn1Id = controller.startTurn(new Float32Array(100));
    assert.strictEqual(turn1Id, 1);

    // User interrupts or turn resets
    controller.interrupt();
    assert.strictEqual(controller.state, 'listening');

    // Turn 2 starts
    const turn2Id = controller.startTurn(new Float32Array(100));
    assert.strictEqual(turn2Id, 2);

    // Stale response from Turn 1 arrives late
    const staleResult = controller.beginSpeaking(turn1Id);
    assert.strictEqual(staleResult, false, 'Stale turn response must return false');
    assert.strictEqual(controller.turnId, 2, 'Active turnId should remain 2');

    // Active response from Turn 2 arrives
    const activeResult = controller.beginSpeaking(turn2Id);
    assert.strictEqual(activeResult, true, 'Active turn response must be accepted');
    assert.strictEqual(controller.state, 'speaking');
  });

  await t.test('8. Pre-speech ring buffer: preserves lead-in consonants prior to threshold trip', async () => {
    let capturedSamples = null;
    const controller = new VoiceTurnController({
      silenceDurationMs: 40,
      minUtteranceDurationMs: 10,
      preSpeechBufferLimit: 3,
      onTurnTriggered: (samples) => {
        capturedSamples = samples;
      },
    });

    controller.startSession();

    // Feed 3 quiet frames (consonant onsets, e.g. "s", "p", "th")
    const preFrame1 = createDummyAudioChunk(100, 0.011);
    const preFrame2 = createDummyAudioChunk(100, 0.012);
    const preFrame3 = createDummyAudioChunk(100, 0.013);

    controller.processAudioFrame(preFrame1, 0.011);
    controller.processAudioFrame(preFrame2, 0.012);
    controller.processAudioFrame(preFrame3, 0.013);

    assert.strictEqual(controller.isUserSpeaking, false);
    assert.strictEqual(controller.preSpeechRingBuffer.length, 3, 'Pre-speech buffer should hold 3 frames');

    // Speech crosses threshold
    const loudFrame = createDummyAudioChunk(100, 0.05);
    controller.processAudioFrame(loudFrame, 0.05);
    assert.strictEqual(controller.isUserSpeaking, true);
    assert.strictEqual(controller.preSpeechRingBuffer.length, 0, 'Pre-speech buffer must be flushed to speech');

    // Send quiet frame to start silence countdown
    const quietFrame = createDummyAudioChunk(100, 0.005);
    controller.processAudioFrame(quietFrame, 0.005);

    // Silence
    await new Promise((r) => setTimeout(r, 60));

    assert.ok(capturedSamples, 'Turn should trigger with samples');
    assert.strictEqual(capturedSamples.length, 500, 'All 3 pre-speech frames (300) + loud frame (100) + trailing frame (100) must be captured');
    assert.ok(Math.abs(capturedSamples[0] - 0.011) < 1e-5, 'The earliest pre-speech consonant sample must be at index 0');
  });

  await t.test('9. Session cleanup: stopSession cleans all timers, buffers, and resets to idle', () => {
    const controller = new VoiceTurnController();
    controller.startSession();

    controller.processAudioFrame(createDummyAudioChunk(500, 0.05), 0.05);
    controller.stopSession();

    assert.strictEqual(controller.state, 'idle');
    assert.strictEqual(controller.isProcessing, false);
    assert.strictEqual(controller.isSpeaking, false);
    assert.strictEqual(controller.isUserSpeaking, false);
    assert.strictEqual(controller.accumulatedChunks.length, 0);
    assert.strictEqual(controller.preSpeechRingBuffer.length, 0);
  });
});
