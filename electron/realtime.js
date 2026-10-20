'use strict';
// Secure local session broker for OpenAI Realtime API.
// Runs strictly in the Electron main process during development.
// NEVER exposes OPENAI_API_KEY to the renderer, preload IPC, logs, or browser.

const fs = require('fs');
const https = require('https');
const path = require('path');
const { app } = require('electron');

class RealtimeSessionBroker {
  constructor() {
    this.apiKey = this._loadApiKey();
  }

  _loadApiKey() {
    // 1. Process environment (if set)
    if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim()) {
      return process.env.OPENAI_API_KEY.trim();
    }

    // 2. Read local .env file in workspace root
    try {
      const candidates = [
        path.join(__dirname, '..', '.env'),
        path.join(process.cwd(), '.env'),
        ...(app && app.getAppPath ? [path.join(app.getAppPath(), '.env')] : []),
      ];

      for (const envPath of candidates) {
        if (fs.existsSync(envPath)) {
          const content = fs.readFileSync(envPath, 'utf8');
          const match = content.match(/^\s*OPENAI_API_KEY\s*=\s*(?:['"](.*?)['"]|([^\r\n#]+))/m);
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

  /**
   * Creates a short-lived client secret (ephemeral token) for WebRTC connection.
   * Returns ONLY the ephemeral client secret and model name to the renderer.
   */
  async createSession({ petName = 'Mochi', userName = 'Friend', voice = 'verse' } = {}) {
    // Production boundary: cloud voice in development mode requires dev key;
    // in packaged builds without a configured secure server, disable.
    if (app && app.isPackaged && !process.env.ISLAND_PRODUCTION_REALTIME_URL) {
      return {
        ok: false,
        error: 'Cloud voice in production builds requires an authenticated backend service.',
      };
    }

    if (!this.apiKey) {
      return {
        ok: false,
        error: 'OPENAI_API_KEY is not configured in .env. Please add your API key to enable voice.',
      };
    }

    // Supported modern Realtime models in order of preference
    const model = 'gpt-realtime-mini';

    const payload = JSON.stringify({
      session: {
        type: 'realtime',
        model,
      },
    });

    return new Promise((resolve) => {
      const options = {
        hostname: 'api.openai.com',
        port: 443,
        path: '/v1/realtime/client_secrets',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: 10000,
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
        });

        res.on('end', () => {
          if (res.statusCode !== 200) {
            try {
              const errJson = JSON.parse(body);
              const errMsg = errJson?.error?.message || `OpenAI returned status ${res.statusCode}`;
              return resolve({ ok: false, error: errMsg });
            } catch {
              return resolve({ ok: false, error: `OpenAI returned status ${res.statusCode}` });
            }
          }

          try {
            const data = JSON.parse(body);
            const clientSecret = data.value || (data.client_secret && data.client_secret.value);

            if (!clientSecret) {
              return resolve({ ok: false, error: 'No ephemeral client secret in OpenAI response.' });
            }

            // Return ONLY ephemeral client secret and model (never the master key)
            resolve({
              ok: true,
              clientSecret,
              model,
              petName,
              userName,
              voice,
            });
          } catch {
            resolve({ ok: false, error: 'Could not parse response from OpenAI.' });
          }
        });
      });

      req.on('error', (err) => {
        resolve({ ok: false, error: `Network error connecting to OpenAI: ${err.message}` });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({ ok: false, error: 'Request to OpenAI timed out.' });
      });

      req.write(payload);
      req.end();
    });
  }
}

module.exports = { RealtimeSessionBroker };
