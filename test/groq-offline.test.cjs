'use strict';
// Offline Unit Test for Groq Conversational AI & Whisper Transcription
// STRICT ZERO NETWORK CALLS: Uses deterministic mocked https responses.

const test = require('node:test');
const assert = require('node:assert/strict');
const https = require('node:https');
const EventEmitter = require('node:events');
const { GroqService, GROQ_DEFAULT_CHAT_MODEL, GROQ_DEFAULT_WHISPER_MODEL } = require('../electron/groq');

class MockStore {
  constructor(initial = {}) {
    this.data = { ...initial };
  }
  get(key, fallback) {
    return key in this.data ? this.data[key] : fallback;
  }
  set(key, val) {
    this.data[key] = val;
  }
}

test('GroqService: Key management and security boundaries', () => {
  const store = new MockStore();
  const service = new GroqService({ store });

  assert.strictEqual(service.hasKey(), false);
  assert.strictEqual(service.getKeyMasked(), null);

  // Set key
  service.setKey('gsk_test1234567890abcdef');
  assert.strictEqual(service.hasKey(), true);
  assert.strictEqual(service.getKeyMasked(), 'gsk_...cdef');

  // Clear key
  service.clearKey();
  assert.strictEqual(service.hasKey(), false);
  assert.strictEqual(service.getKeyMasked(), null);
});

test('GroqService: chat() normalizes response and tool calling cleanly', async () => {
  const store = new MockStore();
  const service = new GroqService({ store });
  service.apiKey = 'gsk_mock_valid_key_12345';

  const origRequest = https.request;
  try {
    https.request = (opts, callback) => {
      assert.strictEqual(opts.hostname, 'api.groq.com');
      assert.strictEqual(opts.path, '/openai/v1/chat/completions');
      assert.strictEqual(opts.headers.Authorization, 'Bearer gsk_mock_valid_key_12345');

      const reqEmitter = new EventEmitter();
      reqEmitter.write = () => {};
      reqEmitter.end = () => {
        const resEmitter = new EventEmitter();
        resEmitter.statusCode = 200;
        resEmitter.headers = {};
        callback(resEmitter);

        const mockBody = JSON.stringify({
          id: 'chatcmpl-123',
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'Playing your favorite track right now!',
                tool_calls: [
                  {
                    id: 'call_1',
                    type: 'function',
                    function: {
                      name: 'play_favorite',
                      arguments: JSON.stringify({ query: 'Bol Do Na Zara' }),
                    },
                  },
                ],
              },
            },
          ],
          usage: { prompt_tokens: 45, completion_tokens: 18, total_tokens: 63 },
        });

        resEmitter.emit('data', mockBody);
        resEmitter.emit('end');
      };
      return reqEmitter;
    };

    const res = await service.chat({
      text: 'Play Bol Do Na Zara from my favorites',
      assistantName: 'Island Companion',
      userName: 'Friend',
    });

    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.hasAction, true);
    assert.deepStrictEqual(res.action, { action: 'play_favorite', query: 'Bol Do Na Zara' });
    assert.ok(res.text.includes('[[ACTION:{"action":"play_favorite","query":"Bol Do Na Zara"}]]'));
    assert.strictEqual(res.provider, 'groq');
    assert.strictEqual(res.model, GROQ_DEFAULT_CHAT_MODEL);
  } finally {
    https.request = origRequest;
  }
});

test('GroqService: transcribe() constructs multipart body and parses Whisper output', async () => {
  const store = new MockStore();
  const service = new GroqService({ store });
  service.apiKey = 'gsk_mock_valid_key_12345';

  const origRequest = https.request;
  try {
    https.request = (opts, callback) => {
      assert.strictEqual(opts.hostname, 'api.groq.com');
      assert.strictEqual(opts.path, '/openai/v1/audio/transcriptions');
      assert.ok(opts.headers['Content-Type'].includes('multipart/form-data; boundary='));

      const reqEmitter = new EventEmitter();
      reqEmitter.write = () => {};
      reqEmitter.end = () => {
        const resEmitter = new EventEmitter();
        resEmitter.statusCode = 200;
        resEmitter.headers = {};
        callback(resEmitter);

        const mockBody = JSON.stringify({
          text: 'Namaste! Please pause the music.',
        });

        resEmitter.emit('data', mockBody);
        resEmitter.emit('end');
      };
      return reqEmitter;
    };

    // Simulate 1 second 16kHz mono PCM WAV buffer (32,044 bytes)
    const dummyWav = Buffer.alloc(4096, 0);
    const res = await service.transcribe({
      audioBuffer: dummyWav,
      model: GROQ_DEFAULT_WHISPER_MODEL,
    });

    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.text, 'Namaste! Please pause the music.');
    assert.strictEqual(res.provider, 'groq-whisper');
    assert.strictEqual(res.model, GROQ_DEFAULT_WHISPER_MODEL);
  } finally {
    https.request = origRequest;
  }
});

test('GroqService: error handling distinguishes 429 burst rate limit from daily quota', async () => {
  const store = new MockStore();
  const service = new GroqService({ store });
  service.apiKey = 'gsk_mock_valid_key_12345';

  const origRequest = https.request;
  try {
    // 1. Burst rate limit with Retry-After: 12
    https.request = (opts, callback) => {
      const reqEmitter = new EventEmitter();
      reqEmitter.write = () => {};
      reqEmitter.end = () => {
        const resEmitter = new EventEmitter();
        resEmitter.statusCode = 429;
        resEmitter.headers = { 'retry-after': '12' };
        callback(resEmitter);
        resEmitter.emit('data', JSON.stringify({ error: { message: 'Rate limit reached' } }));
        resEmitter.emit('end');
      };
      return reqEmitter;
    };

    const burstRes = await service.chat({ text: 'Hello' });
    assert.strictEqual(burstRes.ok, false);
    assert.strictEqual(burstRes.isDailyQuota, false);
    assert.strictEqual(burstRes.retryDelaySeconds, 12);

    // 2. Daily quota limit with multi-hour delay: 45,000s
    https.request = (opts, callback) => {
      const reqEmitter = new EventEmitter();
      reqEmitter.write = () => {};
      reqEmitter.end = () => {
        const resEmitter = new EventEmitter();
        resEmitter.statusCode = 429;
        resEmitter.headers = { 'retry-after': '45000' };
        callback(resEmitter);
        resEmitter.emit('data', JSON.stringify({ error: { message: 'Daily request quota exceeded' } }));
        resEmitter.emit('end');
      };
      return reqEmitter;
    };

    const quotaRes = await service.chat({ text: 'Hello' });
    assert.strictEqual(quotaRes.ok, false);
    assert.strictEqual(quotaRes.isDailyQuota, true);
    assert.strictEqual(quotaRes.retryDelaySeconds, 0, 'Daily quota must never be returned as a countdown');
  } finally {
    https.request = origRequest;
  }
});

test('GroqService: 404 model_not_found seamlessly falls back to active production model', async () => {
  const store = new MockStore();
  const service = new GroqService({ store });
  service.apiKey = 'gsk_mock_valid_key_12345';

  const origRequest = https.request;
  let callCount = 0;
  const requestedModels = [];

  try {
    https.request = (opts, callback) => {
      callCount++;
      const reqEmitter = new EventEmitter();
      let writtenData = '';
      reqEmitter.write = (chunk) => { writtenData += chunk; };
      reqEmitter.end = () => {
        const payload = JSON.parse(writtenData || '{}');
        requestedModels.push(payload.model);

        const resEmitter = new EventEmitter();
        if (payload.model === 'llama-3.3-70b-versatile') {
          // First attempt: simulate 404 model_not_found
          resEmitter.statusCode = 404;
          resEmitter.headers = {};
          callback(resEmitter);
          resEmitter.emit('data', JSON.stringify({
            error: {
              message: "The model `llama-3.3-70b-versatile` does not exist or you do not have access to it.",
              type: "invalid_request_error",
              code: "model_not_found"
            }
          }));
          resEmitter.emit('end');
        } else {
          // Second attempt: succeeds with llama-3.1-8b-instant
          resEmitter.statusCode = 200;
          resEmitter.headers = {};
          callback(resEmitter);
          resEmitter.emit('data', JSON.stringify({
            choices: [{
              message: { role: 'assistant', content: 'Fallback response from active 8B model!' }
            }],
            usage: { total_tokens: 20 }
          }));
          resEmitter.emit('end');
        }
      };
      return reqEmitter;
    };

    const res = await service.chat({
      text: 'Hello assistant',
      model: 'llama-3.3-70b-versatile'
    });

    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.text, 'Fallback response from active 8B model!');
    assert.strictEqual(res.model, 'llama-3.1-8b-instant');
    assert.strictEqual(callCount, 2);
    assert.deepStrictEqual(requestedModels, ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant']);
  } finally {
    https.request = origRequest;
  }
});
