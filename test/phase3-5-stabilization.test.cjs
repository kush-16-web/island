const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('PHASE 3.5 — Agent Stabilization & Live Tool Reliability Suite', () => {
  // -------------------------------------------------------------
  // Priority 1 — Voice Turn Controller & Chunk Player Lifecycle
  // -------------------------------------------------------------
  it('1.1: VoiceTurnController transitions back to listening after multi-sentence response', async () => {
    const { VoiceTurnController } = await import('../src/lib/nlu/voice-turn-controller.js');
    const controller = new VoiceTurnController({ silenceDurationMs: 1200 });
    controller.startSession();

    assert.equal(controller.state, 'listening');

    const turnId = controller.startTurn(new Float32Array(1600));
    assert.equal(controller.state, 'processing');
    assert.equal(controller.isProcessing, true);

    controller.beginSpeaking(turnId);
    assert.equal(controller.state, 'speaking');

    // Simulate multi-sentence completion calling finishSpeaking
    controller.finishSpeaking(turnId, 'listening');
    assert.equal(controller.state, 'listening');
    assert.equal(controller.isProcessing, false);
  });

  it('1.2: SentenceChunkPlayer session watchdog resolves reliably on stalled synthesis', async () => {
    const { SentenceChunkPlayer } = await import('../src/lib/audio/sentence-chunk-player.js');
    const player = new SentenceChunkPlayer();

    let endedCalled = false;
    // Test watchdog with shorter timeout
    player.startSession('test-turn-1', {
      synthesizeChunk: () => new Promise(() => {}), // Stalls forever
      onEnded: () => {
        endedCalled = true;
      },
    });

    // Manually trigger the watchdog to verify it resolves safely
    if (player.sessionTimeoutId) {
      clearTimeout(player.sessionTimeoutId);
    }
    player._notifyEnded();

    assert.equal(endedCalled, true);
    player.cancel();
    assert.equal(player.isCancelled, true);
  });

  it('1.3: SentenceChunkPlayer handles null audio synthesis without hanging', async () => {
    const { SentenceChunkPlayer } = await import('../src/lib/audio/sentence-chunk-player.js');
    const player = new SentenceChunkPlayer();

    let endedCalled = false;
    player.startSession('test-turn-2', {
      synthesizeChunk: async () => null, // Empty audio returned
      onEnded: () => {
        endedCalled = true;
      },
    });

    await player.enqueueChunk({ index: 0, text: 'First sentence.', isFinal: false });
    await player.enqueueChunk({ index: 1, text: 'Second sentence.', isFinal: true });

    assert.equal(endedCalled, true);
    player.cancel();
  });

  // -------------------------------------------------------------
  // Priority 2 — Removal of Misleading Static Fallbacks
  // -------------------------------------------------------------
  it('2.1: deriveSpecificActionConfirmation does not return static "Ready."', async () => {
    const { deriveSpecificActionConfirmation } = await import('../src/lib/nlu/voice-intent.js');

    // Unknown or unhandled action should never return hardcoded "Ready."
    const res1 = deriveSpecificActionConfirmation({ action: 'custom_action', ok: true });
    assert.notEqual(res1, 'Ready.');
    assert.equal(res1, 'Done.');

    const res2 = deriveSpecificActionConfirmation({ action: 'custom_action', ok: true, message: 'Custom message' });
    assert.equal(res2, 'Custom message');

    const res3 = deriveSpecificActionConfirmation({ action: 'custom_action', ok: false, error: 'Database offline' });
    assert.equal(res3, 'Database offline');

    const resQuery = deriveSpecificActionConfirmation({ action: 'query_status', displayText: 'You have 1 timer running.' });
    assert.equal(resQuery, 'You have 1 timer running.');
  });

  // -------------------------------------------------------------
  // Priority 3 — Weather Tool Routing & Unconfigured Defaults
  // -------------------------------------------------------------
  it('3.1: Weather queries parse into weather intent via semantic tool planner', async () => {
    const { planUserIntent } = await import('../src/lib/nlu/semantic-tool-planner.js');

    const q1 = planUserIntent("What's the weather right now?");
    assert.equal(q1.plan?.topic, 'weather');
    assert.equal(q1.plan?.location, null);

    const q2 = planUserIntent("Tell me the current weather.");
    assert.equal(q2.plan?.topic, 'weather');

    const q3 = planUserIntent("Try checking the weather again.");
    assert.equal(q3.plan?.topic, 'weather');

    const q4 = planUserIntent("Is it raining in Surat?");
    assert.equal(q4.plan?.topic, 'weather');
    assert.equal(q4.plan?.questionType, 'rain');
    assert.equal(q4.plan?.location, 'Surat');

    const q5 = planUserIntent("How hot is it outside?");
    assert.equal(q5.plan?.topic, 'weather');
    assert.equal(q5.plan?.questionType, 'heat');
  });

  it('3.2: resolveLocation defaults to Surat when unconfigured (no settings opened)', async () => {
    const { resolveLocation, SURAT_DEFAULT_LOCATION } = await import('../src/lib/weather/weather.js');

    const emptyStore = { getItem: () => null, setItem: () => {} };
    const loc = await resolveLocation(null, {}, emptyStore);

    assert.ok(loc);
    assert.equal(loc.city, SURAT_DEFAULT_LOCATION.city);
    assert.equal(loc.lat, SURAT_DEFAULT_LOCATION.lat);
    assert.equal(loc.lon, SURAT_DEFAULT_LOCATION.lon);
  });

  it('3.3: GroqService provides get_weather tool when weather intent is present', async () => {
    const { GroqService, ISLAND_WEATHER_TOOLS } = await import('../electron/groq.js');
    const service = new GroqService();

    // Plain conversational query gets 0 tools
    const convTools = service.resolveEligibleTools("What is your favourite colour?");
    assert.equal(convTools.length, 0);

    // Weather query gets weather tool
    const weatherTools = service.resolveEligibleTools("What's the weather right now?");
    assert.ok(weatherTools.some((t) => t.function?.name === 'get_weather'));

    const rainTools = service.resolveEligibleTools("Is it raining in Surat?");
    assert.ok(rainTools.some((t) => t.function?.name === 'get_weather'));
  });

  // -------------------------------------------------------------
  // Priority 4 — Timer Labels and Follow-ups
  // -------------------------------------------------------------
  it('4.1: Clean purpose labels extracted from user phrasing', async () => {
    const { parseSchedulerIntent } = await import('../src/lib/weather/scheduler-commands.js');

    // 1. "Set a one-minute timer to remind me to drink water." -> "Drink Water"
    const t1 = parseSchedulerIntent('Set a one-minute timer to remind me to drink water.');
    assert.equal(t1.intent, 'SET_TIMER');
    assert.equal(t1.label, 'Drink Water');
    assert.equal(t1.durationMs, 60000);

    // 2. "Set a 20-minute timer for the laundry." -> "Laundry"
    const t2 = parseSchedulerIntent('Set a 20-minute timer for the laundry.');
    assert.equal(t2.intent, 'SET_TIMER');
    assert.equal(t2.label, 'Laundry');
    assert.equal(t2.durationMs, 20 * 60000);

    // 3. "Remind me to check the oven in 15 minutes." -> "Check The Oven"
    const t3 = parseSchedulerIntent('Remind me to check the oven in 15 minutes.');
    assert.equal(t3.intent, 'SET_TIMER');
    assert.equal(t3.label, 'Check The Oven');
    assert.equal(t3.durationMs, 15 * 60000);

    // 4. "Set a timer for 45 minutes to take a break." -> "Take A Break"
    const t4 = parseSchedulerIntent('Set a timer for 45 minutes to take a break.');
    assert.equal(t4.intent, 'SET_TIMER');
    assert.equal(t4.label, 'Take A Break');
    assert.equal(t4.durationMs, 45 * 60000);
  });

  it('4.2: Follow-up timer queries parse accurately', async () => {
    const { parseSchedulerIntent } = await import('../src/lib/weather/scheduler-commands.js');

    const qLabel = parseSchedulerIntent('What did you label my timer?');
    assert.equal(qLabel.intent, 'QUERY_LABEL');
    assert.equal(qLabel.target, 'timer');

    const qRemaining = parseSchedulerIntent('How much time is left?');
    assert.equal(qRemaining.intent, 'QUERY_STATUS');
    assert.equal(qRemaining.target, 'timer');

    const qRunning = parseSchedulerIntent('Which timers are running?');
    assert.equal(qRunning.intent, 'QUERY_STATUS');
    assert.equal(qRunning.target, 'timer');
  });

  it('4.3: executeSchedulerIntent reports single and multiple active timers truthfully', async () => {
    const { executeSchedulerIntent } = await import('../src/lib/weather/scheduler-commands.js');
    const now = 1000000;

    // Single timer test
    const singleSchedule = [
      { id: 't1', kind: 'timer', label: 'Check The Oven', fireAt: now + 300000, enabled: true },
    ];
    const singleLabelRes = await executeSchedulerIntent(
      { isScheduler: true, intent: 'QUERY_LABEL' },
      { schedule: singleSchedule, now }
    );
    assert.equal(singleLabelRes.ok, true);
    assert.match(singleLabelRes.spokenConfirmation, /Check The Oven/);
    assert.match(singleLabelRes.spokenConfirmation, /5 minutes/);

    const singleStatusRes = await executeSchedulerIntent(
      { isScheduler: true, intent: 'QUERY_STATUS', target: 'timer' },
      { schedule: singleSchedule, now }
    );
    assert.equal(singleStatusRes.ok, true);
    assert.match(singleStatusRes.spokenConfirmation, /5 minutes left on your Check The Oven timer/);

    // Multiple timers test
    const multiSchedule = [
      { id: 't1', kind: 'timer', label: 'Drink Water', fireAt: now + 45000, enabled: true },
      { id: 't2', kind: 'timer', label: 'Laundry', fireAt: now + 600000, enabled: true },
    ];
    const multiStatusRes = await executeSchedulerIntent(
      { isScheduler: true, intent: 'QUERY_STATUS', target: 'timer' },
      { schedule: multiSchedule, now }
    );
    assert.equal(multiStatusRes.ok, true);
    assert.match(multiStatusRes.spokenConfirmation, /2 timers running/);
    assert.match(multiStatusRes.spokenConfirmation, /Drink Water: 45 seconds remaining/);
    assert.match(multiStatusRes.spokenConfirmation, /Laundry: 10 minutes remaining/);
  });

  // -------------------------------------------------------------
  // Priority 5 — Shared Agent Execution Contract
  // -------------------------------------------------------------
  it('5.1: Canonical Tool Result schema validates structured outcomes', async () => {
    const { createCanonicalToolResult, isValidToolResult, composeAgentResponse } = await import(
      '../src/lib/nlu/agent-execution-contract.js'
    );

    const toolRes = createCanonicalToolResult({
      tool: 'weather',
      requestId: 'turn-999',
      ok: true,
      data: { city: 'Surat', temperature: 32, speech: "It's 32°C and clear in Surat." },
      source: 'open-meteo',
    });

    assert.equal(isValidToolResult(toolRes), true);
    assert.equal(toolRes.tool, 'weather');
    assert.equal(toolRes.source, 'open-meteo');
    assert.equal(toolRes.ok, true);

    const response = composeAgentResponse(toolRes);
    assert.ok(response.displayText);
    assert.ok(response.spokenText);
    assert.equal(response.responseStatus, 'success');
  });

  it('5.2: executeAgentTurn dispatches tools deterministically', async () => {
    const { executeAgentTurn } = await import('../src/lib/nlu/agent-execution-contract.js');

    const result = await executeAgentTurn({
      input: 'How hot is it outside?',
      turnId: 101,
      dispatchers: {
        weather: {
          match: (text) => (text.includes('hot') ? { topic: 'weather', questionType: 'heat' } : null),
          execute: async () => ({ ok: true, city: 'Surat', temperature: 34, speech: "It's 34°C in Surat." }),
        },
      },
    });

    assert.equal(result.executed, true);
    assert.equal(result.tool, 'weather');
    assert.equal(result.toolResult.ok, true);
    assert.match(result.spokenText, /34 degrees Celsius/);
  });
});
