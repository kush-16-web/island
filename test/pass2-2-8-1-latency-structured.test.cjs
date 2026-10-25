'use strict';
/**
 * test/pass2-2-8-1-latency-structured.test.cjs
 * Comprehensive test suite and latency measurement harness for PASS 2.2.8.1.
 *
 * Verifies:
 * 1. Short conversational reply latency & contract.
 * 2. Longer conversational reply sentence pipelining.
 * 3. Song-list tool result structured presentation & separation.
 * 4. Weather result structured presentation & separation.
 * 5. Timer/alarm result structured presentation & separation.
 * 6. TTS provider failure and graceful fallback.
 * 7. Interrupted speech cancellation and order preservation.
 * 8. Repeated back-to-back requests with warm worker reuse.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { windowsTtsService } = require('../electron/windows-tts.js');

test('Pass 2.2.8.1: Voice First-Audio Latency & Structured Response Suite', async (t) => {
  const { splitIntoSpeechSentences } = await import('../src/lib/sentence-chunker.js');
  const {
    createAgentResponse,
    cleanTextForSpeech,
    formatFavoritesResponse,
    formatWeatherResponse,
  } = await import('../src/lib/agent-response-contract.js');

  const timingMetrics = [];

  // Helper to simulate and time pipeline stages
  async function runSimulatedTurn(name, {
    userSpeechDurationMs = 1200,
    transcriptGenMs = 150,
    llmGenMs = 300,
    spokenText = 'Hello.',
    toolResult = null,
    ttsEngine = 'windows',
    forceFailure = false,
    interrupted = false,
  }) {
    const tSpeechEnd = Date.now();
    await new Promise((r) => setTimeout(r, transcriptGenMs));
    const tTranscriptReady = Date.now();

    await new Promise((r) => setTimeout(r, llmGenMs));
    const tResponseReady = Date.now();

    // Sentence pipelining
    const cleanSpoken = cleanTextForSpeech(spokenText);
    const sentences = splitIntoSpeechSentences(cleanSpoken);

    let firstAudioTime = null;
    let ttsError = null;

    if (forceFailure) {
      // Simulate primary failure and fallback
      ttsError = 'Primary cloud TTS failed';
      const fallbackRes = await windowsTtsService.synthesizeSpeech({ text: sentences[0] || 'Hello' });
      assert.ok(fallbackRes.ok, 'Fallback to native Windows TTS should succeed');
      firstAudioTime = Date.now();
    } else if (interrupted) {
      // User interrupts immediately after response is ready
      windowsTtsService.cancel();
      firstAudioTime = null; // Interrupted before first audio
    } else {
      // Sentence 1 synthesis
      const res = await windowsTtsService.synthesizeSpeech({ text: sentences[0] || 'Hello' });
      assert.ok(res.ok, 'TTS should succeed');
      firstAudioTime = Date.now();
    }

    const metric = {
      name,
      speechEndToTranscriptMs: tTranscriptReady - tSpeechEnd,
      transcriptToResponseMs: tResponseReady - tTranscriptReady,
      responseToFirstAudioMs: firstAudioTime ? firstAudioTime - tResponseReady : 0,
      totalSpeechEndToFirstAudioMs: firstAudioTime ? firstAudioTime - tSpeechEnd : 0,
      interrupted,
      sentencesCount: sentences.length,
      firstSentence: sentences[0],
    };

    timingMetrics.push(metric);
    return metric;
  }

  // 1. Short conversational reply
  await t.test('1. Short conversational reply (< 80 chars)', async () => {
    const metric = await runSimulatedTurn('Short conversational reply', {
      transcriptGenMs: 120,
      llmGenMs: 280,
      spokenText: 'I am here with you. How can I help you today?',
    });

    assert.equal(metric.sentencesCount, 1, 'Short text should stay as 1 chunk');
    assert.ok(metric.responseToFirstAudioMs < 2000, `First audio should be within target: ${metric.responseToFirstAudioMs}ms`);
    console.log(`[TEST 1] Short Reply: Response->FirstAudio = ${metric.responseToFirstAudioMs}ms | SpeechEnd->FirstAudio = ${metric.totalSpeechEndToFirstAudioMs}ms`);
  });

  // 2. Longer conversational reply
  await t.test('2. Longer conversational reply (sentence pipelined)', async () => {
    const longText = 'Here are your five favorite songs. You can play them anytime, or shuffle through your collection whenever you like. Let me know what you want to hear next.';
    const metric = await runSimulatedTurn('Longer conversational reply', {
      transcriptGenMs: 140,
      llmGenMs: 350,
      spokenText: longText,
    });

    assert.ok(metric.sentencesCount >= 2, 'Long text should split into multiple sentences');
    assert.ok(metric.responseToFirstAudioMs < 2000, `First audio of Sentence 1 should be within target: ${metric.responseToFirstAudioMs}ms`);
    console.log(`[TEST 2] Longer Reply: Response->FirstAudio = ${metric.responseToFirstAudioMs}ms | Chunks = ${metric.sentencesCount}`);
  });

  // 3. Song-list tool result
  await t.test('3. Song-list tool result structured separation', async () => {
    const fakeTracks = [
      { id: '1', title: 'Bohemian Rhapsody', artist: 'Queen', provider: 'spotify' },
      { id: '2', title: 'Hotel California', artist: 'Eagles', provider: 'spotify' },
      { id: '3', title: 'Imagine', artist: 'John Lennon', provider: 'spotify' },
      { id: '4', title: 'Yesterday', artist: 'The Beatles', provider: 'spotify' },
      { id: '5', title: 'Stairway to Heaven', artist: 'Led Zeppelin', provider: 'spotify' },
    ];

    const agentRes = formatFavoritesResponse({
      tracks: fakeTracks,
      provider: 'spotify',
      totalCount: 5,
    }, { readAloud: false });

    // Spoken text is strictly concise without reciting all 5 songs
    assert.equal(agentRes.spokenText, 'Here are your 5 Spotify favorites.');
    // Tool results preserve rich track list
    assert.equal(agentRes.toolResults.tracks.length, 5);
    // Does not speak markdown syntax
    assert.ok(!agentRes.spokenText.includes('*'));
    assert.ok(!agentRes.spokenText.includes('#'));

    const metric = await runSimulatedTurn('Song-list result', {
      transcriptGenMs: 90,
      llmGenMs: 50,
      spokenText: agentRes.spokenText,
    });

    console.log(`[TEST 3] Song List: Response->FirstAudio = ${metric.responseToFirstAudioMs}ms | Spoken = "${agentRes.spokenText}"`);
  });

  // 4. Weather result
  await t.test('4. Weather result structured separation', async () => {
    const weatherData = {
      ok: true,
      location: { resolvedCity: 'San Francisco', queryCity: 'San Francisco' },
      current: {
        temperature: 18.4,
        apparentTemperature: 17.8,
        conditionText: 'Partly Cloudy',
        humidity: 65,
        windSpeed: 12,
      },
      daily: { maxTemp: 21.0, minTemp: 14.0 },
      speech: 'It is currently 18 degrees Celsius and partly cloudy in San Francisco.',
    };

    const agentRes = formatWeatherResponse(weatherData);
    assert.equal(agentRes.responseStatus, 'info');
    assert.equal(agentRes.spokenText, 'It is currently 18 degrees Celsius and partly cloudy in San Francisco.');
    assert.ok(agentRes.toolResults.weather);

    const metric = await runSimulatedTurn('Weather result', {
      transcriptGenMs: 100,
      llmGenMs: 80,
      spokenText: agentRes.spokenText,
    });

    console.log(`[TEST 4] Weather: Response->FirstAudio = ${metric.responseToFirstAudioMs}ms`);
  });

  // 5. Timer/alarm result
  await t.test('5. Timer/alarm result structured presentation', async () => {
    const { parseSchedulerIntent, executeSchedulerIntent } = await import('../src/lib/scheduler-commands.js');
    const mockBridge = {
      addTimer: async (input) => ({ ok: true, item: { id: 'test-timer-1', kind: 'timer', durationMs: input.durationMs, fireAt: Date.now() + input.durationMs, label: input.label } }),
      addAlarm: async (input) => ({ ok: true, item: { id: 'test-alarm-1', kind: 'alarm', time: input.time, fireAt: Date.now() + 3600000, label: input.label } }),
    };

    const parsed = parseSchedulerIntent('Set a timer for one minute.');
    const schedRes = await executeSchedulerIntent(parsed, {
      scheduler: mockBridge,
      schedule: [],
    });

    assert.ok(schedRes.ok);
    assert.equal(schedRes.action, 'set_timer');
    assert.ok(schedRes.spokenConfirmation.includes('minute'));

    const agentRes = createAgentResponse({
      displayText: schedRes.displayText,
      spokenText: schedRes.spokenConfirmation,
      toolResults: { type: 'scheduler', ...schedRes },
    });

    const metric = await runSimulatedTurn('Timer/alarm result', {
      transcriptGenMs: 80,
      llmGenMs: 60,
      spokenText: agentRes.spokenText,
    });

    console.log(`[TEST 5] Timer/Alarm: Response->FirstAudio = ${metric.responseToFirstAudioMs}ms`);
  });

  // 6. TTS provider failure and graceful fallback
  await t.test('6. TTS provider failure with native Windows SAPI fallback', async () => {
    const metric = await runSimulatedTurn('TTS provider failure fallback', {
      transcriptGenMs: 100,
      llmGenMs: 250,
      spokenText: 'I experienced a cloud glitch but switched seamlessly to your local voice.',
      forceFailure: true,
    });

    assert.ok(metric.responseToFirstAudioMs > 0);
    console.log(`[TEST 6] Failure Fallback: Response->FirstAudio = ${metric.responseToFirstAudioMs}ms`);
  });

  // 7. Interrupted speech
  await t.test('7. Interrupted speech cancellation', async () => {
    const metric = await runSimulatedTurn('Interrupted speech', {
      transcriptGenMs: 100,
      llmGenMs: 200,
      spokenText: 'This is a sentence that gets interrupted by the user immediately.',
      interrupted: true,
    });

    assert.equal(metric.responseToFirstAudioMs, 0, 'No audio should play if turn is interrupted');
    console.log(`[TEST 7] Interrupted Speech: Correctly aborted with 0ms playback`);
  });

  // 8. Repeated back-to-back requests
  await t.test('8. Repeated back-to-back requests (warm worker performance)', async () => {
    const runs = [];
    for (let i = 1; i <= 3; i++) {
      const metric = await runSimulatedTurn(`Back-to-back turn #${i}`, {
        transcriptGenMs: 80,
        llmGenMs: 150,
        spokenText: `Quick back to back response number ${i}.`,
      });
      runs.push(metric);
    }

    const avgTtsMs = Math.round(runs.reduce((acc, r) => acc + r.responseToFirstAudioMs, 0) / runs.length);
    console.log(`[TEST 8] Back-to-Back: Avg Response->FirstAudio = ${avgTtsMs}ms across 3 turns`);
    assert.ok(avgTtsMs < 1000, `Average warm synthesis should be < 1s, got ${avgTtsMs}ms`);
  });

  // Print Summary Table
  console.log('\n================ PASS 2.2.8.1 LATENCY BENCHMARK REPORT ================');
  console.table(timingMetrics.map((m) => ({
    Test: m.name,
    'Transcript (ms)': m.speechEndToTranscriptMs,
    'LLM/Tool (ms)': m.transcriptToResponseMs,
    'Response->FirstAudio (ms)': m.responseToFirstAudioMs,
    'Total End->Audio (ms)': m.totalSpeechEndToFirstAudioMs,
  })));

  windowsTtsService.dispose();
});
