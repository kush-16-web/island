/**
 * src/lib/floating-layout-engine.js
 *
 * ISLAND — PASS 2.2.10.3: Adaptive Floating Lyrics Layout Engine
 *
 * Implements an intelligent, content-aware typography placement system:
 * 1. Measures rendered text metrics & natural word wrapping (canvas or font metrics).
 * 2. Defines stage exclusion zones (artwork, metadata, top nav, bottom controls).
 * 3. Evaluates candidate placement regions surrounding the centered artwork.
 * 4. Scores candidates based on readability, fit, collision avoidance, cover clearance, and balance.
 * 5. Deterministically locks positions for the entire fragment lifecycle.
 * 6. Supports dev-only debug inspection overlays.
 */

import { hashString } from './lyrics-style-engine.js';

// Default stage bounds (based on FullLyrics inside 440px shell)
export const DEFAULT_STAGE_BOUNDS = {
  width: 412,
  height: 240,
  topNavHeight: 12,
  bottomBarOffset: 236,
};

// Fixed Cover Geometry (148px centered, margin-top: 36px)
export const DEFAULT_COVER_BOUNDS = {
  width: 148,
  height: 148,
  top: 36,
  borderRadius: 18,
};

// Metadata Layer Geometry (directly beneath cover)
export const DEFAULT_META_BOUNDS = {
  width: 260,
  height: 38,
  top: 194,
};

/**
 * Text measurement helper.
 * Uses 2D canvas context when available (browser/Electron), or proportional character metrics in Node.js test environment.
 */
let cachedCanvasCtx = null;

export function getCanvasContext() {
  if (cachedCanvasCtx) return cachedCanvasCtx;
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    try {
      const canvas = document.createElement('canvas');
      cachedCanvasCtx = canvas.getContext('2d');
      if (cachedCanvasCtx) {
        cachedCanvasCtx.font = '500 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      }
    } catch {
      cachedCanvasCtx = null;
    }
  }
  return cachedCanvasCtx;
}

/**
 * Estimates text width for a single line using canvas or proportional font metrics.
 */
export function measureTextWidth(text, fontSize = 13) {
  if (!text) return 0;
  const ctx = getCanvasContext();
  if (ctx) {
    ctx.font = `500 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    return Math.ceil(ctx.measureText(text).width);
  }

  // Fallback metric estimation for Node.js / headless test environment
  // Calibrated for standard system sans-serif font at 13px
  let width = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (/[il1.,'!]/.test(char)) width += fontSize * 0.28;
    else if (/[fjrtI ]/.test(char)) width += fontSize * 0.38;
    else if (/[mwWM@#%&]/.test(char)) width += fontSize * 0.85;
    else if (/[A-Z]/.test(char)) width += fontSize * 0.68;
    else width += fontSize * 0.54; // standard lowercase/numbers
  }
  return Math.ceil(width);
}

/**
 * Measures text bounds given an available maxWidth, calculating natural line wrapping.
 * Returns { width, height, lineCount, lines, isTruncated }
 */
export function measureTextBounds(text, maxWidth = 180, fontSize = 13, maxLines = 2) {
  if (!text) {
    return { width: 0, height: 0, lineCount: 0, lines: [], isTruncated: false };
  }

  const trimmed = text.trim();
  const singleLineWidth = measureTextWidth(trimmed, fontSize);

  // If it fits in one line comfortably
  if (singleLineWidth <= maxWidth) {
    return {
      width: singleLineWidth,
      height: Math.ceil(fontSize * 1.35),
      lineCount: 1,
      lines: [trimmed],
      isTruncated: false,
    };
  }

  // Natural word wrapping
  const words = trimmed.split(/\s+/);
  const lines = [];
  let currentLine = '';
  let maxMeasuredWidth = 0;

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    const candWidth = measureTextWidth(candidate, fontSize);

    if (candWidth <= maxWidth) {
      currentLine = candidate;
    } else {
      if (currentLine) {
        lines.push(currentLine);
        maxMeasuredWidth = Math.max(maxMeasuredWidth, measureTextWidth(currentLine, fontSize));
        currentLine = word;
      } else {
        // Single word exceeds maxWidth; must place it
        lines.push(word);
        maxMeasuredWidth = Math.max(maxMeasuredWidth, candWidth);
        currentLine = '';
      }

      // Check maxLines constraint
      if (lines.length >= maxLines && i < words.length - 1) {
        break;
      }
    }
  }

  if (currentLine && lines.length < maxLines) {
    lines.push(currentLine);
    maxMeasuredWidth = Math.max(maxMeasuredWidth, measureTextWidth(currentLine, fontSize));
  }

  const lineHeight = Math.ceil(fontSize * 1.35);
  const totalHeight = lines.length * lineHeight;

  return {
    width: Math.min(maxWidth, maxMeasuredWidth || singleLineWidth),
    height: totalHeight,
    lineCount: lines.length,
    lines,
    isTruncated: false,
  };
}

/**
 * Natural short phrase excerpt helper.
 * Prevents paragraph blocks while preserving complete grammatical units and words.
 */
export function formatLyricExcerpt(rawText, maxLen = 38) {
  if (!rawText) return '';
  const trimmed = rawText.trim();
  if (trimmed.length <= maxLen) return trimmed;

  // Split at natural clause boundary if present in comfortable range (e.g. comma, dash, semicolon)
  const punctMatch = trimmed.match(/^([^,;—–-]+)[,;—–-]/);
  if (punctMatch && punctMatch[1].length >= 10 && punctMatch[1].length <= maxLen) {
    return punctMatch[1].trim();
  }

  // Otherwise split at nearest word boundary before maxLen
  const lastSpace = trimmed.lastIndexOf(' ', maxLen);
  if (lastSpace > 14) {
    return trimmed.slice(0, lastSpace).trim();
  }

  return trimmed.slice(0, maxLen).trim();
}

/**
 * Calculates stage exclusion rectangles relative to the stage bounds.
 */
export function getStageExclusionZones(stageBounds = DEFAULT_STAGE_BOUNDS) {
  const W = stageBounds.width || 412;
  const H = stageBounds.height || 240;

  const coverLeft = Math.round((W - DEFAULT_COVER_BOUNDS.width) / 2);
  const coverRight = coverLeft + DEFAULT_COVER_BOUNDS.width;
  const coverTop = DEFAULT_COVER_BOUNDS.top;
  const coverBottom = coverTop + DEFAULT_COVER_BOUNDS.height;

  const metaLeft = Math.round((W - DEFAULT_META_BOUNDS.width) / 2);
  const metaRight = metaLeft + DEFAULT_META_BOUNDS.width;
  const metaTop = DEFAULT_META_BOUNDS.top;
  const metaBottom = metaTop + DEFAULT_META_BOUNDS.height;

  return {
    // 1. Top bar exclusion
    topBar: {
      id: 'top-bar',
      x: 0,
      y: 0,
      width: W,
      height: 6,
    },
    // 2. Centered Cover
    cover: {
      id: 'artwork-cover',
      x: coverLeft,
      y: coverTop,
      width: DEFAULT_COVER_BOUNDS.width,
      height: DEFAULT_COVER_BOUNDS.height,
      right: coverRight,
      bottom: coverBottom,
    },
    // 3. Metadata (Title & Artist)
    metadata: {
      id: 'metadata',
      x: metaLeft,
      y: metaTop,
      width: DEFAULT_META_BOUNDS.width,
      height: DEFAULT_META_BOUNDS.height,
      right: metaRight,
      bottom: metaBottom,
    },
    // 4. Bottom controls exclusion
    bottomControls: {
      id: 'bottom-controls',
      x: 0,
      y: H - 8,
      width: W,
      height: 20,
    },
    // Safe margins
    safeArea: {
      minX: 12,
      maxX: W - 12,
      minY: 6,
      maxY: H - 8,
    },
  };
}

/**
 * Checks whether two 2D axis-aligned bounding boxes intersect, with optional padding.
 */
export function checkRectCollision(rectA, rectB, padding = 6) {
  return !(
    rectA.x + rectA.width + padding <= rectB.x ||
    rectA.x >= rectB.x + rectB.width + padding ||
    rectA.y + rectA.height + padding <= rectB.y ||
    rectA.y >= rectB.y + rectB.height + padding
  );
}

/**
 * Generates candidate free-space placement regions around the centered artwork.
 * Adapts to stage width (W) and height (H).
 */
export function getCandidatePlacementRegions(stageBounds = DEFAULT_STAGE_BOUNDS) {
  const W = stageBounds.width || 412;
  const coverLeft = Math.round((W - DEFAULT_COVER_BOUNDS.width) / 2); // ~132px
  const coverRight = coverLeft + DEFAULT_COVER_BOUNDS.width; // ~280px

  return [
    // Zone 0: Above cover (Wide horizontal area)
    {
      id: 'above',
      name: 'Above Cover',
      minX: 16,
      maxX: W - 16,
      defaultX: Math.round(W / 2 - 105),
      top: 8,
      maxWidth: 215,
      preferredRole: ['active', 'past', 'upcoming'],
      allowUnderCover: false,
      weight: 1.15,
    },
    // Zone 1: Mid-left (Around middle of cover)
    {
      id: 'mid-left',
      name: 'Mid Left',
      minX: 12,
      maxX: coverLeft - 8,
      defaultX: 14,
      top: 68,
      maxWidth: Math.max(135, coverLeft - 22),
      preferredRole: ['active', 'past', 'upcoming'],
      allowUnderCover: false,
      weight: 1.10,
    },
    // Zone 2: Upper-right (Partly behind cover for supporting, clear for active)
    {
      id: 'upper-right',
      name: 'Upper Right',
      minX: coverRight - 26, // Starts 26px under cover for supporting fragments
      activeMinX: coverRight + 6, // Clear of cover for active fragments
      maxX: W - 12,
      defaultX: coverRight - 26,
      top: 40,
      maxWidth: 180,
      preferredRole: ['upcoming', 'active'],
      allowUnderCover: true,
      weight: 1.05,
    },
    // Zone 3: Lower-right (Partly behind cover for supporting, clear for active)
    {
      id: 'lower-right',
      name: 'Lower Right',
      minX: coverRight - 22, // Starts 22px under cover for supporting fragments
      activeMinX: coverRight + 6,
      maxX: W - 12,
      defaultX: coverRight - 22,
      top: 118,
      maxWidth: 175,
      preferredRole: ['upcoming', 'past'],
      allowUnderCover: true,
      weight: 1.0,
    },
    // Zone 4: Lower-left (Beside lower-left corner of cover)
    {
      id: 'lower-left',
      name: 'Lower Left',
      minX: 14,
      maxX: coverLeft - 8,
      defaultX: 16,
      top: 148,
      maxWidth: Math.max(130, coverLeft - 24),
      preferredRole: ['past', 'upcoming'],
      allowUnderCover: false,
      weight: 1.0,
    },
    // Zone 5: Diagonal Upper-Left (Alternative wide zone above-left)
    {
      id: 'top-left-diagonal',
      name: 'Top Left Diagonal',
      minX: 14,
      maxX: Math.round(W / 2 - 20),
      defaultX: 20,
      top: 16,
      maxWidth: 165,
      preferredRole: ['past', 'active'],
      allowUnderCover: false,
      weight: 0.95,
    },
    // Zone 6: Diagonal Upper-Right (Alternative wide zone above-right)
    {
      id: 'top-right-diagonal',
      name: 'Top Right Diagonal',
      minX: Math.round(W / 2 + 10),
      maxX: W - 16,
      defaultX: Math.round(W / 2 + 25),
      top: 16,
      maxWidth: 165,
      preferredRole: ['upcoming', 'active'],
      allowUnderCover: false,
      weight: 0.95,
    },
  ];
}

/**
 * Content-Aware Placement Solver.
 * Evaluates candidate positions for an incoming lyric line, avoiding collisions and maintaining Reference A fidelity.
 *
 * @param {Object} line - Lyric line object { text, startTimeMs }
 * @param {string} role - 'active' | 'upcoming' | 'past' | 'distant'
 * @param {Array} currentFragments - Currently visible or exiting fragments
 * @param {Object} options - { stageBounds, previousZoneId, trackSeed }
 * @returns {Object} Selected placement { x, y, maxWidth, zoneId, lineCount, width, height, debugCandidates }
 */
export function solveAdaptivePlacement(
  line,
  role = 'active',
  currentFragments = [],
  options = {}
) {
  const rawText = (line?.text || '').trim();
  const displayText = formatLyricExcerpt(rawText, 38);
  const stageBounds = options.stageBounds || DEFAULT_STAGE_BOUNDS;
  const exclusions = getStageExclusionZones(stageBounds);
  const regions = getCandidatePlacementRegions(stageBounds);
  const previousZoneId = options.previousZoneId || null;
  const trackSeed = options.trackSeed || 'island';
  const isActive = role === 'active';

  // Gather occupied bounding boxes of existing visible and dissolving fragments
  const occupiedRects = currentFragments.map((f) => ({
    id: f.lineIndex,
    x: f.placement.x,
    y: f.placement.y,
    width: f.placement.width,
    height: f.placement.height,
    status: f.status,
  }));

  const candidateScores = [];

  for (const region of regions) {
    const isUnderCoverAllowed = region.allowUnderCover && !isActive;
    const regionMaxWidth = region.maxWidth;

    // Measure text bounds at this candidate's max width
    const bounds = measureTextBounds(displayText, regionMaxWidth, 13, 2);

    // Compute coordinate X:
    // If active line in upper-right or lower-right, stay strictly clear of cover
    let x = region.defaultX;
    if (isActive && region.activeMinX != null) {
      x = region.activeMinX;
    }

    // Ensure within stage safe area bounds
    x = Math.max(exclusions.safeArea.minX, Math.min(x, stageBounds.width - bounds.width - 12));
    const y = Math.max(exclusions.safeArea.minY, Math.min(region.top, stageBounds.height - bounds.height - 8));

    const candidateRect = {
      x,
      y,
      width: bounds.width,
      height: bounds.height,
      zoneId: region.id,
    };

    // Calculate Candidate Score:
    let score = 100 * (region.weight || 1.0);

    // 1. Collision Detection with existing fragments
    let hasCollision = false;
    for (const occupied of occupiedRects) {
      if (checkRectCollision(candidateRect, occupied, 8)) {
        hasCollision = true;
        // Collision with an exiting fragment is penalized less than with an active fragment
        score -= occupied.status === 'exiting' ? 65 : 120;
      }
    }

    // 2. Active Line Readability & Cover Clearance
    if (isActive) {
      // Must not collide with artwork cover
      if (checkRectCollision(candidateRect, exclusions.cover, 2)) {
        score -= 200; // Strictly disqualify active lyric from hiding behind cover
      } else {
        score += 35; // Bonus for completely clear readability
      }

      // Bonus for single-line fit without wrapping
      if (bounds.lineCount === 1) {
        score += 25;
      }

      // For long lines, boost spacious 'above' region
      if (displayText.length > 26 && region.id === 'above') {
        score += 45;
      }
    } else {
      // Supporting fragment (past / upcoming):
      // Reward atmospheric partial cover overlap on the right for Reference A fidelity!
      if (region.allowUnderCover && isUnderCoverAllowed) {
        score += 20;
      }
    }

    // 3. Metadata Exclusion Check
    if (checkRectCollision(candidateRect, exclusions.metadata, 4)) {
      score -= 150;
    }

    // 4. Natural Variety: Avoid repeating the immediately previous lyric's zone
    if (previousZoneId && region.id === previousZoneId) {
      score -= 30;
    }

    // 5. Deterministic tie-breaker
    const tieBreaker = Math.abs(hashString(`${trackSeed}-${line?.startTimeMs || 0}-${region.id}`)) % 10;
    score += tieBreaker * 0.1;

    candidateScores.push({
      zoneId: region.id,
      regionName: region.name,
      x,
      y,
      width: bounds.width,
      height: bounds.height,
      maxWidth: regionMaxWidth,
      lineCount: bounds.lineCount,
      score,
      hasCollision,
      rect: candidateRect,
    });
  }

  // Sort descending by score
  candidateScores.sort((a, b) => b.score - a.score);
  const best = candidateScores[0];

  return {
    x: best.x,
    y: best.y,
    width: best.width,
    height: best.height,
    maxWidth: best.maxWidth,
    lineCount: best.lineCount,
    zoneId: best.zoneId,
    displayText,
    debugCandidates: candidateScores,
  };
}

/**
 * Creates CSS placement style for a resolved fragment position.
 */
export function createPlacementStyle(placement) {
  return {
    position: 'absolute',
    top: `${placement.y}px`,
    left: `${placement.x}px`,
    maxWidth: `${placement.maxWidth}px`,
    textAlign: 'left',
  };
}
