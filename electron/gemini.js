'use strict';
// Secure Gemini Voice Service for Island
// Runs strictly in the Electron main process during development and local runtime.
// NEVER exposes GEMINI_API_KEY to the renderer, preload IPC, logs, or bundle.

const fs = require('fs');
const https = require('https');
const path = require('path');
const { app } = require('electron');

class GeminiVoiceService {
  constructor() {
    this.apiKey = this._loadApiKey();
  }

  _loadApiKey() {
    if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim()) {
      return process.env.GEMINI_API_KEY.trim();
    }

    try {
      const candidates = [
        path.join(__dirname, '..', '.env'),
        path.join(process.cwd(), '.env'),
        ...(app && app.getAppPath ? [path.join(app.getAppPath(), '.env')] : []),
      ];

      for (const envPath of candidates) {
        if (fs.existsSync(envPath)) {
          const content = fs.readFileSync(envPath, 'utf8');
          const match = content.match(/^\s*GEMINI_API_KEY\s*=\s*(?:['"](.*?)['"]|([^\r\n#]+))/m);
          if (match) {
            const key = (match[1] || match[2] || '').trim();
            if (key) return key;
          }
        }
      }
    } catch {
      // Ignore read errors
    }

    return null;
  }

  hasKey() {
    return Boolean(this.apiKey && this.apiKey.length > 10);
  }

  /**
   * Safely extract structured error details from Google API responses without leaking secrets.
   */
  _extractErrorDetails(data, res) {
    const errorObj = data && typeof data === 'object' ? data.error : null;
    const httpStatus = res && res.statusCode ? res.statusCode : null;
    const headers = res && res.headers ? res.headers : {};

    let retryDelay = headers['retry-after'] || null;
    let quotaMetric = null;
    let quotaId = null;

    if (errorObj && Array.isArray(errorObj.details)) {
      for (const d of errorObj.details) {
        if (!d || typeof d !== 'object') continue;
        const type = String(d['@type'] || '');

        // 1. RetryInfo (e.g., "4.215s")
        if (type.includes('RetryInfo') && d.retryDelay) {
          retryDelay = String(d.retryDelay);
        }

        // 2. ErrorInfo metadata
        if (d.metadata && typeof d.metadata === 'object') {
          if (d.metadata.quota_metric) {
            quotaMetric = String(d.metadata.quota_metric);
          }
          if (d.metadata.quota_limit || d.metadata.quota_limit_value) {
            quotaId = String(d.metadata.quota_limit || d.metadata.quota_limit_value);
          }
        }

        // 3. QuotaFailure violations
        if (Array.isArray(d.violations) && d.violations.length > 0) {
          const v = d.violations[0];
          if (v && typeof v === 'object') {
            if (!quotaMetric && v.description) {
              const match = String(v.description).match(/quota metric ['"]([^'"]+)['"]/i);
              if (match) quotaMetric = match[1];
            }
            if (!quotaId && v.subject) {
              quotaId = String(v.subject);
            }
          }
        }
      }
    }

    const message = (errorObj && errorObj.message)
      ? String(errorObj.message)
      : (httpStatus ? `HTTP ${httpStatus} from Gemini API` : 'Unknown error');

    const status = (errorObj && errorObj.status) ? String(errorObj.status) : null;
    const code = (errorObj && errorObj.code) ? Number(errorObj.code) : httpStatus;

    let retryDelaySeconds = null;
    let resetAfterSeconds = null;
    let isDailyQuota = false;

    if (retryDelay) {
      const matchS = String(retryDelay).match(/^([0-9.]+)\s*s?$/i);
      if (matchS) {
        retryDelaySeconds = Math.ceil(parseFloat(matchS[1]));
      }
    }
    if (!retryDelaySeconds && message) {
      const matchMsg = message.match(/Please retry in\s+(?:(\d+)h)?(?:(\d+)m)?([0-9.]+)s/i);
      if (matchMsg) {
        const hours = parseInt(matchMsg[1] || '0', 10);
        const mins = parseInt(matchMsg[2] || '0', 10);
        const secs = parseFloat(matchMsg[3] || '0');
        retryDelaySeconds = Math.ceil(hours * 3600 + mins * 60 + secs);
        if (!retryDelay) retryDelay = `${retryDelaySeconds}s`;
      }
    }

    if (retryDelaySeconds !== null) {
      resetAfterSeconds = retryDelaySeconds;
      if (retryDelaySeconds > 90) {
        // Multi-minute/multi-hour delay is a daily quota reset (e.g. 72,947s), NOT a short RPM burst limit
        isDailyQuota = true;
        retryDelaySeconds = null; // Do NOT feed multi-hour delays into an active second countdown timer
      }
    }

    if (code === 429 && (message.includes('Quota exceeded') || message.includes('exceeded your current quota') || isDailyQuota)) {
      isDailyQuota = true;
    }

    return {
      httpStatus,
      status,
      code,
      message,
      quotaMetric,
      quotaId,
      retryDelay,
      retryDelaySeconds,
      resetAfterSeconds,
      isDailyQuota,
    };
  }

  /**
   * Safely extract allowlisted token usage metrics from Google response.
   */
  _extractUsage(data) {
    const meta = data && typeof data === 'object' ? data.usageMetadata : null;
    if (!meta || typeof meta !== 'object') return null;

    return {
      promptTokens: typeof meta.promptTokenCount === 'number' ? meta.promptTokenCount : null,
      outputTokens: typeof meta.candidatesTokenCount === 'number' ? meta.candidatesTokenCount : null,
      thinkingTokens: typeof meta.thinkingTokenCount === 'number' ? meta.thinkingTokenCount : null,
      totalTokens: typeof meta.totalTokenCount === 'number' ? meta.totalTokenCount : null,
    };
  }

  /**
   * Write compact, allowlisted diagnostic record to local JSON Lines file.
   * NEVER dumps prompts, conversation texts, audio data, raw headers, or API keys.
   */
  _logDiagnostic(record) {
    try {
      const logDir = (app && typeof app.getPath === 'function')
        ? app.getPath('userData')
        : path.join(__dirname, '..');
      const logPath = path.join(logDir, 'gemini-diagnostics.jsonl');
      fs.appendFileSync(logPath, JSON.stringify(record) + '\n', 'utf8');
    } catch {
      // Diagnostic logging must never crash the service
    }
  }

  _postJson(endpoint, payload, { model = 'gemini', callType = 'request' } = {}) {
    return new Promise((resolve) => {
      if (!this.apiKey) {
        const errorDetails = {
          httpStatus: null,
          status: 'CONFIG_ERROR',
          code: null,
          message: 'GEMINI_API_KEY is not configured in .env. Please add your key to enable Gemini Voice.',
          quotaMetric: null,
          quotaId: null,
          retryDelay: null,
        };
        this._logDiagnostic({
          timestamp: new Date().toISOString(),
          model,
          callType,
          ok: false,
          httpStatus: null,
          durationMs: 0,
          tokens: null,
          error: errorDetails,
        });
        return resolve({
          ok: false,
          error: errorDetails.message,
          errorDetails,
        });
      }

      const postData = JSON.stringify(payload);
      const startTime = Date.now();

      const req = https.request({
        hostname: 'generativelanguage.googleapis.com',
        path: `${endpoint}?key=${this.apiKey}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
        timeout: 18000,
      }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          const durationMs = Date.now() - startTime;
          try {
            const data = JSON.parse(body);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              const usage = this._extractUsage(data);
              this._logDiagnostic({
                timestamp: new Date().toISOString(),
                model,
                callType,
                ok: true,
                httpStatus: res.statusCode,
                durationMs,
                tokens: usage,
                error: null,
              });
              resolve({ ok: true, data, usage });
            } else {
              const errorDetails = this._extractErrorDetails(data, res);
              this._logDiagnostic({
                timestamp: new Date().toISOString(),
                model,
                callType,
                ok: false,
                httpStatus: res.statusCode,
                durationMs,
                tokens: null,
                error: errorDetails,
              });
              resolve({
                ok: false,
                error: errorDetails.message,
                code: errorDetails.code,
                errorDetails,
              });
            }
          } catch {
            const errorDetails = {
              httpStatus: res.statusCode,
              status: 'PARSE_ERROR',
              code: res.statusCode,
              message: `Invalid response from Gemini (HTTP ${res.statusCode})`,
              quotaMetric: null,
              quotaId: null,
              retryDelay: null,
            };
            this._logDiagnostic({
              timestamp: new Date().toISOString(),
              model,
              callType,
              ok: false,
              httpStatus: res.statusCode,
              durationMs,
              tokens: null,
              error: errorDetails,
            });
            resolve({
              ok: false,
              error: errorDetails.message,
              code: res.statusCode,
              errorDetails,
            });
          }
        });
      });

      req.on('timeout', () => {
        req.destroy();
        const durationMs = Date.now() - startTime;
        const errorDetails = {
          httpStatus: null,
          status: 'TIMEOUT',
          code: null,
          message: 'Connection to Gemini API timed out',
          quotaMetric: null,
          quotaId: null,
          retryDelay: null,
        };
        this._logDiagnostic({
          timestamp: new Date().toISOString(),
          model,
          callType,
          ok: false,
          httpStatus: null,
          durationMs,
          tokens: null,
          error: errorDetails,
        });
        resolve({
          ok: false,
          error: errorDetails.message,
          errorDetails,
        });
      });

      req.on('error', (err) => {
        const durationMs = Date.now() - startTime;
        const errorDetails = {
          httpStatus: null,
          status: 'NETWORK_ERROR',
          code: null,
          message: err.message || 'Network error reaching Gemini',
          quotaMetric: null,
          quotaId: null,
          retryDelay: null,
        };
        this._logDiagnostic({
          timestamp: new Date().toISOString(),
          model,
          callType,
          ok: false,
          httpStatus: null,
          durationMs,
          tokens: null,
          error: errorDetails,
        });
        resolve({
          ok: false,
          error: errorDetails.message,
          errorDetails,
        });
      });

      req.write(postData);
      req.end();
    });
  }

  /**
   * Conversational Speech Engine:
   * 1. Takes user audio or text input + multi-turn history.
   * 2. Calls gemini-3.5-flash for natural conversational intelligence (English/Hindi/Hinglish).
   * 3. Calls gemini-3.8-flash-tts for native speech synthesis (audio/wav).
   */
  async processSpeech({
    audioData,
    text,
    history = [],
    assistantName,
    petName,
    userName = 'Friend',
    voice = 'Despina',
    skipTts = false,
    ttsEngine = 'gemini',
    language = 'en',
  }) {
    if (!this.hasKey()) {
      return {
        ok: false,
        error: 'GEMINI_API_KEY not found in .env. Please check your API key configuration.',
      };
    }

    try {
      // 1. Build conversation contents
      const resolvedName = (assistantName || petName || 'Assistant').trim();
      const preferredLang = (language || 'en').toLowerCase();
      const langInstruction = preferredLang === 'en'
        ? `Default to English for all responses. You naturally understand Hindi, Hinglish, and other languages, but only switch languages when the user clearly and intentionally speaks in that language or asks you to speak in it. Never switch languages due to a single foreign word, proper noun, song title (e.g. Pashmina), or noisy transcription.`
        : preferredLang === 'hi'
        ? `Respond naturally in Hindi or Hinglish. If the user addresses you in English, respond in English.`
        : `Default to English, but naturally accommodate the language intentionally used by the user. Do not switch languages on isolated proper nouns or song titles.`;

      const systemPrompt = `You are "${resolvedName}", an intelligent, witty, warm and concise desktop companion living inside Island for your human friend "${userName}".
Keep your answers very concise (1 to 2 sentences maximum, never lengthy paragraphs or lists) so it sounds like real spoken dialogue.
${langInstruction}
Never output markdown symbols like asterisks, bullet points, or emojis, since your text will be read aloud as speech.

You can also control Island's music playback and favorites. When the user requests a music command, append a single action tag at the end of your response:
[[ACTION:{"action":"<action_name>","query":"<track name or artist if applicable>"}]]

Supported actions:
- play_track (query: track name or artist)
- play_favorite (query: track name or artist specifically from user's favorites)
- play_random_favorite (no query)
- pause
- resume
- next_track
- previous_track
- get_current_track
- add_current_to_favorites
- remove_current_from_favorites
- show_favorites
- list_favorites
- count_favorites
- set_timer (durationMs: milliseconds, label?: string)
- set_alarm (time: "HH:MM", label?: string)
- cancel_timer (label?: string)
- cancel_alarm (time?: "HH:MM", label?: string)
- get_schedule_status (target: "timer" | "alarm" | "all")

For normal conversation, NEVER include an [[ACTION:...]] tag.`;

      const contents = [];

      // Include recent multi-turn history (up to last 6 turns for context)
      if (Array.isArray(history) && history.length > 0) {
        const recent = history.slice(-6);
        for (const item of recent) {
          if (item.text && item.role) {
            contents.push({
              role: item.role === 'user' ? 'user' : 'model',
              parts: [{ text: item.text }],
            });
          }
        }
      }

      // Current user turn
      const userParts = [];
      if (audioData) {
        userParts.push({
          inlineData: {
            mimeType: 'audio/wav',
            data: audioData,
          },
        });
      }
      if (text) {
        userParts.push({ text });
      } else if (audioData) {
        userParts.push({ text: `Listen carefully to my voice and respond to me, ${userName}, in under 2 sentences.` });
      }

      contents.push({
        role: 'user',
        parts: userParts,
      });

      // 2. Query gemini-3.5-flash
      const chatRes = await this._postJson(
        '/v1beta/models/gemini-3.5-flash:generateContent',
        {
          systemInstruction: {
            parts: [{ text: systemPrompt }],
          },
          contents,
        },
        { model: 'gemini-3.5-flash', callType: 'chat' }
      );

      if (!chatRes.ok) {
        // Translate error cleanly for user display while preserving diagnostic detail
        let userFacingError = chatRes.error;
        const isDaily = chatRes.errorDetails?.isDailyQuota || Boolean(chatRes.error?.includes('exceeded your current quota'));
        if (isDaily) {
          userFacingError = 'Gemini daily free-tier quota exhausted (20 requests/day limit reached). Quota resets at midnight UTC. You can switch to Groq or local commands in Settings.';
        } else if (chatRes.error?.includes('Resource has been exhausted') || chatRes.code === 429) {
          userFacingError = 'Gemini rate limit reached. Please wait a moment and retry.';
        } else if (chatRes.code === 503 || chatRes.error?.includes('high demand')) {
          userFacingError = 'Gemini is temporarily experiencing high traffic. Please retry in a few seconds.';
        }
        return {
          ok: false,
          error: userFacingError,
          failedModel: 'gemini-3.5-flash',
          stage: 'chat',
          isDailyQuota: isDaily,
          errorDetails: chatRes.errorDetails || null,
          retryDelaySeconds: isDaily ? 0 : Math.min(60, chatRes.errorDetails?.retryDelaySeconds || (chatRes.code === 429 ? 30 : null)),
          usage: chatRes.usage || null,
        };
      }

      const replyText = chatRes.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
        || `Meow! I'm here beside you, ${userName}!`;

      // Check if response contains an action tag.
      // If an action is requested, we do NOT synthesize assumed audio yet;
      // the client must execute the real action first, so spoken confirmation is 100% grounded in truth.
      const hasAction = /\[\[ACTION:\s*\{[\s\S]*?\}\s*\]\]/i.test(replyText);
      if (hasAction) {
        return {
          ok: true,
          text: replyText,
          hasAction: true,
          audioBase64: null,
          mimeType: 'audio/wav',
          provider: 'gemini',
          chatUsage: chatRes.usage || null,
          ttsUsage: null,
          ttsError: null,
        };
      }

      // 3. Synthesize speech using gemini-3.8-flash-tts ONLY if not using Kokoro/Windows and TTS is not skipped
      if (skipTts || ttsEngine === 'kokoro' || ttsEngine === 'windows' || ttsEngine === 'none') {
        return {
          ok: true,
          text: replyText,
          hasAction: false,
          audioBase64: null,
          mimeType: 'audio/wav',
          provider: 'gemini',
          chatUsage: chatRes.usage || null,
          ttsUsage: null,
          ttsError: null,
        };
      }

      const ttsRes = await this._postJson(
        '/v1beta/models/gemini-3.8-flash-tts:generateContent',
        {
          contents: [
            { parts: [{ text: replyText }] },
          ],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: voice || 'Despina',
                },
              },
            },
          },
        },
        { model: 'gemini-3.8-flash-tts', callType: 'tts' }
      );

      let audioBase64 = null;
      let mimeType = 'audio/wav';
      let ttsDiagnostics = null;

      if (ttsRes.ok) {
        const audioPart = ttsRes.data?.candidates?.[0]?.content?.parts?.[0];
        if (audioPart?.inlineData?.data) {
          audioBase64 = audioPart.inlineData.data;
          mimeType = audioPart.inlineData.mimeType || 'audio/wav';
        }
      } else {
        // TTS failed: preserve existing text-only fallback, but provide diagnostic details
        ttsDiagnostics = {
          failedModel: 'gemini-3.8-flash-tts',
          stage: 'tts',
          error: ttsRes.error,
          errorDetails: ttsRes.errorDetails || null,
          retryDelaySeconds: ttsRes.errorDetails?.retryDelaySeconds || (ttsRes.code === 429 ? 40 : null),
        };
      }

      return {
        ok: true,
        text: replyText,
        audioBase64,
        mimeType,
        provider: 'gemini',
        chatUsage: chatRes.usage || null,
        ttsUsage: ttsRes.usage || null,
        ttsError: ttsDiagnostics,
      };
    } catch (err) {
      return {
        ok: false,
        error: err.message || 'Unexpected error in Gemini Voice Service',
        stage: 'general',
      };
    }
  }

  async synthesizeSpeech({ text, voice = 'Despina' }) {
    if (!this.hasKey()) {
      return { ok: false, error: 'GEMINI_API_KEY is not configured in .env.' };
    }

    const ttsRes = await this._postJson(
      '/v1beta/models/gemini-3.8-flash-tts:generateContent',
      {
        contents: [
          { parts: [{ text }] },
        ],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: voice || 'Despina',
              },
            },
          },
        },
      },
      { model: 'gemini-3.8-flash-tts', callType: 'tts' }
    );

    if (ttsRes.ok) {
      const audioPart = ttsRes.data?.candidates?.[0]?.content?.parts?.[0];
      if (audioPart?.inlineData?.data) {
        return {
          ok: true,
          audioBase64: audioPart.inlineData.data,
          mimeType: audioPart.inlineData.mimeType || 'audio/wav',
          usage: ttsRes.usage || null,
        };
      }
    }

    return {
      ok: false,
      error: ttsRes.error || 'Failed to synthesize speech',
      failedModel: 'gemini-3.8-flash-tts',
      stage: 'tts',
      errorDetails: ttsRes.errorDetails || null,
      retryDelaySeconds: ttsRes.errorDetails?.retryDelaySeconds || (ttsRes.code === 429 ? 40 : null),
    };
  }
}

module.exports = { GeminiVoiceService };
