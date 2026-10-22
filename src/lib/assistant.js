'use strict';
/**
 * src/lib/assistant.js
 * Centralized, authoritative configuration and identity for Island's AI Assistant.
 *
 * RULES:
 * 1. The assistant name is user-configurable and NEVER permanently hardcoded.
 * 2. "Island" is the product; the assistant is a personalized companion.
 * 3. Persists across restarts in localStorage under 'island_assistant_name'.
 * 4. Dispatches 'island:assistant-changed' on updates.
 */

const DEFAULT_ASSISTANT_NAME = 'Nova';

let inMemoryAssistantName = null;

function getStorage() {
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  if (typeof localStorage !== 'undefined') return localStorage;
  return null;
}

/**
 * Dynamically resolve the configured AI assistant name.
 * Respects previous configurations and user preferences.
 */
export function getAssistantName() {
  const s = getStorage();
  if (s) {
    try {
      const saved = s.getItem('island_assistant_name');
      if (saved && saved.trim()) {
        return saved.trim();
      }
      // Backward compatibility / migration: if user previously had a companion name configured
      const legacy = s.getItem('island_pet_name');
      if (legacy && legacy.trim() && legacy !== 'Mochi' && legacy !== 'Cat') {
        return legacy.trim();
      }
      return DEFAULT_ASSISTANT_NAME;
    } catch {
      return DEFAULT_ASSISTANT_NAME;
    }
  }
  return inMemoryAssistantName || DEFAULT_ASSISTANT_NAME;
}

/**
 * Update and persist the assistant's name.
 */
export function setAssistantName(newName) {
  const cleanName = (newName || '').trim().slice(0, 24) || DEFAULT_ASSISTANT_NAME;
  inMemoryAssistantName = cleanName;
  const s = getStorage();
  if (s) {
    try {
      s.setItem('island_assistant_name', cleanName);
    } catch (err) {
      console.warn('[assistant] Failed to persist name:', err);
    }
  }
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    try {
      window.dispatchEvent(
        new CustomEvent('island:assistant-changed', {
          detail: { name: cleanName },
        })
      );
    } catch {}
  }
}

/**
 * Retrieve comprehensive assistant configuration.
 */
export function getAssistantConfig() {
  const name = getAssistantName();
  const voiceEngine = (typeof window !== 'undefined' && localStorage.getItem('island_voice_engine')) || 'gemini';
  const voiceId = (typeof window !== 'undefined' && localStorage.getItem('island_kokoro_voice')) || 'af_heart';
  const allowCloudFallback = typeof window !== 'undefined' && localStorage.getItem('island_voice_cloud_fallback') === 'true';

  return {
    name,
    displayName: name,
    voiceEngine,
    voiceId,
    allowCloudFallback,
  };
}
