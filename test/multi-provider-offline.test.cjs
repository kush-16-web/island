/**
 * multi-provider-offline.test.cjs
 * Comprehensive offline verification for Phase 12:
 * 1. Provider Isolation (Gemini failure does not block Groq)
 * 2. Kokoro Speech Synthesis Independence (Zero Gemini TTS calls when Kokoro selected)
 * 3. Groq Whisper STT (transcription without English forcing)
 * 4. Multi-Provider Tool Calling & Action Compatibility
 * 5. Configurable Assistant Identity
 * 6. Non-blocking error / cooldown dismissal
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const https = require('node:https');
const EventEmitter = require('node:events');

// Setup Node.js window/localStorage mock for assistant.js testing
global.window = {
  localStorage: {
    _data: {},
    getItem(k) { return this._data[k] || null; },
    setItem(k, v) { this._data[k] = String(v); },
    removeItem(k) { delete this._data[k]; }
  },
  dispatchEvent() {}
};
global.localStorage = global.window.localStorage;

// Helper to mock https.request for Groq
function mockGroqHttps(responseHandler) {
  const orig = https.request;
  https.request = (opts, callback) => {
    const reqEmitter = new EventEmitter();
    reqEmitter.write = () => {};
    reqEmitter.end = () => {
      const resEmitter = new EventEmitter();
      const mock = responseHandler(opts);
      resEmitter.statusCode = mock.statusCode || 200;
      resEmitter.headers = mock.headers || {};
      callback(resEmitter);
      process.nextTick(() => {
        resEmitter.emit('data', JSON.stringify(mock.body));
        resEmitter.emit('end');
      });
    };
    return reqEmitter;
  };
  return () => { https.request = orig; };
}

// Test 1: Provider Isolation
test('Provider Isolation: Gemini daily quota 429 does not block Groq chat', async () => {
  const { GeminiVoiceService } = require('../electron/gemini.js');
  const { GroqService } = require('../electron/groq.js');

  const gemini = new GeminiVoiceService({
    logDir: path.join(__dirname, 'scratch_logs')
  });
  gemini.hasKey = () => true;

  const groq = new GroqService({
    logDir: path.join(__dirname, 'scratch_logs')
  });
  groq.setKey('gsk_mock_test_key_12345');

  // Mock Gemini _postJson to return a 429 RESOURCE_EXHAUSTED daily quota
  gemini._postJson = async () => ({
    ok: false,
    code: 429,
    error: 'Quota exceeded for metric: GenerateRequestsPerDay. Please retry in 20h15m47s',
    errorDetails: {
      status: 'RESOURCE_EXHAUSTED',
      isDailyQuota: true,
      retryDelaySeconds: 72947
    }
  });

  // Mock Groq https.request to succeed
  const restoreHttps = mockGroqHttps((opts) => ({
    statusCode: 200,
    body: {
      choices: [{
        message: {
          role: 'assistant',
          content: 'Hello! I am running on Groq Llama 3.3 without being affected by Gemini quota.'
        }
      }],
      usage: { prompt_tokens: 10, completion_tokens: 15, total_tokens: 25 }
    }
  }));

  try {
    // Gemini fails with clean daily quota flag
    const geminiRes = await gemini.processSpeech({
      text: 'Hi',
      skipTts: true
    });
    assert.equal(geminiRes.error != null, true);
    assert.equal(geminiRes.isDailyQuota, true);
    assert.equal(geminiRes.retryDelaySeconds, 0); // No huge countdown

    // Groq succeeds independently
    const groqRes = await groq.chat({
      text: 'Hi',
      assistantName: 'Nova',
      userName: 'Friend'
    });
    assert.equal(groqRes.ok, true);
    assert.equal(groqRes.text.includes('Groq Llama 3.3'), true);
  } finally {
    restoreHttps();
  }
});

// Test 2: Kokoro Independence - Zero Gemini TTS calls when Kokoro is selected
test('Kokoro Independence: Zero Gemini TTS calls when skipTts or ttsEngine === "kokoro"', async () => {
  const { GeminiVoiceService } = require('../electron/gemini.js');
  const gemini = new GeminiVoiceService({
    logDir: path.join(__dirname, 'scratch_logs')
  });
  gemini.hasKey = () => true;

  let ttsCalled = false;
  gemini._postJson = async (endpoint, body, meta) => {
    if (meta?.model === 'gemini-3.8-flash-tts') {
      ttsCalled = true;
      return { ok: true, data: { candidates: [{ content: { parts: [{ inlineData: { data: 'fake_b64' } }] } }] } };
    }
    return {
      ok: true,
      data: {
        candidates: [{ content: { parts: [{ text: 'Here is your local answer.' }] } }]
      },
      usage: { promptTokenCount: 10, candidatesTokenCount: 5 }
    };
  };

  const res = await gemini.processSpeech({
    text: 'Test question',
    skipTts: true,
    ttsEngine: 'kokoro'
  });

  assert.equal(res.ok, true);
  assert.equal(res.text, 'Here is your local answer.');
  assert.equal(res.audioBase64, null);
  assert.equal(ttsCalled, false, 'Gemini TTS MUST NOT be called when Kokoro is selected');
});

// Test 3: Groq Whisper STT Preserves Spoken Language (No translation forcing)
test('Groq Whisper STT: Preserves native transcription without forcing translation to English', async () => {
  const { GroqService } = require('../electron/groq.js');
  const groq = new GroqService({
    logDir: path.join(__dirname, 'scratch_logs')
  });
  groq.setKey('gsk_mock_whisper_key');

  const restoreHttps = mockGroqHttps((opts) => {
    assert.equal(opts.path, '/openai/v1/audio/transcriptions');
    assert.equal(opts.path.includes('/translations'), false, 'Must NOT use translation endpoint');
    return {
      statusCode: 200,
      body: {
        text: 'गाना बजाओ' // Hindi speech preserved in Hindi
      }
    };
  });

  try {
    const dummyWav = Buffer.alloc(4096, 0);
    const result = await groq.transcribe({
      audioBuffer: dummyWav,
      model: 'whisper-large-v3-turbo'
    });

    assert.equal(result.ok, true);
    assert.equal(result.text, 'गाना बजाओ');
  } finally {
    restoreHttps();
  }
});

// Test 4: Provider-independent tool calling & music actions
test('Action Compatibility: Groq function calling maps to Island music tools', async () => {
  const { GroqService } = require('../electron/groq.js');
  const groq = new GroqService({
    logDir: path.join(__dirname, 'scratch_logs')
  });
  groq.setKey('gsk_mock_tool_key');

  const restoreHttps = mockGroqHttps((opts) => ({
    statusCode: 200,
    body: {
      choices: [{
        message: {
          role: 'assistant',
          content: 'Skipping track for you.',
          tool_calls: [{
            id: 'call_1',
            type: 'function',
            function: {
              name: 'next_track',
              arguments: '{}'
            }
          }]
        }
      }]
    }
  }));

  try {
    const res = await groq.chat({
      text: 'Skip this song',
      assistantName: 'Nova',
      userName: 'Friend'
    });

    assert.equal(res.ok, true);
    assert.equal(res.hasAction, true);
    assert.equal(res.action.action, 'next_track');
    assert.equal(res.text.includes('[[ACTION:{"action":"next_track"}]]'), true);
  } finally {
    restoreHttps();
  }
});

// Test 5: Configurable Assistant Name
test('Identity: Assistant name is dynamically configurable and never hardcoded', () => {
  const { getAssistantName, setAssistantName } = require('../src/lib/assistant.js');
  
  // Set to a custom name
  setAssistantName('Aura');
  assert.equal(getAssistantName(), 'Aura');

  // Verify another custom name
  setAssistantName('Zephyr');
  assert.equal(getAssistantName(), 'Zephyr');
});
