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

/**
 * Dynamically resolve the configured AI assistant name.
 * Respects previous configurations and user preferences.
 */
export function getAssistantName() {
  if (typeof window === 'undefined') return DEFAULT_ASSISTANT_NAME;
  try {
    const saved = localStorage.getItem('island_assistant_name');
    if (saved && saved.trim()) {
      return saved.trim();
    }
    // Backward compatibility / migration: if user previously had a companion name configured
    const legacy = localStorage.getItem('island_pet_name');
    if (legacy && legacy.trim() && legacy !== 'Mochi' && legacy !== 'Cat') {
      return legacy.trim();
    }
    return DEFAULT_ASSISTANT_NAME;
  } catch {
    return DEFAULT_ASSISTANT_NAME;
  }
}

/**
 * Update and persist the assistant's name.
 */
export function setAssistantName(newName) {
  if (typeof window === 'undefined') return;
  const cleanName = (newName || '').trim().slice(0, 24) || DEFAULT_ASSISTANT_NAME;
  try {
    localStorage.setItem('island_assistant_name', cleanName);
    window.dispatchEvent(
      new CustomEvent('island:assistant-changed', {
        detail: { name: cleanName },
      })
    );
  } catch (err) {
    console.warn('[assistant] Failed to persist name:', err);
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
