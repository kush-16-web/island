#!/usr/bin/env node
'use strict';
// Show a notification on the island from any terminal:
//   npm run notify -- "Build finished" "42 tests passed" --kind success --app Terminal
//   npm run build && npm run notify -- "Build finished"

const http = require('http');

const args = process.argv.slice(2);
const positional = [];
const flags = {};
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    flags[args[i].slice(2)] = args[i + 1];
    i++;
  } else {
    positional.push(args[i]);
  }
}

const [title, body = ''] = positional;
if (!title) {
  console.error('Usage: island-notify "Title" ["Body"] [--kind info|success|warning|error] [--app Name] [--port 47823]');
  process.exit(2);
}

const port = Number(flags.port || process.env.ISLAND_PORT || 47823);
const payload = JSON.stringify({ title, body, kind: flags.kind, app: flags.app || 'Terminal' });

const req = http.request(
  {
    host: '127.0.0.1',
    port,
    path: '/notify',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
  },
  (res) => {
    let text = '';
    res.on('data', (chunk) => (text += chunk));
    res.on('end', () => {
      if (res.statusCode === 202) process.exit(0);
      console.error(`Island answered ${res.statusCode}: ${text}`);
      process.exit(1);
    });
  },
);

req.on('error', () => {
  console.error(`Could not reach Island on 127.0.0.1:${port}. Is it running?`);
  process.exit(1);
});
req.end(payload);
