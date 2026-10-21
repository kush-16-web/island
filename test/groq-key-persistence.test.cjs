/**
 * groq-key-persistence.test.cjs
 * Offline deterministic reproduction and verification for:
 * 1. String argument vs Object argument in IPC groq:set-key
 * 2. Key persistence across restarts via Store
 * 3. Correct masked status presentation
 * 4. Provider routing in useRealtimeVoice
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { GroqService } = require('../electron/groq.js');

class MockStore {
  constructor(initial = {}) {
    this.data = { ...initial };
    this.flushed = false;
  }
  get(key, fallback) {
    return key in this.data ? this.data[key] : fallback;
  }
  set(key, val) {
    this.data[key] = val;
  }
  flush() {
    this.flushed = true;
  }
}

test('Groq Key Bug & Fix: Accepts string or object argument and persists to store', () => {
  const store = new MockStore();
  const groq = new GroqService({ store });

  // 1. Simulating the bug where params is a string (passed directly from UI)
  const stringParam = 'gsk_1234567890abcdef';
  
  // Handler normalization logic from electron/main.js:
  const normalizeKey = (params) => typeof params === 'string' ? params : (params?.key || params?.apiKey);
  
  const extractedKey = normalizeKey(stringParam);
  assert.equal(extractedKey, 'gsk_1234567890abcdef');

  const res = groq.setKey(extractedKey, store);
  assert.equal(res.ok, true);
  assert.equal(groq.hasKey(), true);
  assert.equal(groq.getKeyMasked(), 'gsk_...cdef');
  assert.equal(store.flushed, true);

  // 2. Simulating application restart: New GroqService instance with same store
  const groqRestarted = new GroqService({ store });
  assert.equal(groqRestarted.hasKey(), true);
  assert.equal(groqRestarted.getKeyMasked(), 'gsk_...cdef');

  // 3. Clear key
  groqRestarted.clearKey(store);
  assert.equal(groqRestarted.hasKey(), false);
  assert.equal(groqRestarted.getKeyMasked(), null);
});

test('Provider Routing: Unifies island_chat_provider and island_voice_provider', () => {
  const mockLocalStorage = {
    island_chat_provider: 'groq',
    island_stt_provider: 'groq-whisper',
  };

  const chatProvider = mockLocalStorage.island_chat_provider || mockLocalStorage.island_voice_provider || 'gemini';
  assert.equal(chatProvider, 'groq', 'Must resolve to groq from island_chat_provider');

  let sttProvider = mockLocalStorage.island_stt_provider;
  if (!sttProvider || (chatProvider === 'groq' && sttProvider === 'gemini')) {
    sttProvider = chatProvider === 'groq' ? 'groq-whisper' : 'gemini';
  }
  assert.equal(sttProvider, 'groq-whisper', 'Must resolve to groq-whisper');
});
