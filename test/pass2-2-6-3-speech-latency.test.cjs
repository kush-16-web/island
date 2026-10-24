/**
 * test/pass2-2-6-3-speech-latency.test.cjs
 * PASS 2.2.6.3: AI Agent Speech Output, Natural Responses & Latency Repair Verification Suite.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

function createMockStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
}

test('Pass 2.2.6.3: AI Agent Speech Output, Natural Responses & Latency Suite', async (t) => {
  const {
    cleanTextForSpeech,
    createAgentResponse,
    formatFavoritesResponse,
    formatWeatherResponse,
    isExplicitReadAloudRequest,
    isExplicitDetailRequest,
  } = await import('../src/lib/agent-response-contract.js');

  const { latencyTracker } = await import('../src/lib/latency-tracker.js');
  const { getAssistantName, setAssistantName, getAssistantConfig } = await import('../src/lib/assistant.js');
  const { interpretLocalMusicCommand } = await import('../src/lib/music-command-interpreter.js');
  const { addFavorite } = await import('../src/lib/favorites.js');

  await t.test('1. TTS-Safe Normalizer: Bold Markdown does NOT pronounce asterisks', () => {
    // Single, double, and triple asterisks/underscores
    const input1 = '**Attention** by *Charlie Puth* is currently playing.';
    const out1 = cleanTextForSpeech(input1);
    assert.equal(out1, 'Attention by Charlie Puth is currently playing.');
    assert.equal(out1.includes('*'), false, 'Spoken text must never contain asterisks!');

    const input2 = 'Here is the ***top recommended*** track: __Starboy__.';
    const out2 = cleanTextForSpeech(input2);
    assert.equal(out2, 'Here is the top recommended track: Starboy.');
    assert.equal(out2.includes('*'), false);
    assert.equal(out2.includes('_'), false);
  });

  await t.test('2. TTS-Safe Normalizer: Numbered lists are spoken naturally without dots', () => {
    const listInput = 'Here are your top songs:\n1. Attention\n2. Starboy\n3. Pashmina';
    const spoken = cleanTextForSpeech(listInput);

    // Must speak natural list cadence without "one dot" or raw markdown linebreaks
    assert.equal(spoken, 'Here are your top songs: 1, Attention. 2, Starboy. 3, Pashmina.');
    assert.equal(spoken.includes('\n'), false);
    assert.equal(/\b\d+\.\s+/i.test(spoken), false, 'Numbers must be followed by natural pause/comma, not dots');
  });

  await t.test('3. TTS-Safe Normalizer: Markdown headers, bullets, code blocks, links, and units', () => {
    const markdownInput = `
### Music Library
* First track: [Starboy](https://open.spotify.com/track/123)
* Second track: Attention
Here is some info: \`active_state = true\`
\`\`\`js
console.log("playing");
\`\`\`
The temperature outside is 24°C with 65% humidity & $10 admission.
[[ACTION:{"action":"play"}]]
    `;

    const cleaned = cleanTextForSpeech(markdownInput);

    // Verify all formatting markers are stripped
    assert.equal(cleaned.includes('###'), false);
    assert.equal(cleaned.includes('`'), false);
    assert.equal(cleaned.includes('*'), false);
    assert.equal(cleaned.includes('https://'), false);
    assert.equal(cleaned.includes('[[ACTION'), false);

    // Verify links preserve title
    assert.ok(cleaned.includes('First track: Starboy'));

    // Verify symbols and units translated into words
    assert.ok(cleaned.includes('24 degrees Celsius'));
    assert.ok(cleaned.includes('65 percent'));
    assert.ok(cleaned.includes('10 dollars'));
    assert.ok(cleaned.includes(' and '));
  });

  await t.test('4. Natural Speech Length: Favorites list is concise by default, rendering visual cards', () => {
    const storage = createMockStorage();
    addFavorite({ title: 'Attention', artist: 'Charlie Puth', provider: 'spotify' }, storage);
    addFavorite({ title: 'Starboy', artist: 'The Weeknd', provider: 'spotify' }, storage);
    addFavorite({ title: 'Pashmina', artist: 'Amit Trivedi', provider: 'youtube' }, storage);
    addFavorite({ title: 'Tuu', artist: 'Arijit Singh', provider: 'youtube' }, storage);

    // Normal command: "Show my favorites"
    const res = interpretLocalMusicCommand('Show my favorites', {
      customStorage: storage,
    });

    assert.equal(res.handledLocally, true);
    assert.equal(res.actionResult?.ok, true);
    assert.equal(res.actionResult?.tracks?.length, 4);

    // Spoken confirmation MUST be concise (does NOT narrate every song title aloud)
    assert.equal(res.actionResult?.spokenConfirmation, 'Here are your 4 saved songs.');
    assert.equal(res.actionResult?.displayText, 'Here are your 4 saved songs:');
  });

  await t.test('5. Explicit Read-Aloud Requests: Cleanly narrates all items when user asks', () => {
    const storage = createMockStorage();
    addFavorite({ title: 'Attention', artist: 'Charlie Puth', provider: 'spotify' }, storage);
    addFavorite({ title: 'Starboy', artist: 'The Weeknd', provider: 'spotify' }, storage);

    assert.equal(isExplicitReadAloudRequest('Read all of them aloud'), true);
    assert.equal(isExplicitReadAloudRequest('Read my favorites aloud'), true);
    assert.equal(isExplicitReadAloudRequest('Read them to me'), true);
    assert.equal(isExplicitReadAloudRequest('Show my favorites'), false);

    // User asks explicitly: "Read my favorites aloud"
    const res = interpretLocalMusicCommand('Read my favorites aloud', {
      customStorage: storage,
    });

    assert.equal(res.handledLocally, true);
    assert.equal(res.actionResult?.readAloud, true);

    // Spoken text must cleanly read the songs without asterisks
    assert.match(res.actionResult?.spokenConfirmation, /1, Starboy by The Weeknd\. 2, Attention by Charlie Puth/);
    assert.equal(res.actionResult?.spokenConfirmation.includes('*'), false);
  });

  await t.test('6. Weather Visual & Spoken Agreement: Grounded facts without fabrication', () => {
    const mockWeather = {
      ok: true,
      location: { resolvedCity: 'Delhi', queryCity: 'Delhi' },
      current: { temperature: 24.3, conditionText: 'Clear sky', apparentTemperature: 25.1 },
      daily: { maxTemp: 28.5, minTemp: 16.2 },
      speech: "It's currently 24°C and Clear sky in Delhi, with a high of 29°C today.",
    };

    const resp = formatWeatherResponse(mockWeather);
    assert.equal(resp.responseStatus, 'info');
    assert.ok(resp.displayText.includes('Delhi: 24°C'));
    assert.ok(resp.displayText.includes('High: 29°C'));
    // Spoken text expands symbols to words for TTS
    assert.equal(resp.spokenText, "It's currently 24 degrees Celsius and Clear sky in Delhi, with a high of 29 degrees Celsius today.");
    assert.equal(resp.toolResults?.weather?.ok, true);
  });

  await t.test('7. Structured Response Contract Validation', () => {
    const resp = createAgentResponse({
      displayText: '**Here** is the list:\n1. Track A\n2. Track B',
      spokenText: '',
      toolResults: { tracks: [{ title: 'Track A' }, { title: 'Track B' }] },
      responseStatus: 'success',
    });

    assert.equal(resp.displayText, '**Here** is the list:\n1. Track A\n2. Track B');
    assert.equal(resp.spokenText, 'Here is the list: 1, Track A. 2, Track B.');
    assert.equal(resp.responseStatus, 'success');
    assert.equal(resp.toolResults?.tracks?.length, 2);
  });

  await t.test('8. Preserves Dynamic Configurable Agent Identity (Zero Hardcoding)', () => {
    // Test dynamic name resolution
    setAssistantName('Aura');
    assert.equal(getAssistantName(), 'Aura');
    assert.equal(getAssistantConfig().name, 'Aura');

    setAssistantName('Zephyr');
    assert.equal(getAssistantName(), 'Zephyr');
    assert.equal(getAssistantConfig().name, 'Zephyr');

    // Restore to Nova
    setAssistantName('Nova');
    assert.equal(getAssistantName(), 'Nova');
  });

  await t.test('9. Full Voice Pipeline Latency Instrumentation (8 Stages & First-Audio Tracking)', () => {
    latencyTracker.reset();
    const turnId = 'turn_test_101';

    // Simulate turn stages
    latencyTracker.startTurn(turnId, { userText: 'What is the weather outside?' });

    // Stage 1: STT (Whisper)
    latencyTracker.recordStage(turnId, 'stt_start');
    latencyTracker.recordStage(turnId, 'stt_end');

    // Stage 2: Intent
    latencyTracker.recordStage(turnId, 'intent_start');
    latencyTracker.recordStage(turnId, 'intent_end');

    // Stage 3: Tool
    latencyTracker.recordStage(turnId, 'tool_start');
    latencyTracker.recordStage(turnId, 'tool_end');

    // Stage 4: LLM (0 for local actions)
    // Stage 5: TTS
    latencyTracker.recordStage(turnId, 'tts_start');
    latencyTracker.recordStage(turnId, 'tts_end');

    // Stage 6: First Audible Sound
    latencyTracker.recordStage(turnId, 'audio_first_chunk');

    // Stage 7: Speech completed
    latencyTracker.recordStage(turnId, 'speech_completed');

    const metrics = latencyTracker.completeTurn(turnId, 'completed');

    assert.ok(metrics);
    assert.equal(metrics.turnId, turnId);
    assert.equal(metrics.status, 'completed');
    assert.ok(metrics.firstAudioLatencyMs >= 0);
    assert.ok(metrics.totalTurnMs >= metrics.firstAudioLatencyMs);

    const history = latencyTracker.getRecentMetrics();
    assert.equal(history.length, 1);
    assert.equal(history[0].turnId, turnId);
  });
});
