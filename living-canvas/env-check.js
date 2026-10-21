'use strict';

const os = require('os');
const config = require('./config');

/**
 * Safe, quick probe of local Ollama HTTP endpoint
 */
async function probeOllama(url = config.ollama.url, timeoutMs = 2500) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${url}/api/tags`, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) {
      return { available: false, error: `HTTP ${res.status}: ${res.statusText}` };
    }
    const data = await res.json();
    const models = Array.isArray(data.models) ? data.models.map((m) => m.name) : [];
    return { available: true, models, endpoint: url };
  } catch (err) {
    return { available: false, error: err.message || 'Connection refused', endpoint: url };
  }
}

/**
 * Safe, quick probe of local ComfyUI HTTP endpoint
 */
async function probeComfyUI(url = config.comfy.url, timeoutMs = 2500) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${url}/system_stats`, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) {
      return { available: false, error: `HTTP ${res.status}: ${res.statusText}` };
    }
    const data = await res.json();
    return { available: true, stats: data, endpoint: url };
  } catch (err) {
    return { available: false, error: err.message || 'Connection refused', endpoint: url };
  }
}

/**
 * Gathers system hardware profile
 */
function getHardwareProfile() {
  const cpus = os.cpus() || [];
  const cpuModel = cpus[0]?.model || 'Unknown CPU';
  const totalMemMB = Math.round(os.totalmem() / (1024 * 1024));
  const freeMemMB = Math.round(os.freemem() / (1024 * 1024));

  return {
    platform: process.platform,
    arch: process.arch,
    cpuModel,
    cpuCores: cpus.length,
    totalRamMB: totalMemMB,
    freeRamMB: freeMemMB,
    nodeVersion: process.version,
  };
}

/**
 * Comprehensive environment check
 */
async function checkEnvironment() {
  const hardware = getHardwareProfile();
  const [ollama, comfy] = await Promise.all([probeOllama(), probeComfyUI()]);

  const readyForLive = ollama.available && comfy.available;

  return {
    timestamp: new Date().toISOString(),
    hardware,
    ollama,
    comfy,
    recommendedMode: readyForLive ? 'live' : 'mock',
    notes: readyForLive
      ? 'Local Ollama and ComfyUI detected. Full end-to-end local generation available.'
      : 'Local Ollama or ComfyUI offline. Operating in high-fidelity deterministic mock mode (offline SVG poster rendering).',
  };
}

module.exports = {
  checkEnvironment,
  probeOllama,
  probeComfyUI,
  getHardwareProfile,
};
