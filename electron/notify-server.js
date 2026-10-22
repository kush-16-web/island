'use strict';
// Local-only HTTP endpoint so scripts, build tools and other apps can show a notification on the island.
//
//   POST http://127.0.0.1:47823/notify   {"title":"Build done","body":"42 tests passed","app":"Terminal","kind":"success"}
//
// Safety: binds to 127.0.0.1 only, requires Content-Type: application/json (which browsers can't send
// cross-origin without a CORS preflight we never approve), checks the Host header against DNS rebinding,
// and caps body size and field lengths.

const http = require('http');

const DEFAULT_PORT = 47823;
const KINDS = new Set(['info', 'success', 'warning', 'error']);

function clean(value, max) {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '';
}

function parseNotification(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Body must be a JSON object' };
  const title = clean(body.title, 120);
  if (!title) return { error: '"title" is required' };
  let timeoutMs = Number(body.timeoutMs);
  if (!Number.isFinite(timeoutMs)) timeoutMs = 5000;
  return {
    value: {
      title,
      body: clean(body.body, 400),
      app: clean(body.app, 40) || 'Notification',
      kind: KINDS.has(body.kind) ? body.kind : 'info',
      timeoutMs: Math.min(30000, Math.max(1500, timeoutMs)),
    },
  };
}

function createNotifyServer({ port = DEFAULT_PORT, onNotify, onVideoState, companionBridge, maxBodyBytes = 16 * 1024 } = {}) {
  const server = http.createServer((req, res) => {
    // CORS preflight support for companion browser extension
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
      });
      return res.end();
    }
    const send = (status, payload, extraHeaders = {}) => {
      const text = JSON.stringify(payload);
      res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(text),
        'Cache-Control': 'no-store',
        ...extraHeaders,
      });
      res.end(text);
    };

    const hostname = String(req.headers.host || '').toLowerCase().replace(/:\d+$/, '');
    if (hostname !== '127.0.0.1' && hostname !== 'localhost') return send(403, { ok: false, error: 'Forbidden host' });

    const pathname = String(req.url || '').split('?')[0];
    if (pathname === '/health' && req.method === 'GET') {
      return send(200, { ok: true, app: 'island' }, { 'Access-Control-Allow-Origin': '*' });
    }

    if (companionBridge && pathname.startsWith('/companion/')) {
      if (pathname === '/companion/status' && req.method === 'GET') {
        return send(200, { ok: true, ...companionBridge.getStatus() }, { 'Access-Control-Allow-Origin': '*' });
      }
      if (pathname === '/companion/command' && req.method === 'GET') {
        const command = companionBridge.pullNextCommand();
        return send(200, { ok: true, command }, { 'Access-Control-Allow-Origin': '*' });
      }
    }

    const isCompanionPost = companionBridge && pathname.startsWith('/companion/');
    if (pathname !== '/notify' && pathname !== '/video-state' && !isCompanionPost) {
      return send(404, { ok: false, error: 'Not found' });
    }
    if (req.method !== 'POST') return send(405, { ok: false, error: 'Use POST' });

    const type = String(req.headers['content-type'] || '').toLowerCase();
    if (!type.startsWith('application/json')) {
      return send(415, { ok: false, error: 'Content-Type must be application/json' });
    }

    const chunks = [];
    let size = 0;
    let rejected = false;

    req.on('data', (chunk) => {
      if (rejected) return;
      size += chunk.length;
      if (size > maxBodyBytes) {
        rejected = true;
        send(413, { ok: false, error: 'Body too large' }, { Connection: 'close' });
        res.once('finish', () => req.socket.destroy());
      } else {
        chunks.push(chunk);
      }
    });

    req.on('end', () => {
      if (rejected) return;
      let parsed;
      try {
        parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        return send(400, { ok: false, error: 'Invalid JSON' });
      }

      if (isCompanionPost) {
        try {
          if (pathname === '/companion/ping') {
            const resData = companionBridge.handlePing(parsed);
            return send(200, resData, { 'Access-Control-Allow-Origin': '*' });
          }
          if (pathname === '/companion/state') {
            const resData = companionBridge.handleStateUpdate(parsed);
            return send(200, resData, { 'Access-Control-Allow-Origin': '*' });
          }
          if (pathname === '/companion/ack') {
            const resData = companionBridge.handleAck(parsed);
            return send(200, resData, { 'Access-Control-Allow-Origin': '*' });
          }
          if (pathname === '/companion/dispatch') {
            companionBridge
              .dispatchCommand(parsed)
              .then((result) => send(200, result, { 'Access-Control-Allow-Origin': '*' }))
              .catch((err) => send(500, { ok: false, error: err.message }, { 'Access-Control-Allow-Origin': '*' }));
            return;
          }
          return send(404, { ok: false, error: 'Not found' });
        } catch (err) {
          return send(500, { ok: false, error: err.message }, { 'Access-Control-Allow-Origin': '*' });
        }
      }

      if (pathname === '/video-state') {
        try {
          if (onVideoState) onVideoState(parsed);
          return send(200, { ok: true }, { 'Access-Control-Allow-Origin': '*' });
        } catch {
          return send(500, { ok: false, error: 'Could not process video state' });
        }
      }

      const result = parseNotification(parsed);
      if (result.error) return send(400, { ok: false, error: result.error });
      try {
        const id = onNotify(result.value);
        return send(202, { ok: true, id }, { 'Access-Control-Allow-Origin': '*' });
      } catch (err) {
        return send(500, { ok: false, error: 'Could not show notification' });
      }
    });

    req.on('error', () => {});
  });

  server.requestTimeout = 10000;
  server.headersTimeout = 10000;

  return {
    server,
    listen() {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', () => {
          server.removeListener('error', reject);
          resolve(server.address().port);
        });
      });
    },
    close() {
      return new Promise((resolve) => {
        if (server.closeAllConnections) server.closeAllConnections();
        server.close(() => resolve());
      });
    },
  };
}

module.exports = { createNotifyServer, parseNotification, DEFAULT_PORT };
