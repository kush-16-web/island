'use strict';
// electron/groq.js: Secure Groq Service for Island (Chat & Whisper STT)
// Runs strictly in the Electron main process.
// NEVER exposes GROQ_API_KEY to the renderer, bundle, or diagnostic logs.

const fs = require('fs');
const https = require('https');
const path = require('path');
const { app, safeStorage } = require('electron');

const GROQ_DEFAULT_CHAT_MODEL = 'llama-3.1-8b-instant';
const GROQ_FAST_CHAT_MODEL = 'llama-3.1-8b-instant';
const GROQ_TIERED_CHAT_MODEL = 'llama-3.3-70b-versatile';
const GROQ_DEFAULT_WHISPER_MODEL = 'whisper-large-v3-turbo';
const GROQ_ACCURATE_WHISPER_MODEL = 'whisper-large-v3';

// Standard Island Tool Definitions for OpenAI-compatible function calling
const ISLAND_MUSIC_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'play_track',
      description: 'Play or search for a specific track, song, or artist in Island media',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Name of the song, album, or artist' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'play_favorite',
      description: 'Play a specific song from user favorites library',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Name of the favorite song or artist' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'play_random_favorite',
      description: 'Shuffle and play a random track from user favorites',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'pause',
      description: 'Pause current audio/video playback',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'resume',
      description: 'Resume paused playback',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'next_track',
      description: 'Skip to the next song',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'previous_track',
      description: 'Skip to the previous song',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_current_track',
      description: 'Get information about the currently playing song and artist',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_current_to_favorites',
      description: 'Save the currently playing track to favorites',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remove_current_from_favorites',
      description: 'Remove the current track from favorites',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'show_favorites',
      description: 'Open the favorites menu',
      parameters: { type: 'object', properties: {} },
    },
  },
];

class GroqService {
  constructor(options = {}) {
    this.store = options.store || null;
    this.apiKey = this._loadApiKey();
  }

  setStore(store) {
    this.store = store;
    if (!this.apiKey) {
      this.apiKey = this._loadApiKey();
    }
  }

  _loadApiKey() {
    // 1. Check encrypted store in userData
    if (this.store) {
      const encryptedKey = this.store.get('groq_api_key_encrypted', null);
      if (encryptedKey && safeStorage && safeStorage.isEncryptionAvailable()) {
        try {
          const decrypted = safeStorage.decryptString(Buffer.from(encryptedKey, 'base64'));
          if (decrypted && decrypted.trim()) return decrypted.trim();
        } catch {
          // If decryption fails, fall back to plain store or env
        }
      }
      const plainKey = this.store.get('groq_api_key', null);
      if (plainKey && typeof plainKey === 'string' && plainKey.trim()) {
        return plainKey.trim();
      }
    }

    // 2. Check process environment
    if (process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim()) {
      return process.env.GROQ_API_KEY.trim();
    }

    // 3. Check .env file candidates
    try {
      const candidates = [
        path.join(__dirname, '..', '.env'),
        path.join(process.cwd(), '.env'),
        ...(app && typeof app.getAppPath === 'function' ? [path.join(app.getAppPath(), '.env')] : []),
      ];

      for (const envPath of candidates) {
        if (fs.existsSync(envPath)) {
          const content = fs.readFileSync(envPath, 'utf8');
          const match = content.match(/^\s*GROQ_API_KEY\s*=\s*(?:['"](.*?)['"]|([^\r\n#]+))/m);
          if (match) {
            const key = (match[1] || match[2] || '').trim();
            if (key) return key;
          }
        }
      }
    } catch {}

    return null;
  }

  hasKey() {
    if (!this.apiKey) {
      this.apiKey = this._loadApiKey();
    }
    return Boolean(this.apiKey && this.apiKey.length > 10);
  }

  getKeyMasked() {
    if (!this.apiKey) {
      this.apiKey = this._loadApiKey();
    }
    if (!this.apiKey || this.apiKey.length < 8) return null;
    const prefix = this.apiKey.slice(0, 4);
    const suffix = this.apiKey.slice(-4);
    return `${prefix}...${suffix}`;
  }

  setKey(key, store = this.store) {
    if (!key || typeof key !== 'string' || !key.trim()) {
      return this.clearKey(store);
    }

    const trimmed = key.trim();
    this.apiKey = trimmed;

    if (store) {
      if (safeStorage && safeStorage.isEncryptionAvailable()) {
        try {
          const encrypted = safeStorage.encryptString(trimmed).toString('base64');
          store.set('groq_api_key_encrypted', encrypted);
          store.set('groq_api_key', null); // remove unencrypted
          if (typeof store.flush === 'function') store.flush();
          return { ok: true, encrypted: true };
        } catch {
          store.set('groq_api_key', trimmed);
          if (typeof store.flush === 'function') store.flush();
          return { ok: true, encrypted: false };
        }
      } else {
        store.set('groq_api_key', trimmed);
        if (typeof store.flush === 'function') store.flush();
        return { ok: true, encrypted: false };
      }
    }

    return { ok: true, encrypted: false };
  }

  clearKey(store = this.store) {
    this.apiKey = null;
    if (store) {
      store.set('groq_api_key_encrypted', null);
      store.set('groq_api_key', null);
      if (typeof store.flush === 'function') store.flush();
    }
    return { ok: true };
  }

  getStatus() {
    return {
      provider: 'groq',
      hasKey: this.hasKey(),
      keyMasked: this.getKeyMasked(),
      defaultChatModel: GROQ_DEFAULT_CHAT_MODEL,
      fastChatModel: GROQ_FAST_CHAT_MODEL,
      defaultWhisperModel: GROQ_DEFAULT_WHISPER_MODEL,
      accurateWhisperModel: GROQ_ACCURATE_WHISPER_MODEL,
    };
  }

  /**
   * Safe JSON-Line diagnostic logging for Groq operations
   * Never leaks API keys, prompts, full transcripts, or private audio.
   */
  _logDiagnostic(record) {
    try {
      const logDir = (app && typeof app.getPath === 'function')
        ? app.getPath('userData')
        : path.join(__dirname, '..');
      const logPath = path.join(logDir, 'groq-diagnostics.jsonl');
      fs.appendFileSync(logPath, JSON.stringify(record) + '\n', 'utf8');
    } catch {}
  }

  /**
   * Parse Groq error responses safely.
   */
  _extractError(body, res) {
    let errorObj = null;
    try {
      const parsed = JSON.parse(body);
      errorObj = parsed?.error || null;
    } catch {}

    const statusCode = res?.statusCode || null;
    const headers = res?.headers || {};

    let retryDelay = headers['retry-after'] || null;
    let message = errorObj?.message || (statusCode ? `HTTP ${statusCode} from Groq` : 'Unknown Groq error');
    let code = errorObj?.code || statusCode;
    let type = errorObj?.type || null;

    let retryDelaySeconds = null;
    let isDailyQuota = false;

    if (retryDelay) {
      const parsed = parseInt(String(retryDelay), 10);
      if (!isNaN(parsed)) retryDelaySeconds = parsed;
    }

    if (!retryDelaySeconds && message) {
      const match = message.match(/try again in\s+(?:(\d+)h)?(?:(\d+)m)?([0-9.]+)s/i);
      if (match) {
        const hours = parseInt(match[1] || '0', 10);
        const mins = parseInt(match[2] || '0', 10);
        const secs = parseFloat(match[3] || '0');
        retryDelaySeconds = Math.ceil(hours * 3600 + mins * 60 + secs);
      }
    }

    if (retryDelaySeconds !== null && retryDelaySeconds > 90) {
      isDailyQuota = true;
      retryDelaySeconds = null;
    }

    if (statusCode === 429 && (message.toLowerCase().includes('daily') || message.toLowerCase().includes('quota') || isDailyQuota)) {
      isDailyQuota = true;
    }

    return {
      statusCode,
      code,
      type,
      message,
      isDailyQuota,
      retryDelaySeconds: isDailyQuota ? 0 : (retryDelaySeconds ? Math.min(60, retryDelaySeconds) : (statusCode === 429 ? 30 : null)),
    };
  }

  /**
   * Conversational Chat API:
   * Calls /openai/v1/chat/completions with tool calling support.
   */
  async chat({
    text,
    history = [],
    assistantName,
    userName = 'Friend',
    model = GROQ_DEFAULT_CHAT_MODEL,
    temperature = 0.6,
  }) {
    if (!this.hasKey()) {
      return {
        ok: false,
        error: 'GROQ_API_KEY is not configured. Please add your key in Settings -> AI Assistant.',
        code: 'NO_KEY',
      };
    }

    const resolvedName = (assistantName || 'Assistant').trim();
    const systemPrompt = `You are "${resolvedName}", an intelligent, witty, warm and concise desktop companion living inside Island for your human friend "${userName}".
Keep your answers very concise (1 to 2 sentences maximum, never lengthy paragraphs or lists) so it sounds like real spoken dialogue.
You naturally understand and respond in English, Hindi, and Hinglish. Match the language and tone used by the user.
Never output markdown symbols like asterisks, bullet points, or emojis, since your text will be read aloud as speech.
When the user asks to play music, check the current song, or control playback, use the appropriate tool function.`;

    const messages = [
      { role: 'system', content: systemPrompt },
    ];

    if (Array.isArray(history) && history.length > 0) {
      const recent = history.slice(-6);
      for (const item of recent) {
        if (item.text && item.role) {
          messages.push({
            role: item.role === 'user' ? 'user' : 'assistant',
            content: item.text,
          });
        }
      }
    }

    if (text && text.trim()) {
      messages.push({ role: 'user', content: text.trim() });
    }

    const payload = {
      model: model || GROQ_DEFAULT_CHAT_MODEL,
      messages,
      tools: ISLAND_MUSIC_TOOLS,
      tool_choice: 'auto',
      temperature,
      max_tokens: 250,
    };

    const postData = JSON.stringify(payload);
    const startTime = Date.now();

    return new Promise((resolve) => {
      const req = https.request({
        hostname: 'api.groq.com',
        path: '/openai/v1/chat/completions',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
        timeout: 15000,
      }, (res) => {
        let body = '';
        if (typeof res.setEncoding === 'function') res.setEncoding('utf8');
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          const durationMs = Date.now() - startTime;
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const data = JSON.parse(body);
              const choice = data?.choices?.[0];
              const msg = choice?.message || {};
              const replyText = msg.content?.trim() || '';

              // Check for structured tool call
              let actionTag = null;
              if (Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
                const call = msg.tool_calls[0];
                const fnName = call?.function?.name;
                let fnArgs = {};
                try {
                  fnArgs = JSON.parse(call?.function?.arguments || '{}');
                } catch {}

                actionTag = {
                  action: fnName,
                  query: fnArgs.query || undefined,
                };
              }

              // Embed action tag if model called tool
              let finalModelText = replyText;
              if (actionTag) {
                const tagStr = `[[ACTION:${JSON.stringify(actionTag)}]]`;
                finalModelText = finalModelText ? `${finalModelText} ${tagStr}` : tagStr;
              }

              this._logDiagnostic({
                timestamp: new Date().toISOString(),
                provider: 'groq',
                model,
                callType: 'chat',
                ok: true,
                httpStatus: res.statusCode,
                durationMs,
                tokens: data?.usage || null,
              });

              resolve({
                ok: true,
                text: finalModelText,
                hasAction: Boolean(actionTag),
                action: actionTag,
                provider: 'groq',
                model,
                usage: data?.usage || null,
              });
            } catch (err) {
              resolve({
                ok: false,
                error: `Failed to parse Groq chat response: ${err.message}`,
              });
            }
          } else {
            const errDetails = this._extractError(body, res);

            // Auto-fallback: If a user has a model configured that is retired/restricted on their tier (HTTP 404),
            // seamlessly retry with the active production model so voice chat succeeds without breaking.
            if (res.statusCode === 404 && model !== GROQ_FAST_CHAT_MODEL && !arguments[0]?._isFallback) {
              this._logDiagnostic({
                timestamp: new Date().toISOString(),
                provider: 'groq',
                model,
                callType: 'chat-fallback',
                note: `Model '${model}' returned 404. Automatically retrying with active production model '${GROQ_FAST_CHAT_MODEL}'.`,
              });

              return this.chat({
                text,
                history,
                assistantName,
                userName,
                model: GROQ_FAST_CHAT_MODEL,
                temperature,
                _isFallback: true,
              }).then(resolve);
            }

            this._logDiagnostic({
              timestamp: new Date().toISOString(),
              provider: 'groq',
              model,
              callType: 'chat',
              ok: false,
              httpStatus: res.statusCode,
              durationMs,
              error: errDetails,
            });

            let userError = errDetails.message;
            if (errDetails.statusCode === 401) {
              userError = 'Invalid Groq API Key. Please verify your key in Settings.';
            } else if (errDetails.statusCode === 404) {
              userError = `The model '${model}' is not accessible on this Groq account. Switched to '${GROQ_FAST_CHAT_MODEL}' in Settings.`;
            } else if (errDetails.isDailyQuota) {
              userError = 'Groq daily request limit reached. Please try again later or switch provider.';
            } else if (errDetails.statusCode === 429) {
              userError = 'Groq rate limit reached. Catching breath for a moment.';
            }

            resolve({
              ok: false,
              error: userError,
              code: errDetails.code,
              isDailyQuota: errDetails.isDailyQuota,
              retryDelaySeconds: errDetails.retryDelaySeconds,
              provider: 'groq',
              model,
            });
          }
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({
          ok: false,
          error: 'Connection to Groq API timed out (15s)',
          provider: 'groq',
          model,
        });
      });

      req.on('error', (err) => {
        resolve({
          ok: false,
          error: err.message || 'Network error reaching Groq API',
          provider: 'groq',
          model,
        });
      });

      req.write(postData);
      req.end();
    });
  }

  /**
   * Speech Recognition API (Groq Whisper):
   * Calls /openai/v1/audio/transcriptions with multipart/form-data.
   *
   * @param {Buffer|Uint8Array|string} audioBuffer - Binary WAV buffer or base64 string
   * @param {string} [model='whisper-large-v3-turbo'] - Whisper model
   * @param {string} [language] - Optional ISO language code
   */
  async transcribe({
    audioBuffer,
    audioBase64,
    model = GROQ_DEFAULT_WHISPER_MODEL,
    language,
    temperature = 0.0,
  }) {
    if (!this.hasKey()) {
      return {
        ok: false,
        error: 'GROQ_API_KEY is not configured for Whisper transcription. Please add your key in Settings.',
        code: 'NO_KEY',
      };
    }

    let buf;
    if (Buffer.isBuffer(audioBuffer)) {
      buf = audioBuffer;
    } else if (audioBuffer instanceof Uint8Array) {
      buf = Buffer.from(audioBuffer);
    } else if (typeof audioBase64 === 'string') {
      buf = Buffer.from(audioBase64, 'base64');
    } else {
      return { ok: false, error: 'No audio data provided for transcription' };
    }

    // Guard: Audio file too small (under 1KB is likely silence or truncated header)
    if (buf.length < 512) {
      return { ok: true, text: '', empty: true, provider: 'groq-whisper', model };
    }

    const boundary = `----IslandGroqBoundary${Date.now()}${Math.random().toString(36).slice(2)}`;
    const chunks = [];

    // 1. File part
    chunks.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="recording.wav"\r\n` +
      `Content-Type: audio/wav\r\n\r\n`
    ));
    chunks.push(buf);
    chunks.push(Buffer.from('\r\n'));

    // 2. Model part
    chunks.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="model"\r\n\r\n` +
      `${model}\r\n`
    ));

    // 3. Response format part
    chunks.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="response_format"\r\n\r\n` +
      `json\r\n`
    ));

    // 4. Optional language (if user explicitly provided language, e.g. 'en' or 'hi')
    if (language && typeof language === 'string' && language.trim()) {
      chunks.push(Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="language"\r\n\r\n` +
        `${language.trim()}\r\n`
      ));
    }

    // 5. Temperature
    chunks.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="temperature"\r\n\r\n` +
      `${temperature}\r\n`
    ));

    // Close boundary
    chunks.push(Buffer.from(`--${boundary}--\r\n`));

    const multipartBody = Buffer.concat(chunks);
    const startTime = Date.now();

    return new Promise((resolve) => {
      const req = https.request({
        hostname: 'api.groq.com',
        path: '/openai/v1/audio/transcriptions',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': multipartBody.length,
        },
        timeout: 15000,
      }, (res) => {
        let body = '';
        if (typeof res.setEncoding === 'function') res.setEncoding('utf8');
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          const durationMs = Date.now() - startTime;
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const data = JSON.parse(body);
              const transcript = (data?.text || '').trim();

              this._logDiagnostic({
                timestamp: new Date().toISOString(),
                provider: 'groq-whisper',
                model,
                callType: 'transcribe',
                ok: true,
                httpStatus: res.statusCode,
                durationMs,
                bytes: buf.length,
              });

              resolve({
                ok: true,
                text: transcript,
                provider: 'groq-whisper',
                model,
                durationMs,
              });
            } catch (err) {
              resolve({
                ok: false,
                error: `Failed to parse Whisper transcription: ${err.message}`,
              });
            }
          } else {
            const errDetails = this._extractError(body, res);
            this._logDiagnostic({
              timestamp: new Date().toISOString(),
              provider: 'groq-whisper',
              model,
              callType: 'transcribe',
              ok: false,
              httpStatus: res.statusCode,
              durationMs,
              error: errDetails,
            });

            resolve({
              ok: false,
              error: errDetails.message,
              code: errDetails.code,
              isDailyQuota: errDetails.isDailyQuota,
              retryDelaySeconds: errDetails.retryDelaySeconds,
              provider: 'groq-whisper',
              model,
            });
          }
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({
          ok: false,
          error: 'Connection to Groq Whisper timed out (15s)',
          provider: 'groq-whisper',
          model,
        });
      });

      req.on('error', (err) => {
        resolve({
          ok: false,
          error: err.message || 'Network error reaching Groq Whisper',
          provider: 'groq-whisper',
          model,
        });
      });

      req.write(multipartBody);
      req.end();
    });
  }
}

module.exports = {
  GroqService,
  GROQ_DEFAULT_CHAT_MODEL,
  GROQ_FAST_CHAT_MODEL,
  GROQ_DEFAULT_WHISPER_MODEL,
  GROQ_ACCURATE_WHISPER_MODEL,
};
