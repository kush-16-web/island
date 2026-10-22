'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { GeminiVoiceService } = require('../electron/gemini');

test('GeminiVoiceService: initializes safely and checks key presence', () => {
  const service = new GeminiVoiceService();
  assert.ok(service, 'service should instantiate');
  assert.strictEqual(typeof service.hasKey(), 'boolean');
});

test('GeminiVoiceService: security boundary - never exposes GEMINI_API_KEY', async () => {
  const service = new GeminiVoiceService();
  const res = await service.processSpeech({
    text: 'Test connection hello',
    petName: 'Cat',
    userName: 'Friend',
  });

  assert.strictEqual(typeof res, 'object');
  assert.strictEqual(res.apiKey, undefined, 'GEMINI_API_KEY must never be exposed');
  assert.strictEqual(res.key, undefined, 'API key must never be exposed');

  if (res.ok) {
    assert.strictEqual(typeof res.text, 'string');
    assert.strictEqual(res.provider, 'gemini');
    if (!res.ttsError) {
      assert.ok(res.audioBase64, 'audio base64 should be generated when TTS succeeds');
    }
  } else {
    assert.ok(res.error, 'error should be present if request fails');
  }
});
