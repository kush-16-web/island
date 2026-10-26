import { useState, useEffect, useRef, useMemo } from 'react';
import { hashString } from '../lib/lyrics-style-engine';
import {
  solveAdaptivePlacement,
  createPlacementStyle,
  formatLyricExcerpt,
  getStageExclusionZones,
  checkRectCollision,
  DEFAULT_STAGE_BOUNDS,
  DEFAULT_COVER_BOUNDS,
} from '../lib/floating-layout-engine';

const isReducedMotion =
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

/**
 * Backward-compatible Reference Anchors export.
 * Preserved for tests and fallback references.
 */
export const REFERENCE_ANCHORS = [
  {
    id: 'above',
    style: {
      top: '8px',
      left: 'calc(50% - 105px)',
      maxWidth: '210px',
      textAlign: 'left',
    },
    enterDelta: { x: 0, y: -4 },
    staggerDelay: 0.10,
  },
  {
    id: 'mid-left',
    style: {
      top: '72px',
      left: '14px',
      maxWidth: '145px',
      textAlign: 'left',
    },
    enterDelta: { x: -4, y: 0 },
    staggerDelay: 0.04,
  },
  {
    id: 'upper-right-obscured',
    style: {
      top: '42px',
      left: 'calc(50% + 48px)',
      maxWidth: '180px',
      textAlign: 'left',
    },
    enterDelta: { x: 4, y: -2 },
    staggerDelay: 0.16,
  },
  {
    id: 'lower-right-obscured',
    style: {
      top: '122px',
      left: 'calc(50% + 52px)',
      maxWidth: '175px',
      textAlign: 'left',
    },
    enterDelta: { x: 4, y: 2 },
    staggerDelay: 0.22,
  },
  {
    id: 'lower-left',
    style: {
      top: '152px',
      left: '16px',
      maxWidth: '140px',
      textAlign: 'left',
    },
    enterDelta: { x: -4, y: 4 },
    staggerDelay: 0.18,
  },
];

export { formatLyricExcerpt };

/**
 * Dev-Only Debug Visualization Overlay.
 * Renders stage bounds, exclusion zones (cover, metadata), and candidate placement rectangles.
 */
function FloatingLyricsDebugOverlay({ fragments, stageBounds = DEFAULT_STAGE_BOUNDS }) {
  const exclusions = getStageExclusionZones(stageBounds);

  return (
    <div className="floating-stage__debug-overlay" aria-hidden="true">
      {/* Exclusion: Cover */}
      <div
        className="floating-stage__debug-rect floating-stage__debug-rect--exclusion"
        style={{
          top: `${exclusions.cover.y}px`,
          left: `${exclusions.cover.x}px`,
          width: `${exclusions.cover.width}px`,
          height: `${exclusions.cover.height}px`,
        }}
      >
        <span className="floating-stage__debug-label">Cover (148px)</span>
      </div>

      {/* Exclusion: Metadata */}
      <div
        className="floating-stage__debug-rect floating-stage__debug-rect--exclusion"
        style={{
          top: `${exclusions.metadata.y}px`,
          left: `${exclusions.metadata.x}px`,
          width: `${exclusions.metadata.width}px`,
          height: `${exclusions.metadata.height}px`,
        }}
      >
        <span className="floating-stage__debug-label">Metadata</span>
      </div>

      {/* Placed fragment bounding boxes */}
      {fragments.map((f) => (
        <div
          key={`debug-${f.lineIndex}`}
          className="floating-stage__debug-rect floating-stage__debug-rect--selected"
          style={{
            top: `${f.placement.y}px`,
            left: `${f.placement.x}px`,
            width: `${f.placement.width}px`,
            height: `${f.placement.height}px`,
          }}
        >
          <span className="floating-stage__debug-label">
            {f.role}:{f.placement.zoneId}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function FloatingLyricsStage({
  lines = [],
  activeLineIndex = 0,
  currentPositionMs = 0,
  isSynced = true,
  showLyrics = true,
  seed = '',
  lyricsStyle = 'classic',
  lyricsPresentation = {},
  onSeek,
  centerArtwork,
  trackMeta,
  debugOverlay = false,
}) {
  const hasLyrics = lines.length > 0;

  // Stateful fragment pool to guarantee smooth lifecycle: Emerging -> Settled -> Active -> Dissolving -> Remove
  const [fragments, setFragments] = useState([]);
  const lastActiveIndexRef = useRef(activeLineIndex);
  const lastSeedRef = useRef(seed);
  const lastPlacedZoneIdRef = useRef(null);
  const exitTimersRef = useRef(new Map());

  // Show debug overlay if explicitly requested or via window flag
  const isDebugActive =
    debugOverlay ||
    (typeof window !== 'undefined' && Boolean(window.__ISLAND_DEBUG_FLOATING_LYRICS__));

  // Clean up all exit timers on unmount
  useEffect(() => {
    return () => {
      exitTimersRef.current.forEach((t) => clearTimeout(t));
      exitTimersRef.current.clear();
    };
  }, []);

  // Update fragments pool on activeLineIndex, lines, showLyrics, or seed changes
  useEffect(() => {
    if (!showLyrics || !hasLyrics || !isSynced) {
      exitTimersRef.current.forEach((t) => clearTimeout(t));
      exitTimersRef.current.clear();
      setFragments([]);
      return;
    }

    const isSeekOrTrackChange =
      seed !== lastSeedRef.current ||
      Math.abs(activeLineIndex - lastActiveIndexRef.current) > 2;

    lastActiveIndexRef.current = activeLineIndex;
    lastSeedRef.current = seed;

    // Window bounds: active ± 2 lines
    const minIdx = Math.max(0, activeLineIndex - 2);
    const maxIdx = Math.min(lines.length - 1, activeLineIndex + 2);
    const targetIndices = [];

    // Prioritize active index first, then adjacent lines
    const lineOrder = [activeLineIndex, activeLineIndex - 1, activeLineIndex + 1, activeLineIndex - 2, activeLineIndex + 2];
    lineOrder.forEach((idx) => {
      if (idx >= minIdx && idx <= maxIdx) {
        const text = (lines[idx]?.text || '').trim();
        if (text && text !== '♪' && text !== '---' && !targetIndices.includes(idx)) {
          targetIndices.push(idx);
        }
      }
    });

    // Limit visible target count to capacity (max 4 lines) to prevent clutter
    const activeTargetIndices = targetIndices.slice(0, 4);
    const targetSet = new Set(activeTargetIndices);

    // On major seek or track change, instantly rebuild without lingering old phrases
    if (isSeekOrTrackChange) {
      exitTimersRef.current.forEach((t) => clearTimeout(t));
      exitTimersRef.current.clear();

      const newFrags = [];
      let lastZone = null;

      // Always solve active line first, then supporting lines
      activeTargetIndices.forEach((idx) => {
        const offset = idx - activeLineIndex;
        let role = 'distant';
        if (offset === 0) role = 'active';
        else if (offset === -1) role = 'past';
        else if (offset === 1) role = 'upcoming';

        const placement = solveAdaptivePlacement(lines[idx], role, newFrags, {
          stageBounds: DEFAULT_STAGE_BOUNDS,
          previousZoneId: lastZone,
          trackSeed: seed,
        });

        // Skip adding supporting fragment if no clear collision-free zone exists
        if (role !== 'active' && placement.score != null && placement.score < 0) {
          return;
        }

        lastZone = placement.zoneId;

        newFrags.push({
          lineIndex: idx,
          line: lines[idx],
          displayText: placement.displayText,
          role,
          placement,
          style: createPlacementStyle(placement),
          status: 'settled',
        });
      });

      lastPlacedZoneIdRef.current = lastZone;
      setFragments(newFrags);
      return;
    }

    // Normal progression: update roles, mark outgoing as dissolving, add incoming
    setFragments((prev) => {
      const updated = [];
      const existingIndices = new Set();

      // 1. Process existing fragments
      for (const frag of prev) {
        if (frag.status === 'dissolving' || frag.status === 'exiting') {
          // Keep dissolving fragment until its timer completes
          updated.push(frag);
          continue;
        }

        if (targetSet.has(frag.lineIndex)) {
          // Still in active window
          const offset = frag.lineIndex - activeLineIndex;
          let role = 'distant';
          if (offset === 0) role = 'active';
          else if (offset === -1) role = 'past';
          else if (offset === 1) role = 'upcoming';

          let placement = frag.placement;
          let style = frag.style;

          // If promoted to active, verify complete-line readability & cover clearance
          if (role === 'active') {
            const exclusions = getStageExclusionZones(DEFAULT_STAGE_BOUNDS);
            const collidesCover = checkRectCollision(placement, exclusions.cover, 2);
            const collidesMeta = checkRectCollision(placement, exclusions.metadata, 4);
            const collidesAbove = placement.zoneId === 'above' && (placement.y + placement.height > exclusions.cover.y - 2);

            if (collidesCover || collidesMeta || collidesAbove || frag.role !== 'active') {
              // Re-evaluate placement with strict active priority & zero cover occlusion
              placement = solveAdaptivePlacement(frag.line, 'active', updated, {
                stageBounds: DEFAULT_STAGE_BOUNDS,
                trackSeed: seed,
              });
              style = createPlacementStyle(placement);
            }
          }

          updated.push({
            ...frag,
            role,
            placement,
            style,
            status: 'settled',
          });
          existingIndices.add(frag.lineIndex);
        } else {
          // Exiting the active window: start gentle background dissolve
          const dissolvingFrag = {
            ...frag,
            status: 'dissolving',
          };
          updated.push(dissolvingFrag);

          // Clear any existing timer for this line
          if (exitTimersRef.current.has(frag.lineIndex)) {
            clearTimeout(exitTimersRef.current.get(frag.lineIndex));
          }

          // Schedule complete unmount after 520ms transition completes
          const timer = setTimeout(() => {
            exitTimersRef.current.delete(frag.lineIndex);
            setFragments((current) => current.filter((f) => f.lineIndex !== frag.lineIndex));
          }, 520);

          exitTimersRef.current.set(frag.lineIndex, timer);
        }
      }

      // 2. Active Lyric Collision Eviction: Active line has 100% priority over supporting fragments
      const activeFrag = updated.find((f) => f.role === 'active' && f.status !== 'dissolving' && f.status !== 'exiting');
      const survivorFrags = [];

      for (const f of updated) {
        if (!activeFrag || f.lineIndex === activeFrag.lineIndex || f.role === 'active') {
          survivorFrags.push(f);
        } else if (!checkRectCollision(activeFrag.placement, f.placement, 8)) {
          survivorFrags.push(f);
        } else {
          // Evict colliding supporting fragment to guarantee 100% active line readability
          if (exitTimersRef.current.has(f.lineIndex)) {
            clearTimeout(exitTimersRef.current.get(f.lineIndex));
            exitTimersRef.current.delete(f.lineIndex);
          }
        }
      }

      // 3. Add incoming fragments with adaptive content-aware placement
      activeTargetIndices.forEach((idx) => {
        if (!existingIndices.has(idx)) {
          const offset = idx - activeLineIndex;
          let role = 'distant';
          if (offset === 0) role = 'active';
          else if (offset === -1) role = 'past';
          else if (offset === 1) role = 'upcoming';

          const placement = solveAdaptivePlacement(lines[idx], role, survivorFrags, {
            stageBounds: DEFAULT_STAGE_BOUNDS,
            previousZoneId: lastPlacedZoneIdRef.current,
            trackSeed: seed,
          });

          // Skip adding supporting fragment if no clear collision-free zone exists (score < 0)
          if (role !== 'active' && placement.score != null && placement.score < 0) {
            return;
          }

          lastPlacedZoneIdRef.current = placement.zoneId;

          survivorFrags.push({
            lineIndex: idx,
            line: lines[idx],
            displayText: placement.displayText,
            role,
            placement,
            style: createPlacementStyle(placement),
            status: 'emerging',
          });
        }
      });

      return survivorFrags;
    });
  }, [activeLineIndex, lines, showLyrics, isSynced, hasLyrics, seed]);

  return (
    <div
      className={`floating-stage${!showLyrics ? ' is-lyrics-hidden' : ''}`}
      role="region"
      aria-label="Floating lyrics stage"
    >
      {/* Dev-Only Debug Overlay */}
      {isDebugActive && (
        <FloatingLyricsDebugOverlay fragments={fragments} stageBounds={DEFAULT_STAGE_BOUNDS} />
      )}

      {/* Layer 1: Floating Typography (z-index: 2, behind artwork) */}
      <div className="floating-stage__lyrics-layer" aria-live="polite">
        {showLyrics && isSynced && fragments.length > 0 && (
          fragments.map((frag) => {
            const { lineIndex, line, displayText, role, style, status } = frag;
            const isExiting = status === 'dissolving' || status === 'exiting';
            const isActive = role === 'active' && !isExiting;
            const pres = lyricsPresentation[lineIndex] || { style: lyricsStyle };

            let roleClass = 'floating-lyric';
            if (isExiting) {
              roleClass += ' floating-lyric--dissolving';
            } else if (status === 'emerging') {
              roleClass += ' floating-lyric--emerging';
            } else {
              roleClass += ' floating-lyric--settled';
            }

            if (!isExiting) {
              if (isActive) {
                roleClass += ' floating-lyric--active';
              } else if (role === 'past') {
                roleClass += ' floating-lyric--past';
              } else if (role === 'upcoming') {
                roleClass += ' floating-lyric--future';
              } else {
                roleClass += ' floating-lyric--distant';
              }
            }

            return (
              <div
                key={`frag-${lineIndex}`}
                className={roleClass}
                style={{
                  ...style,
                  cursor: isSynced && line?.startTimeMs != null ? 'pointer' : 'default',
                }}
                onClick={() => {
                  if (isSynced && line?.startTimeMs != null && onSeek) {
                    onSeek(line.startTimeMs / 1000);
                  }
                }}
                title={isSynced ? 'Jump to this lyric' : undefined}
                role={isActive ? 'text' : undefined}
                aria-current={isActive ? 'true' : undefined}
              >
                {isActive && pres?.style === 'kinetic' && pres?.kineticEffect && pres?.targetWord ? (
                  (() => {
                    const raw = displayText;
                    const start = pres.startIndex != null ? pres.startIndex : raw.indexOf(pres.targetWord);
                    const end = pres.endIndex != null ? pres.endIndex : (start >= 0 ? start + pres.targetWord.length : -1);
                    if (start >= 0 && end > start) {
                      const before = raw.slice(0, start);
                      const target = raw.slice(start, end);
                      const after = raw.slice(end);
                      return (
                        <>
                          {before}
                          <span className={`k-fx-${pres.kineticEffect}`}>{target}</span>
                          {after}
                        </>
                      );
                    }
                    return raw;
                  })()
                ) : (
                  displayText
                )}
              </div>
            );
          })
        )}

        {/* Graceful fallback for unsynced lyrics */}
        {showLyrics && !isSynced && hasLyrics && (
          <div className="floating-stage__unsynced-wrap">
            <div className="floating-stage__unsynced-notice">
              <span>Plain lyrics available — switch to Normal layout for full scroll</span>
            </div>
            <div className="floating-stage__unsynced-excerpt">
              {lines.slice(0, 3).map((l, i) => (
                <div key={i} className="floating-stage__unsynced-line">{formatLyricExcerpt(l.text, 36)}</div>
              ))}
            </div>
          </div>
        )}

        {/* Empty lyrics state */}
        {showLyrics && !hasLyrics && (
          <div className="floating-stage__empty-notice">
            <span>No lyrics available for this track</span>
          </div>
        )}
      </div>

      {/* Layer 2: Centered Artwork in Foreground (z-index: 5, stable 148px geometry) */}
      <div className="floating-stage__artwork-layer">
        {centerArtwork}
      </div>

      {/* Layer 3: Track Metadata directly beneath cover (z-index: 6, stable center) */}
      <div className="floating-stage__meta-layer">
        {trackMeta}
      </div>
    </div>
  );
}
