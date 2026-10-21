'use strict';

const path = require('path');

module.exports = {
  ollama: {
    url: process.env.OLLAMA_URL || 'http://127.0.0.1:11434',
    model: process.env.OLLAMA_MODEL || 'llama3.2:latest',
    timeoutMs: 12000,
  },
  comfy: {
    url: process.env.COMFYUI_URL || 'http://127.0.0.1:8188',
    timeoutMs: 15000,
    defaultCheckpoint: 'v1-5-pruned-emaonly.safetensors',
  },
  outputDir: path.resolve(__dirname, 'output'),
  artisticDirection: {
    style: 'Editorial art poster with expressive continuous-line ink drawing',
    lineQuality: 'Organic, imperfect, fluid, unbroken single stroke',
    space: 'Intentional negative space (minimum 55% unoccupied)',
    palette: 'Restrained, curated, 2-4 harmonious tones',
    forbidden: [
      'generic silhouette',
      'random floral clusters',
      'meaningless geometric fractals',
      'stock vector illustration',
      '3D glossy render',
      'photorealism',
      'garish neon gradients',
      'watermarks or signature text',
    ],
  },
};
