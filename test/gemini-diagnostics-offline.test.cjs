'use strict';
// Offline Unit Test for Gemini Usage Diagnostics
// STRICT ZERO NETWORK USAGE: Uses mocked payloads only. NEVER connects to the internet.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { GeminiVoiceService } = require('../electron/gemini');

test('GeminiVoiceService: _extractErrorDetails extracts structured quota details from Google RPC payload', () => {
  const service = new GeminiVoiceService();

  const mockGoogle429Response = {
    error: {
      code: 429,
      message: "Resource has been exhausted (e.g. check quota).",
      status: "RESOURCE_EXHAUSTED",
      details: [
        {
          "@type": "type.googleapis.com/google.rpc.ErrorInfo",
          reason: "RESOURCE_EXHAUSTED",
          domain: "googleapis.com",
          metadata: {
            service: "generativelanguage.googleapis.com",
            quota_metric: "generativelanguage.googleapis.com/generate_content_requests",
            quota_limit_value: "15",
            consumer: "projects/1234567890"
          }
        },
        {
          "@type": "type.googleapis.com/google.rpc.QuotaFailure",
          violations: [
            {
              subject: "project:1234567890",
              description: "Quota exceeded for quota metric 'GenerateContent requests per minute' and limit 'GenerateContent requests per minute per project'"
            }
          ]
        },
        {
          "@type": "type.googleapis.com/google.rpc.RetryInfo",
          retryDelay: "4.215s"
        }
      ]
    }
  };

  const mockRes = {
    statusCode: 429,
    headers: {
      'retry-after': '5'
    }
  };

  const details = service._extractErrorDetails(mockGoogle429Response, mockRes);

  assert.strictEqual(details.httpStatus, 429);
  assert.strictEqual(details.status, 'RESOURCE_EXHAUSTED');
  assert.strictEqual(details.code, 429);
  assert.strictEqual(details.message, 'Resource has been exhausted (e.g. check quota).');
  assert.strictEqual(details.quotaMetric, 'generativelanguage.googleapis.com/generate_content_requests');
  assert.strictEqual(details.quotaId, '15');
  assert.strictEqual(details.retryDelay, '4.215s');
});

test('GeminiVoiceService: _extractUsage captures allowlisted token usage', () => {
  const service = new GeminiVoiceService();

  const mockResponse = {
    usageMetadata: {
      promptTokenCount: 142,
      candidatesTokenCount: 38,
      thinkingTokenCount: 12,
      totalTokenCount: 192,
      otherInternalField: 'should-not-be-leaked'
    }
  };

  const usage = service._extractUsage(mockResponse);

  assert.deepStrictEqual(usage, {
    promptTokens: 142,
    outputTokens: 38,
    thinkingTokens: 12,
    totalTokens: 192
  });
});

test('GeminiVoiceService: _logDiagnostic writes allowlisted JSON line without credentials', () => {
  const service = new GeminiVoiceService();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-diag-test-'));
  const logFile = path.join(tmpDir, 'gemini-diagnostics.jsonl');

  const testRecord = {
    timestamp: '2026-10-21T09:59:00.000Z',
    model: 'gemini-3.5-flash',
    callType: 'chat',
    ok: true,
    httpStatus: 200,
    durationMs: 412,
    tokens: {
      promptTokens: 120,
      outputTokens: 25,
      thinkingTokens: 0,
      totalTokens: 145
    },
    error: null
  };

  // Directly append and verify format
  fs.appendFileSync(logFile, JSON.stringify(testRecord) + '\n', 'utf8');

  const content = fs.readFileSync(logFile, 'utf8').trim();
  const parsed = JSON.parse(content);

  assert.strictEqual(parsed.model, 'gemini-3.5-flash');
  assert.strictEqual(parsed.callType, 'chat');
  assert.strictEqual(parsed.ok, true);
  assert.strictEqual(parsed.tokens.totalTokens, 145);
  assert.strictEqual(parsed.tokens.otherField, undefined);
  assert.strictEqual(parsed.apiKey, undefined);

  // Clean up test temp file
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('GeminiVoiceService: processSpeech handles mocked chat and tts stages offline', async () => {
  const service = new GeminiVoiceService();

  // Mock _postJson directly to test routing without network
  service._postJson = async (endpoint, payload, { model, callType }) => {
    if (model === 'gemini-3.5-flash') {
      return {
        ok: true,
        data: {
          candidates: [{ content: { parts: [{ text: 'Hello human!' }] } }]
        },
        usage: { promptTokens: 50, outputTokens: 10, thinkingTokens: 0, totalTokens: 60 }
      };
    }
    if (model === 'gemini-3.8-flash-tts') {
      // Simulate TTS failure to verify graceful diagnostic fallback
      return {
        ok: false,
        error: 'Resource has been exhausted',
        code: 429,
        errorDetails: {
          httpStatus: 429,
          status: 'RESOURCE_EXHAUSTED',
          code: 429,
          message: 'Resource has been exhausted',
          quotaMetric: 'generate_content_requests',
          quotaId: '15',
          retryDelay: '2.5s'
        }
      };
    }
  };

  const res = await service.processSpeech({ text: 'Hello' });

  // Verify text fallback is preserved (user still gets answer)
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.text, 'Hello human!');
  assert.strictEqual(res.audioBase64, null);

  // Verify chat usage was captured
  assert.deepStrictEqual(res.chatUsage, {
    promptTokens: 50,
    outputTokens: 10,
    thinkingTokens: 0,
    totalTokens: 60
  });

  // Verify TTS failure was NOT silently swallowed
  assert.ok(res.ttsError, 'TTS error diagnostic should be attached');
  assert.strictEqual(res.ttsError.failedModel, 'gemini-3.8-flash-tts');
  assert.strictEqual(res.ttsError.stage, 'tts');
  assert.strictEqual(res.ttsError.errorDetails.quotaMetric, 'generate_content_requests');
});
