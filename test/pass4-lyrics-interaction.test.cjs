'use strict';
/**
 * test/pass4-lyrics-interaction.test.cjs
 * Permanent regression suite for Lyrics Popover Interaction Boundaries & Minimal UI.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Pass 4.2: Lyrics Popover Interaction Boundaries & Minimal UI Suite', async (t) => {
  const islandSource = fs.readFileSync(path.join(__dirname, '../src/components/Island.jsx'), 'utf8');
  const nowPlayingSource = fs.readFileSync(path.join(__dirname, '../src/components/NowPlaying.jsx'), 'utf8');
  const fullLyricsSource = fs.readFileSync(path.join(__dirname, '../src/components/FullLyrics.jsx'), 'utf8');
  const popoverSource = fs.readFileSync(path.join(__dirname, '../src/components/LyricsSettingsPopover.jsx'), 'utf8');
  const stylesSource = fs.readFileSync(path.join(__dirname, '../src/styles.css'), 'utf8');

  // Test 1: Island.jsx recognizes portaled popover boundary
  await t.test('1. Island.jsx: Pointer events inside .lyrics-settings-popover never collapse the Island hub', () => {
    assert.ok(
      islandSource.includes("el.closest('.lyrics-settings-popover')"),
      'Island onWindowPointerDown must explicitly check for .lyrics-settings-popover'
    );
    assert.ok(
      islandSource.includes("el.closest('.np__lyrics-popover')"),
      'Island onWindowPointerDown must check for .np__lyrics-popover'
    );
  });

  // Test 2: Island.jsx Escape key precedence
  await t.test('2. Island.jsx: Escape key closes settings popover first without dismissing Island', () => {
    assert.ok(
      islandSource.includes("document.querySelector('.lyrics-settings-popover')"),
      'Island onWindowKeyDown must check if popover is open before triggering setHubOpen(false)'
    );
  });

  // Test 3: NowPlaying.jsx click-outside boundary
  await t.test('3. NowPlaying.jsx: Outside-click handler ignores clicks inside the portaled popover', () => {
    assert.ok(
      nowPlayingSource.includes("el.closest('.lyrics-settings-popover')"),
      'NowPlaying handleOutsideClick must permit clicks inside .lyrics-settings-popover'
    );
  });

  // Test 4: FullLyrics.jsx click-outside & Escape key boundaries
  await t.test('4. FullLyrics.jsx: Settings popover interactions do not exit Full Lyrics or collapse player', () => {
    assert.ok(
      fullLyricsSource.includes("el.closest('.lyrics-settings-popover')"),
      'FullLyrics handleOutsideClick must permit clicks inside .lyrics-settings-popover'
    );
    assert.ok(
      fullLyricsSource.includes('showSettingsPopover') && fullLyricsSource.includes('setShowSettingsPopover(false)'),
      'FullLyrics Escape handler must close the settings popover first without closing Full Lyrics'
    );
  });

  // Test 5: Minimal horizontal music-control structure
  await t.test('5. LyricsSettingsPopover: Renders minimal horizontal music-first selectors without CRM clutter', () => {
    assert.ok(popoverSource.includes('Lyrics style'), 'Must contain concise "Lyrics style" label');
    assert.ok(popoverSource.includes('Layout'), 'Must contain concise "Layout" label');
    assert.ok(popoverSource.includes('Classic'), 'Must include Classic option');
    assert.ok(popoverSource.includes('Kinetic'), 'Must include Kinetic option');
    assert.ok(popoverSource.includes('Ghost + Wave'), 'Must include Ghost + Wave option');
    assert.ok(popoverSource.includes('Floating'), 'Must include Floating layout');
    assert.ok(popoverSource.includes('Normal'), 'Must include Normal layout');

    // Confirm removal of CRM paragraphs
    assert.ok(!popoverSource.includes('Original clean typography'), 'Explanatory CRM descriptions must be removed');
    assert.ok(!popoverSource.includes('Meaning-aware subtle emphasis'), 'Explanatory CRM descriptions must be removed');
  });

  // Test 6: Solid opaque dynamic surface & white-flash prevention
  await t.test('6. CSS Styles: Opaque album-adapted dynamic surface with backdrop-filter: none prevents transparent white flash', () => {
    assert.ok(
      stylesSource.includes('color-mix(in srgb, var(--popover-accent') && stylesSource.includes('!important'),
      'Must declare opaque dynamic background adapted from --popover-accent'
    );
    assert.ok(
      stylesSource.includes('backdrop-filter: none !important;'),
      'Must disable backdrop-filter to prevent DirectComposition white blowout'
    );
    assert.ok(
      stylesSource.includes('.lsp__pill-row'),
      'Must define horizontal .lsp__pill-row container'
    );
    assert.ok(
      stylesSource.includes('.lsp__pill-btn'),
      'Must define .lsp__pill-btn selector'
    );
  });

  // Test 7: Electron Click-Through & Hit Boundary
  await t.test('7. Electron click-through boundary: Popover has data-hit and useClickThrough tracks it', () => {
    const clickThroughSource = fs.readFileSync(path.join(__dirname, '../src/hooks/useClickThrough.js'), 'utf8');
    assert.ok(
      popoverSource.includes('data-hit'),
      'LyricsSettingsPopover root must have data-hit to prevent window click-through'
    );
    assert.ok(
      clickThroughSource.includes('.lyrics-settings-popover'),
      'useClickThrough must recognize .lyrics-settings-popover as interactive hit target'
    );
    assert.ok(
      islandSource.includes("document.querySelector('.lyrics-settings-popover')"),
      'Island blur handler must ignore blur events while popover is open'
    );
  });
});

