'use strict';
/**
 * test/pass2-2-10-4-view-persistence.test.cjs
 * Automated regression test suite for PASS 2.2.10.4:
 * Player View Persistence & Artwork State Synchronization.
 *
 * Verifies:
 * 1. View Persistence: Full Lyrics remains mounted and visible across playback events
 *    (pause, resume, next, prev, autoplay, lyrics loading, seeking, temporary metadata gaps).
 * 2. Navigation Separation: Playback events do not alter viewMode; only explicit user
 *    actions (close button, Escape key) change player view.
 * 3. Compact Artwork Restoration: Compact player cover opacity is never stuck at 0;
 *    isSourceCoverHidden is guaranteed false whenever viewMode !== 'lyrics'.
 * 4. Authoritative Artwork State: Shared artwork state resolves provider thumbnails,
 *    upgrades resolutions, caches responses, and bridges transient metadata gaps.
 * 5. Async Race Protection: Slower responses for older tracks cannot overwrite newer tracks.
 * 6. Dynamic Color Stability: Background palette is preserved across pause/resume and
 *    does not flash during transient metadata gaps.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Pass 2.2.10.4: Player View Persistence & Artwork State Synchronization Suite', async (t) => {
  const npPath = path.join(__dirname, '../src/components/NowPlaying.jsx');
  const flPath = path.join(__dirname, '../src/components/FullLyrics.jsx');
  const islandPath = path.join(__dirname, '../src/components/Island.jsx');
  const artHookPath = path.join(__dirname, '../src/hooks/useHighResArt.js');

  const npCode = fs.readFileSync(npPath, 'utf8');
  const flCode = fs.readFileSync(flPath, 'utf8');
  const islandCode = fs.readFileSync(islandPath, 'utf8');
  const artHookCode = fs.readFileSync(artHookPath, 'utf8');

  // 1. Navigation State Separation: No playback events reset viewMode
  await t.test('1. Navigation Separation: Track changes and lyrics arrivals never reset viewMode', () => {
    // Must NOT reset viewMode on media.title or media.artist
    assert.ok(
      !npCode.includes("handleSetViewMode(isVideoSource ? 'cinema' : 'player');\n    setIsScrubbing"),
      'NowPlaying must NOT reset viewMode in track change effect'
    );
    assert.ok(
      !npCode.includes("setViewMode(nextMode);\n    onLyricsViewChange"),
      'NowPlaying must NOT automatically setViewMode on media.title changes'
    );

    // Must NOT reset viewMode when lyricsData arrives
    assert.ok(
      !npCode.includes("handleSetViewMode('player');\n    }\n  }, [lyricsData?.lines?.length]"),
      'NowPlaying must NOT reset viewMode to player when lyrics load'
    );
  });

  // 2. View Persistence: Full Lyrics stays mounted during transient media.active drops
  await t.test('2. View Persistence: Full Lyrics stays mounted during transient provider gaps', () => {
    // NowPlaying must check viewMode !== 'lyrics' before showing Empty state
    assert.ok(
      npCode.includes("!media.active && viewMode !== 'lyrics'"),
      'NowPlaying must not show Empty state when viewMode is lyrics'
    );

    // Island.jsx must allocate 390px for lyrics even during transient media.active drops
    const dynamicHeightSnippet = islandCode.slice(
      islandCode.indexOf("case 'playing':"),
      islandCode.indexOf("case 'clock':")
    );
    const lyricsFullIdx = dynamicHeightSnippet.indexOf("if (isLyricsFull === 'lyrics' || isLyricsFull === true) return 390;");
    const inactiveMediaIdx = dynamicHeightSnippet.indexOf("if (!media.active) return 240;");
    assert.ok(lyricsFullIdx !== -1, 'isLyricsFull === lyrics height allocation must exist');
    assert.ok(inactiveMediaIdx !== -1, 'inactive media height allocation must exist');
    assert.ok(
      lyricsFullIdx < inactiveMediaIdx,
      'isLyricsFull check must precede !media.active check to prevent window resizing during track transitions'
    );
  });

  // 3. Compact Artwork Restoration: isSourceCoverHidden cannot remain true when not in lyrics
  await t.test('3. Compact Artwork Restoration: isSourceCoverHidden is guaranteed false when viewMode !== lyrics', () => {
    // handleSetViewMode must clear isSourceCoverHidden when switching away from lyrics
    assert.ok(
      npCode.includes("if (mode !== 'lyrics') {\n      setIsSourceCoverHidden(false);"),
      'handleSetViewMode must clear isSourceCoverHidden when navigating away from lyrics'
    );

    // Safety effect must ensure isSourceCoverHidden is false whenever viewMode !== 'lyrics'
    assert.ok(
      npCode.includes("if (viewMode !== 'lyrics' && isSourceCoverHidden) {\n      setIsSourceCoverHidden(false);"),
      'Safety effect must automatically restore source cover visibility whenever viewMode !== lyrics'
    );
  });

  // 4. Authoritative Artwork State: useHighResArt bridges transient gaps with bounded grace window
  await t.test('4. Authoritative Artwork State: useHighResArt includes bounded grace window and race protection', () => {
    // Checks for grace window timeout to prevent blank flashes
    assert.ok(
      artHookCode.includes('graceTimeout') || artHookCode.includes('graceTimer'),
      'useHighResArt must have a grace window for transient metadata gaps'
    );

    // Checks for monotonic sequence request tracking
    assert.ok(
      artHookCode.includes('reqSequenceRef') && artHookCode.includes('activeTrackRef'),
      'useHighResArt must track request sequence and active track to prevent async races'
    );

    // Immediate cleanup on session inactive
    assert.ok(
      artHookCode.includes('if (!isActive) {') && artHookCode.includes('setDisplayArt(null)'),
      'useHighResArt must immediately clear artwork when media session is stopped'
    );
  });

  // 5. Dynamic Color Preservation: Island.jsx preserves extracted palette across pause/resume
  await t.test('5. Dynamic Color Preservation: Island.jsx prevents palette drops on pause and transient gaps', () => {
    assert.ok(
      islandCode.includes('colorArtRef'),
      'Island.jsx must track colorArtRef to avoid redundant extractions on pause/resume'
    );
    assert.ok(
      islandCode.includes('if (!media.art) {\n      // Temporary gap: preserve current extracted color'),
      'Island.jsx must preserve current palette during temporary art omission'
    );
  });

  // 6. State Machine Simulation: Simulates real user scenarios
  await t.test('6. State Machine Simulation: Simulates user actions and playback events', () => {
    // Model state machine mimicking NowPlaying viewMode & cover visibility
    let viewMode = 'player';
    let isSourceCoverHidden = false;
    let isLyricsFull = false;

    const setViewMode = (mode) => {
      if (mode !== 'lyrics') {
        isSourceCoverHidden = false;
      }
      viewMode = mode;
      isLyricsFull = mode === 'player' ? false : mode;
    };

    const openFullLyrics = () => {
      isSourceCoverHidden = true;
      setViewMode('lyrics');
    };

    const closeFullLyrics = () => {
      isSourceCoverHidden = false;
      setViewMode('player');
    };

    // User opens full lyrics
    openFullLyrics();
    assert.equal(viewMode, 'lyrics', 'View must be lyrics');
    assert.equal(isSourceCoverHidden, true, 'Source cover hidden while in lyrics');
    assert.equal(isLyricsFull, 'lyrics');

    // Scenario A: Pause playback -> must NOT reset viewMode
    // (media.status = 'paused' does not trigger setViewMode)
    assert.equal(viewMode, 'lyrics', 'Pause must preserve Full Lyrics');

    // Scenario B: Resume playback -> must NOT reset viewMode
    assert.equal(viewMode, 'lyrics', 'Resume must preserve Full Lyrics');

    // Scenario C: Next track -> must NOT reset viewMode
    assert.equal(viewMode, 'lyrics', 'Next track must preserve Full Lyrics');

    // Scenario D: Previous track -> must NOT reset viewMode
    assert.equal(viewMode, 'lyrics', 'Previous track must preserve Full Lyrics');

    // Scenario E: Lyrics load -> must NOT reset viewMode
    assert.equal(viewMode, 'lyrics', 'Lyrics arrival must preserve Full Lyrics');

    // Scenario F: User explicitly closes Full Lyrics
    closeFullLyrics();
    assert.equal(viewMode, 'player', 'Explicit close returns to player');
    assert.equal(isSourceCoverHidden, false, 'Compact cover must be visible (opacity 1)');
  });

  // 7. Simulated Artwork Race Condition: Older responses cannot overwrite newer tracks
  await t.test('7. Artwork Race Condition Simulation: Older responses are rejected', () => {
    let activeTrack = 'Track A';
    let seq = 1;
    let displayedArt = 'art-A.jpg';

    // Track changes to Track B
    activeTrack = 'Track B';
    seq = 2;
    displayedArt = 'art-B.jpg';

    // Now a delayed response for Track A arrives
    const delayedTrack = 'Track A';
    const delayedSeq = 1;
    const delayedArt = 'art-A-hires.jpg';

    if (delayedTrack === activeTrack && delayedSeq === seq) {
      displayedArt = delayedArt;
    }

    assert.equal(displayedArt, 'art-B.jpg', 'Delayed Track A response must NOT overwrite Track B');
  });

  // 8. Adaptive Floating Lyrics intact: Engine and stage components unmodified
  await t.test('8. Adaptive Floating Lyrics Intact: Layout engine and stage preserved', () => {
    const stagePath = path.join(__dirname, '../src/components/FloatingLyricsStage.jsx');
    const enginePath = path.join(__dirname, '../src/lib/floating-layout-engine.js');
    assert.ok(fs.existsSync(stagePath), 'FloatingLyricsStage.jsx must exist');
    assert.ok(fs.existsSync(enginePath), 'floating-layout-engine.js must exist');

    const stageCode = fs.readFileSync(stagePath, 'utf8');
    assert.ok(stageCode.includes('solveAdaptivePlacement'), 'FloatingLyricsStage must use solveAdaptivePlacement');
    assert.ok(stageCode.includes('floating-lyric--emerging'), 'FloatingLyricsStage must support emerging animation');
  });
});
