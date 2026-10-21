/**
 * Offline Verification Suite for:
 * 1. Startup Recovery (Kokoro local_files_only, no network hangs, graceful model handling)
 * 2. Dynamic Configurable AI Identity (no hardcoded Jadu, customizable name, dynamic prompt)
 * 3. Contextual Navigation & Launcher Panel (idle launches launcher, flexbox header, no mic collision)
 * 4. Unified Favorites UI and Provider Badges
 *
 * ZERO live AI / Gemini / OpenAI calls are made in this test.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

test('Dynamic Assistant Identity & Startup Recovery Test Suite', async (t) => {
  // Mock browser localStorage for assistant identity testing
  global.window = {
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  };
  const store = {};
  global.localStorage = {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); },
  };
  global.CustomEvent = class CustomEvent {
    constructor(type, init) {
      this.type = type;
      this.detail = init?.detail;
    }
  };

  const assistantModule = await import('../src/lib/assistant.js');
  const { getAssistantName, setAssistantName, getAssistantConfig } = assistantModule;

  await t.test('1. Assistant identity defaults to neutral name and is fully configurable', () => {
    localStorage.clear();
    const defaultName = getAssistantName();
    assert.ok(defaultName, 'Default assistant name exists');
    assert.notStrictEqual(defaultName.toLowerCase(), 'jadu', 'Default name must NOT be hardcoded to Jadu');

    // Customize assistant name
    setAssistantName('Nova');
    assert.strictEqual(getAssistantName(), 'Nova', 'Custom name is returned');
    assert.strictEqual(localStorage.getItem('island_assistant_name'), 'Nova', 'Persisted to localStorage');

    const config = getAssistantConfig();
    assert.strictEqual(config.name, 'Nova');
  });

  await t.test('2. Gemini system prompt incorporates dynamic assistant name', () => {
    // Inspect electron/gemini.js for dynamic assistant name usage
    const geminiCode = fs.readFileSync(path.join(__dirname, '..', 'electron', 'gemini.js'), 'utf-8');
    assert.ok(
      geminiCode.includes('assistantName') || geminiCode.includes('resolvedName'),
      'gemini.js must dynamically resolve assistantName in system prompt'
    );
    assert.ok(
      !geminiCode.includes('You are Jadu, an intelligent'),
      'gemini.js must not contain hardcoded "You are Jadu, an intelligent"'
    );
  });

  await t.test('3. Kokoro TTS service enforces local_files_only: true to prevent remote header stalls', () => {
    const kokoroCode = fs.readFileSync(path.join(__dirname, '..', 'electron', 'kokoro-tts.js'), 'utf-8');
    assert.ok(
      kokoroCode.includes('local_files_only: true'),
      'KokoroTTS.from_pretrained must include local_files_only: true to prevent network stalls'
    );
    assert.ok(
      kokoroCode.includes('KokoroLocalService'),
      'KokoroLocalService class is exported'
    );
  });

  await t.test('4. Header mic button does NOT use absolute positioning (eliminates overlap)', () => {
    const stylesCode = fs.readFileSync(path.join(__dirname, '..', 'src', 'styles.css'), 'utf-8');
    // Find .hub-voice-btn rule
    const micRuleMatch = stylesCode.match(/\.hub-voice-btn\s*\{([^}]+)\}/);
    assert.ok(micRuleMatch, 'Found .hub-voice-btn in styles.css');
    const micStyles = micRuleMatch[1];
    assert.ok(
      !micStyles.includes('position: absolute'),
      '.hub-voice-btn must NOT use position: absolute'
    );
    assert.ok(
      micStyles.includes('position: relative'),
      '.hub-voice-btn uses position: relative in flex flow'
    );
  });

  await t.test('5. Hub header uses flexbox layout with .hub__nav and .hub__actions', () => {
    const hubCode = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'Hub.jsx'), 'utf-8');
    assert.ok(hubCode.includes('hub__nav'), 'Hub header contains .hub__nav');
    assert.ok(hubCode.includes('hub__actions'), 'Hub header contains .hub__actions');
    assert.ok(hubCode.includes('LauncherPanel'), 'Hub renders LauncherPanel');
  });

  await t.test('6. Idle click expands to LauncherPanel rather than dead NowPlaying', () => {
    const islandCode = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'Island.jsx'), 'utf-8');
    assert.ok(
      islandCode.includes("if (mode === 'idle') openHub('launcher')"),
      'Idle click explicitly opens launcher view'
    );
    assert.ok(
      islandCode.includes("case 'launcher':"),
      'Dynamic height includes launcher case'
    );
  });

  await t.test('7. Icons registry provides required glyphs (Home, Grid, Search)', () => {
    const iconsCode = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'icons.jsx'), 'utf-8');
    assert.ok(iconsCode.includes('Home:'), 'icons.jsx provides Home glyph');
    assert.ok(iconsCode.includes('Grid:'), 'icons.jsx provides Grid glyph');
    assert.ok(iconsCode.includes('Search:'), 'icons.jsx provides Search glyph');
  });
});
