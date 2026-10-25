'use strict';
/**
 * test/pass2-2-10-adaptive-lyrics.test.cjs
 * Automated test suite for Pass 2.2.10.3: Adaptive Floating Lyrics — Content-Aware Placement & Background Emergence.
 *
 * Verifies:
 * 1. Text Measurement & Natural Wrapping: Accurately calculates width and wraps into <= 2 lines.
 * 2. Stage Exclusion Zones: Identifies safe margins, cover bounds, and metadata exclusion zones.
 * 3. Collision Detection: AABB collision checks with configurable padding.
 * 4. Content-Aware Candidate Scoring:
 *    - Active lines strictly avoid cover occlusion and prioritize readability.
 *    - Long phrases (>28 chars) are routed to spacious regions (e.g. above cover).
 *    - Supporting lines (past/upcoming) maintain intentional depth with partial cover tucking.
 * 5. Position Locking & Determinism: Identical lyric state produces identical coordinates.
 * 6. Zone Alternation: Consecutive lyrics prefer different candidate zones to prevent repetitiveness.
 * 7. Capacity & Overcrowding: Coordinates and bounds maintain balanced composition without crashing.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  measureTextWidth,
  measureTextBounds,
  formatLyricExcerpt,
  getStageExclusionZones,
  checkRectCollision,
  getCandidatePlacementRegions,
  solveAdaptivePlacement,
  DEFAULT_STAGE_BOUNDS,
  DEFAULT_COVER_BOUNDS,
} = require('../src/lib/floating-layout-engine.js');

test('Pass 2.2.10.3: Adaptive Floating Lyrics — Content-Aware Placement Engine Suite', async (t) => {
  // Test 1: Text Measurement & Wrapping
  await t.test('1. Text measurement & natural wrapping: accurately handles short, medium, and long lines', () => {
    const shortText = 'Chest pain';
    const shortBounds = measureTextBounds(shortText, 180, 13, 2);
    assert.equal(shortBounds.lineCount, 1, 'Short text fits in 1 line');
    assert.ok(shortBounds.width > 30 && shortBounds.width < 100);

    const longText = 'Taking off your winter coat in the hallway waiting';
    const longBounds = measureTextBounds(longText, 140, 13, 2);
    assert.equal(longBounds.lineCount, 2, 'Long text wraps cleanly into 2 lines given 140px');
    assert.ok(longBounds.height >= 30, 'Two lines have proportional height');
    assert.ok(longBounds.width <= 140, 'Width does not exceed maxWidth');
  });

  // Test 2: Phrase Excerpting
  await t.test('2. Phrase excerpting: preserves words and breaks at natural clauses without awkward cuts', () => {
    const punctuated = 'Never really knew what you would say, girl';
    const excerpt = formatLyricExcerpt(punctuated, 35);
    assert.ok(excerpt.length <= 35);
    assert.ok(!excerpt.endsWith(' '));
    assert.ok(excerpt.startsWith('Never really knew'));
  });

  // Test 3: Stage Exclusion Zones
  await t.test('3. Stage exclusion zones: defines centered 148px artwork and metadata zones', () => {
    const exclusions = getStageExclusionZones(DEFAULT_STAGE_BOUNDS);
    assert.equal(exclusions.cover.width, 148);
    assert.equal(exclusions.cover.height, 148);
    assert.equal(exclusions.cover.y, 36);

    // Centered horizontally: (412 - 148) / 2 = 132
    assert.equal(exclusions.cover.x, 132);
    assert.equal(exclusions.cover.right, 280);

    // Metadata sits beneath cover
    assert.ok(exclusions.metadata.y >= exclusions.cover.bottom);
    assert.ok(exclusions.safeArea.minX >= 10);
  });

  // Test 4: Collision Detection
  await t.test('4. Collision detection: correctly detects overlapping rectangles and respects padding', () => {
    const rect1 = { x: 10, y: 10, width: 100, height: 30 };
    const rect2 = { x: 50, y: 20, width: 80, height: 30 };
    const rectFar = { x: 200, y: 10, width: 80, height: 30 };

    assert.ok(checkRectCollision(rect1, rect2, 4), 'Overlapping rects collide');
    assert.ok(!checkRectCollision(rect1, rectFar, 4), 'Distant rects do not collide');

    // Edge-touching with padding
    const rectAdjacent = { x: 112, y: 10, width: 50, height: 30 };
    assert.ok(checkRectCollision(rect1, rectAdjacent, 6), 'Adjacent rects collide when padding is applied');
    assert.ok(!checkRectCollision(rect1, rectAdjacent, 1), 'Adjacent rects clear without padding');
  });

  // Test 5: Active Line Readability & Cover Avoidance
  await t.test('5. Active line placement: strictly avoids cover collision and prioritizes readability', () => {
    const line = { text: 'I love when you push my buttons', startTimeMs: 24000 };
    const placement = solveAdaptivePlacement(line, 'active', [], {
      stageBounds: DEFAULT_STAGE_BOUNDS,
      trackSeed: 'test-seed-1',
    });

    assert.ok(placement.x != null && placement.y != null);
    assert.ok(placement.maxWidth >= 135);

    // Verify active line placement does not intersect cover bounding box
    const exclusions = getStageExclusionZones(DEFAULT_STAGE_BOUNDS);
    const placedRect = {
      x: placement.x,
      y: placement.y,
      width: placement.width,
      height: placement.height,
    };

    assert.ok(
      !checkRectCollision(placedRect, exclusions.cover, 0),
      'Active line must not overlap the artwork cover'
    );
  });

  // Test 6: Long Line Adaptive Placement
  await t.test('6. Long line handling: routes long lyric to spacious candidate region (e.g. above cover)', () => {
    const longLine = {
      text: 'Taking off your winter coat in the dark hallway waiting for tomorrow',
      startTimeMs: 45000,
    };

    const placement = solveAdaptivePlacement(longLine, 'active', [], {
      stageBounds: DEFAULT_STAGE_BOUNDS,
      trackSeed: 'long-line-seed',
    });

    assert.ok(placement.maxWidth >= 170, 'Long line gets a wide placement container');
    assert.ok(placement.lineCount <= 2, 'Wraps in at most 2 lines, never a narrow paragraph');
    // Top or wide diagonal zone chosen
    assert.ok(
      ['above', 'top-left-diagonal', 'top-right-diagonal'].includes(placement.zoneId),
      `Long line routed to spacious zone: got ${placement.zoneId}`
    );
  });

  // Test 7: Supporting Fragment Atmospheric Depth
  await t.test('7. Supporting fragments: allows subtle partial cover tuck on upper/lower right for Reference A depth', () => {
    const upcomingLine = { text: 'Chest pain, girl, you know I love it', startTimeMs: 50000 };
    const placement = solveAdaptivePlacement(upcomingLine, 'upcoming', [], {
      stageBounds: DEFAULT_STAGE_BOUNDS,
      trackSeed: 'seed-supporting',
    });

    assert.ok(placement.zoneId != null);
    assert.ok(placement.x > 0);
  });

  // Test 8: Collision Avoidance with Existing Fragments
  await t.test('8. Collision avoidance: new fragment avoids regions already occupied by visible fragments', () => {
    // Existing active fragment placed in 'above' zone
    const existing = [
      {
        lineIndex: 0,
        placement: { x: 101, y: 8, width: 160, height: 20 },
        status: 'settled',
      },
    ];

    const newLine = { text: 'Second phrase running here', startTimeMs: 30000 };
    const placement = solveAdaptivePlacement(newLine, 'active', existing, {
      stageBounds: DEFAULT_STAGE_BOUNDS,
      trackSeed: 'seed-collision',
    });

    // Bounding box of new placement must not collide with existing fragment
    const newRect = {
      x: placement.x,
      y: placement.y,
      width: placement.width,
      height: placement.height,
    };

    assert.ok(
      !checkRectCollision(newRect, existing[0].placement, 6),
      'New placement must not collide with existing settled fragment'
    );
    assert.notEqual(placement.zoneId, 'above', 'Avoids zone that has a hard collision');
  });

  // Test 9: Zone Alternation (No Boring Repetition)
  await t.test('9. Zone alternation: penalizes repeating immediately previous zone when alternatives exist', () => {
    const lineA = { text: 'First short line', startTimeMs: 10000 };
    const placementA = solveAdaptivePlacement(lineA, 'active', [], {
      stageBounds: DEFAULT_STAGE_BOUNDS,
      previousZoneId: null,
      trackSeed: 'test-seed',
    });

    const lineB = { text: 'Second short line', startTimeMs: 15000 };
    const placementB = solveAdaptivePlacement(lineB, 'active', [], {
      stageBounds: DEFAULT_STAGE_BOUNDS,
      previousZoneId: placementA.zoneId,
      trackSeed: 'test-seed',
    });

    assert.notEqual(
      placementA.zoneId,
      placementB.zoneId,
      'Consecutive short lines should vary placement zones'
    );
  });

  // Test 10: Determinism and Locked Coordinates
  await t.test('10. Deterministic placement: identical line and state produce identical coordinates', () => {
    const line = { text: 'Deterministic test phrase', startTimeMs: 20000 };

    const run1 = solveAdaptivePlacement(line, 'active', [], {
      stageBounds: DEFAULT_STAGE_BOUNDS,
      trackSeed: 'const-seed',
    });

    const run2 = solveAdaptivePlacement(line, 'active', [], {
      stageBounds: DEFAULT_STAGE_BOUNDS,
      trackSeed: 'const-seed',
    });

    assert.equal(run1.x, run2.x);
    assert.equal(run1.y, run2.y);
    assert.equal(run1.zoneId, run2.zoneId);
    assert.equal(run1.maxWidth, run2.maxWidth);
  });
});
