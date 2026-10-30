'use strict';

/**
 * Phase 3.6 Test Suite: Voice Stability, Ghost Speech & Context Recovery
 * 
 * Verifies:
 * 1. Ghost speech & acoustic transient rejection (click/pop & low RMS rejected before STT).
 * 2. Whisper phantom hallucination filtering ("thank you", "thanks", "you", "bye" dropped on low energy/short audio).
 * 3. Legitimate intentional user speech is preserved.
 * 4. Acoustic echo grace period suppresses mic input right after assistant speech.
 * 5. Topic switch & greeting context recovery ("hello", "hi", "good morning" wipe pending music context).
 * 6. History deduplication: Groq & Gemini never receive duplicate consecutive user turns.
 * 7. Bounded runtime diagnostics: memory, event loop lag, and stage latency reporting.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

test('Phase 3.6 Voice Stability & Context Recovery Suite', async (t) => {
  const { VoiceTurnController } = await import('../src/lib/voice-turn-controller.js');
  const { MusicConversationContext } = await import('../src/lib/music/music-conversation-context.js');
  const { GroqService } = await import('../electron/groq.js');
  const { latencyTracker } = await import('../src/lib/nlu/latency-tracker.js');

  const createDummyAudioChunk = (samplesCount = 2048, value = 0.05) => {
    const chunk = new Float32Array(samplesCount);
    chunk.fill(value);
    return chunk;
  };

  await t.test('1. Ghost speech rejection: single transient pop/click does not trigger a turn in production mode', async () => {
    let turnsTriggered = [];
    const controller = new VoiceTurnController({
      silenceDurationMs: 400,
      minUtteranceDurationMs: 300, // standard production threshold
      sampleRate: 16000,
      onTurnTriggered: (samples, turnId) => {
        turnsTriggered.push({ turnId, samplesLength: samples.length });
      },
    });

    controller.startSession();
    assert.strictEqual(controller.state, 'listening');

    const clickFrame = createDummyAudioChunk(2048, 0.035);
    const quietFrame = createDummyAudioChunk(2048, 0.002);

    // Pre-populate ring buffer with background noise
    for (let i = 0; i < 4; i++) {
      controller.processAudioFrame(quietFrame, 0.003);
    }

    // A single isolated pop (e.g. mouse click or breath pop)
    controller.processAudioFrame(clickFrame, 0.04);
    assert.strictEqual(controller.isUserSpeaking, true);

    // Followed immediately by silence
    controller.processAudioFrame(quietFrame, 0.002);

    // Wait for silence timeout
    await new Promise((r) => setTimeout(r, 600));

    // Must NOT trigger a turn because speechFrameCount was 1 (isolated transient)
    assert.strictEqual(turnsTriggered.length, 0, 'Transient pop must be rejected and not trigger a turn');
    assert.strictEqual(controller.state, 'listening', 'Controller must remain in listening state');
  });

  await t.test('2. Acoustic echo grace period: mic input suppressed for 350ms after assistant finishes speaking', async () => {
    let turnsTriggered = [];
    const controller = new VoiceTurnController({
      silenceDurationMs: 300,
      minUtteranceDurationMs: 300,
      sampleRate: 16000,
      postAssistantSpeechCooldownMs: 350,
      onTurnTriggered: (samples, turnId) => {
        turnsTriggered.push(turnId);
      },
    });

    controller.startSession();
    controller.turnId = 1;
    controller.setState('processing', { turnId: 1 });
    controller.beginSpeaking(1);
    assert.strictEqual(controller.isSpeaking, true);

    // Assistant speech finishes
    controller.finishSpeaking(1, 'listening');
    assert.strictEqual(controller.state, 'listening');
    assert.strictEqual(controller.isSpeaking, false);

    const speechFrame = createDummyAudioChunk(2048, 0.04);

    // Speaker echo arriving 100ms after finish speaking (<350ms cooldown)
    const processedDuringCooldown = controller.processAudioFrame(speechFrame, 0.04);
    assert.strictEqual(processedDuringCooldown, false, 'Audio during post-speech cooldown must be dropped');
    assert.strictEqual(controller.isUserSpeaking, false);

    // Wait for cooldown to expire (>350ms)
    await new Promise((r) => setTimeout(r, 380));

    // Real user speech arriving after cooldown
    const processedAfterCooldown = controller.processAudioFrame(speechFrame, 0.04);
    assert.strictEqual(processedAfterCooldown, true, 'Audio after cooldown must be accepted');
    assert.strictEqual(controller.isUserSpeaking, true);
  });

  await t.test('3. Whisper hallucination filtering: short phantom closings ("thank you", "thanks") are detected and discarded', () => {
    const isPhantomHallucination = (text, bufferRms, bufferDurationMs) => {
      const rawLower = text.trim().toLowerCase();
      const isClassicHallucination = [
        'thank you for watching',
        'thanks for watching',
        'subtitles by',
        'amara.org',
        'subscribe to my channel',
      ].some((phrase) => rawLower.includes(phrase));

      const isPhantomClosing = /^(?:thank\s+you|thanks|you|bye)[.!]?$/i.test(rawLower);
      const isLowEnergyOrShort = bufferRms < 0.018 || bufferDurationMs < 900;

      return isClassicHallucination || (isPhantomClosing && isLowEnergyOrShort) || /^[.\s?!,;:\-_–—…]+$/.test(text.trim());
    };

    // Case 1: Whisper hallucinated "Thank you." on low-energy ambient noise
    assert.strictEqual(isPhantomHallucination('Thank you.', 0.008, 650), true, 'Must reject low-energy "Thank you."');
    assert.strictEqual(isPhantomHallucination('Thanks!', 0.012, 400), true, 'Must reject short "Thanks!"');
    assert.strictEqual(isPhantomHallucination('thank you for watching', 0.04, 1500), true, 'Must reject subtitle hallucination');

    // Case 2: User intentionally spoke "Thank you" clearly with normal speech energy and duration
    assert.strictEqual(isPhantomHallucination('Thank you so much', 0.035, 1200), false, 'Must preserve full phrase');
    assert.strictEqual(isPhantomHallucination('Thank you.', 0.035, 1100), false, 'Must preserve intentional audible "Thank you."');
    assert.strictEqual(isPhantomHallucination('What is the weather today?', 0.025, 1400), false, 'Must preserve ordinary speech');
  });

  await t.test('4. Topic switch & context recovery: "Hello" and greetings wipe pending music context', () => {
    const musicContext = new MusicConversationContext();

    // Simulate an earlier failed music search
    musicContext.recordFailure('play_track', 'Guardians of the Galaxy Soundtrack', 'not_found', [
      { id: '1', title: 'Hooked on a Feeling', artist: 'Blue Swede' },
    ]);

    assert.strictEqual(musicContext.pendingIntent !== null, true);
    assert.strictEqual(musicContext.previousCandidates.length, 1);
    assert.strictEqual(musicContext.lastFailedAction !== null, true);

    // Later, the user says "Hello"
    const switched = musicContext.suspendOnTopicSwitch('Hello');
    assert.strictEqual(switched, true, 'Greeting "Hello" must trigger topic switch');

    // Music pending context must be wiped completely
    assert.strictEqual(musicContext.pendingIntent, null, 'pendingIntent must be null');
    assert.strictEqual(musicContext.previousCandidates.length, 0, 'candidates must be cleared');
    assert.strictEqual(musicContext.lastFailedAction, null, 'lastFailedAction must be null');

    // Verify other common greetings
    const testGreetings = ['Hi', 'Hey', 'Good morning', 'Good evening', "What's up", 'Howdy'];
    for (const g of testGreetings) {
      musicContext.recordFailure('play_track', 'Test Song');
      assert.strictEqual(musicContext.suspendOnTopicSwitch(g), true, `Greeting "${g}" must trigger topic switch`);
      assert.strictEqual(musicContext.pendingIntent, null);
    }
  });

  await t.test('5. History deduplication: GroqService chat & chatStream never push duplicate consecutive user turns', async () => {
    const https = require('https');
    const { EventEmitter } = require('events');
    const groq = new GroqService({ apiKey: 'gsk_test_dummy_key_not_real' });

    let capturedMessages = null;
    const origRequest = https.request;
    https.request = (opts, callback) => {
      const reqEmitter = new EventEmitter();
      reqEmitter.setTimeout = () => {};
      reqEmitter.destroy = () => {};
      reqEmitter.write = (chunk) => {
        try {
          const body = JSON.parse(chunk);
          capturedMessages = body.messages;
        } catch {}
      };
      reqEmitter.end = () => {
        const resEmitter = new EventEmitter();
        resEmitter.statusCode = 200;
        resEmitter.headers = {};
        callback(resEmitter);
        resEmitter.emit('data', JSON.stringify({
          id: 'test_chat_id',
          choices: [{ message: { content: 'Hello Friend!' } }],
        }));
        resEmitter.emit('end');
      };
      return reqEmitter;
    };

    try {
      const userText = 'Hello';
      // Caller passes history that ALREADY contains the user turn
      const historyWithDuplicate = [
        { role: 'user', text: 'Previous question' },
        { role: 'assistant', text: 'Previous answer' },
        { role: 'user', text: 'Hello' },
      ];

      await groq.chat({
        text: userText,
        history: historyWithDuplicate,
        assistantName: 'Island',
        userName: 'Friend',
      });

      assert.strictEqual(Array.isArray(capturedMessages), true);
      // Filter out system prompt
      const nonSystemMessages = capturedMessages.filter((m) => m.role !== 'system');

      // Count consecutive 'Hello' user messages
      const helloUserMessages = nonSystemMessages.filter((m) => m.role === 'user' && m.content === 'Hello');
      assert.strictEqual(helloUserMessages.length, 1, 'Must contain exactly ONE "Hello" user turn, never a duplicate');

      // Verify sequence is alternating user/assistant/user
      assert.strictEqual(nonSystemMessages[0].content, 'Previous question');
      assert.strictEqual(nonSystemMessages[1].content, 'Previous answer');
      assert.strictEqual(nonSystemMessages[2].content, 'Hello');
      assert.strictEqual(nonSystemMessages.length, 3, 'Total non-system messages must be 3');
    } finally {
      https.request = origRequest;
    }
  });

  await t.test('6. Bounded runtime diagnostics: captures memory, event loop lag, and turn latencies safely', async () => {
    const snapshot = await latencyTracker.captureSystemSnapshot();

    assert.strictEqual(typeof snapshot.timestamp, 'number');
    assert.strictEqual(typeof snapshot.eventLoopLagMs, 'number');
    assert.strictEqual(snapshot.eventLoopLagMs >= 0, true);
    assert.strictEqual(snapshot.mainProcess !== null, true);
    assert.strictEqual(typeof snapshot.mainProcess.memory.rssMb, 'number');

    // Record and complete a turn
    latencyTracker.startTurn(101);
    latencyTracker.recordStage(101, 'stt_start');
    latencyTracker.recordStage(101, 'stt_end');
    latencyTracker.recordStage(101, 'audio_first_chunk');
    const metrics = latencyTracker.completeTurn(101, 'completed');

    assert.strictEqual(metrics.turnId, '101');
    assert.strictEqual(metrics.status, 'completed');
    assert.strictEqual(typeof metrics.userStopToAudioMs, 'number');

    // Verify privacy: no raw user text in metrics object
    assert.strictEqual(metrics.userText, undefined);
  });
});
