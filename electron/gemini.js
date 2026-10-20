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

  _postJson(endpoint, payload) {
    return new Promise((resolve) => {
      if (!this.apiKey) {
        return resolve({
          ok: false,
          error: 'GEMINI_API_KEY is not configured in .env. Please add your key to enable Gemini Voice.',
        });
      }

      const postData = JSON.stringify(payload);
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
          try {
            const data = JSON.parse(body);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve({ ok: true, data });
            } else {
              const errMsg = data.error?.message || `HTTP ${res.statusCode} from Gemini API`;
              resolve({ ok: false, error: errMsg, code: data.error?.code || res.statusCode });
            }
          } catch {
            resolve({ ok: false, error: `Invalid response from Gemini (HTTP ${res.statusCode})` });
          }
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({ ok: false, error: 'Connection to Gemini API timed out' });
      });

      req.on('error', (err) => {
        resolve({ ok: false, error: err.message || 'Network error reaching Gemini' });
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
    petName = 'Cat',
    userName = 'Friend',
    voice = 'Puck',
  }) {
    if (!this.hasKey()) {
      return {
        ok: false,
        error: 'GEMINI_API_KEY not found in .env. Please check your API key configuration.',
      };
    }

    try {
      // 1. Build conversation contents
      const systemPrompt = `You are "${petName}", an intelligent, witty, warm and concise desktop companion living inside Island for your human friend "${userName}".
Keep your answers very concise (1 to 2 sentences maximum, never lengthy paragraphs or lists) so it sounds like real spoken dialogue.
You naturally understand and respond in English, Hindi, and Hinglish. Match the language and tone used by the user.
Never output markdown symbols like asterisks, bullet points, or emojis, since your text will be read aloud as speech.`;

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
      const chatRes = await this._postJson('/v1beta/models/gemini-3.5-flash:generateContent', {
        systemInstruction: {
          parts: [{ text: systemPrompt }],
        },
        contents,
      });

      if (!chatRes.ok) {
        // Translate error cleanly for user display
        let userFacingError = chatRes.error;
        if (chatRes.error?.includes('Resource has been exhausted') || chatRes.code === 429) {
          userFacingError = 'Gemini free-tier rate limit reached. Please wait a moment and retry.';
        } else if (chatRes.code === 503 || chatRes.error?.includes('high demand')) {
          userFacingError = 'Gemini is temporarily experiencing high traffic. Please retry in a few seconds.';
        }
        return { ok: false, error: userFacingError };
      }

      const replyText = chatRes.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
        || `Meow! I'm here beside you, ${userName}!`;

      // 3. Synthesize speech using gemini-3.8-flash-tts
      const ttsRes = await this._postJson('/v1beta/models/gemini-3.8-flash-tts:generateContent', {
        contents: [
          { parts: [{ text: replyText }] },
        ],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: voice || 'Puck',
              },
            },
          },
        },
      });

      let audioBase64 = null;
      let mimeType = 'audio/wav';

      if (ttsRes.ok) {
        const audioPart = ttsRes.data?.candidates?.[0]?.content?.parts?.[0];
        if (audioPart?.inlineData?.data) {
          audioBase64 = audioPart.inlineData.data;
          mimeType = audioPart.inlineData.mimeType || 'audio/wav';
        }
      }

      return {
        ok: true,
        text: replyText,
        audioBase64,
        mimeType,
        provider: 'gemini',
      };
    } catch (err) {
      return {
        ok: false,
        error: err.message || 'Unexpected error in Gemini Voice Service',
      };
    }
  }

  async synthesizeSpeech({ text, voice = 'Puck' }) {
    if (!this.hasKey()) {
      return { ok: false, error: 'GEMINI_API_KEY is not configured in .env.' };
    }

    const ttsRes = await this._postJson('/v1beta/models/gemini-3.8-flash-tts:generateContent', {
      contents: [
        { parts: [{ text }] },
      ],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: voice || 'Puck',
            },
          },
        },
      },
    });

    if (ttsRes.ok) {
      const audioPart = ttsRes.data?.candidates?.[0]?.content?.parts?.[0];
      if (audioPart?.inlineData?.data) {
        return {
          ok: true,
          audioBase64: audioPart.inlineData.data,
          mimeType: audioPart.inlineData.mimeType || 'audio/wav',
        };
      }
    }

    return { ok: false, error: ttsRes.error || 'Failed to synthesize speech' };
  }
}

module.exports = { GeminiVoiceService };
