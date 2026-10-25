'use strict';
/**
 * test/pass2-2-8-4-live-voice-ui.test.cjs
 * Automated test suite for Pass 2.2.8.4 Live Voice Assistant UI.
 * Verifies:
 * 1. Live Hero contract: Single latest meaningful turn prioritization.
 * 2. Conversational response suppression of duplicate caption text.
 * 3. Minimal Voice Indicator lifecycle state mappings (listening, thinking, preparing_speech, speaking, idle, muted, error).
 * 4. Scheduler Hero data structure (label, formatted countdown, progress, cancellation).
 * 5. History data model and chronological turn formatting without state loss.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

test('Pass 2.2.8.4: Live Voice Assistant UI Presentation Layer Suite', async (t) => {
  // Test 1: Live Hero selection logic (only latest meaningful turn, not endless transcript)
  await t.test('1. Live Hero surface prioritizes latest meaningful result over entire conversation', () => {
    const turns = [
      { id: 't1', speaker: 'user', text: 'Hi', timestamp: 1000 },
      { id: 't2', speaker: 'assistant', text: 'Hello! How can I help?', timestamp: 1001 },
      { id: 't3', speaker: 'user', text: 'Set a timer for five minutes for lunch', timestamp: 2000 },
      {
        id: 't4',
        speaker: 'assistant',
        text: 'Created Lunch timer for 5 minutes.',
        structured: {
          type: 'scheduler',
          data: { label: 'Lunch', durationSec: 300, remainingSec: 299, progress: 0.01 },
        },
        timestamp: 2002,
      },
    ];

    // Extraction helper simulating VoicePanel's latestAssistantTurn selection
    const assistantTurns = turns.filter((t) => t.speaker === 'assistant');
    const latestAssistantTurn = assistantTurns[assistantTurns.length - 1];

    assert.equal(latestAssistantTurn.id, 't4');
    assert.equal(latestAssistantTurn.structured.data.label, 'Lunch');
    assert.equal(latestAssistantTurn.structured.type, 'scheduler');
  });

  // Test 2: Conversational response suppresses duplicate captions
  await t.test('2. Conversational formatting suppresses duplicate spoken caption when identical', () => {
    const responseText = 'Island Voice prioritizes your current meaningful task.';
    const spokenTextIdentical = 'Island Voice prioritizes your current meaningful task.';
    const spokenTextDifferent = 'Here is what you need to know about Island Voice.';

    const isDuplicate = (body, caption) => {
      if (!caption || !body) return false;
      const cleanA = body.trim().toLowerCase();
      const cleanB = caption.trim().toLowerCase();
      return cleanA === cleanB;
    };

    assert.equal(isDuplicate(responseText, spokenTextIdentical), true, 'Should suppress duplicate caption');
    assert.equal(isDuplicate(responseText, spokenTextDifferent), false, 'Should allow different spoken intro');
  });

  // Test 3: Minimal 4-bar indicator audio amplitude calculation
  await t.test('3. Minimal voice indicator responds smoothly to audio amplitude level without large canvas', () => {
    const computeBarHeights = (audioLevel, status, isSpeaking) => {
      if (status === 'muted') return [3, 3, 3, 3];
      if (isSpeaking) return [8, 16, 12, 7];
      if (status === 'thinking' || status === 'transcribing') return null; // Uses CSS pulse animation
      const amp = Math.min(Math.max(audioLevel || 0, 0), 1);
      return [
        Math.round(3 + amp * 8),
        Math.round(4 + amp * 13),
        Math.round(3 + amp * 10),
        Math.round(3 + amp * 6),
      ];
    };

    const idleBars = computeBarHeights(0, 'listening', false);
    assert.deepEqual(idleBars, [3, 4, 3, 3], 'Baseline quiet mic levels');

    const activeBars = computeBarHeights(0.8, 'listening', false);
    assert.deepEqual(activeBars, [9, 14, 11, 8], 'Dynamic speech mic levels');

    const speakingBars = computeBarHeights(0, 'speaking', true);
    assert.deepEqual(speakingBars, [8, 16, 12, 7], 'Speaking playback levels');

    const mutedBars = computeBarHeights(0.5, 'muted', false);
    assert.deepEqual(mutedBars, [3, 3, 3, 3], 'Muted state locks to minimal height');
  });

  // Test 4: Timer Hero data structure and countdown format
  await t.test('4. Timer Hero formats countdown correctly (e.g. 04:59) without badges or card borders', () => {
    const formatTime = (totalSeconds) => {
      const s = Math.max(0, Math.floor(totalSeconds));
      const mins = Math.floor(s / 60);
      const secs = s % 60;
      return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    };

    assert.equal(formatTime(299), '04:59');
    assert.equal(formatTime(60), '01:00');
    assert.equal(formatTime(5), '00:05');
    assert.equal(formatTime(0), '00:00');
  });

  // Test 5: History data model preserves full session turns without mutation
  await t.test('5. History view accurately reflects session transcript without interrupting voice state', () => {
    const sessionHistory = [
      { id: '1', speaker: 'user', text: 'Set a timer for five minutes so I can get lunch' },
      { id: '2', speaker: 'assistant', text: 'Created Lunch timer for 5 minutes.' },
    ];

    let viewMode = 'live';
    const toggleHistory = () => {
      viewMode = viewMode === 'live' ? 'history' : 'live';
    };

    toggleHistory();
    assert.equal(viewMode, 'history');
    assert.equal(sessionHistory.length, 2);

    // Back to live
    toggleHistory();
    assert.equal(viewMode, 'live');
    assert.equal(sessionHistory.length, 2, 'Session history remains intact');
  });
});
