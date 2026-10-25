import { useState, useEffect, useRef, useMemo } from 'react';
import { hashString } from '../lib/lyrics-style-engine';

const isReducedMotion =
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

/**
 * Exact Reference Anchors (Pass 2.2.10.2)
 *
 * Calibrated against the centered 148px album artwork:
 * - Cover width: 148px (from calc(50% - 74px) to calc(50% + 74px))
 * - Cover height: 148px (from Y = 36px to Y = 184px)
 * - Metadata directly beneath cover (from Y = 194px)
 *
 * Five loose ambient anchors with generous surrounding negative space:
 * 1. Anchor 0: Above the cover, slightly offset left
 * 2. Anchor 1: To the left, around the cover's middle
 * 3. Anchor 2: Near upper-right, partly obscured behind cover (starts at 50% + 48px, 26px inside cover right edge)
 * 4. Anchor 3: Near lower-right, also partly obscured (starts at 50% + 52px, 22px inside cover right edge)
 * 5. Anchor 4: Below-left of artwork, beside lower-left cover corner
 */
export const REFERENCE_ANCHORS = [
  // Anchor 0: Above the cover, slightly left-offset
  {
    id: 'above',
    style: {
      top: '8px',
      left: 'calc(50% - 105px)',
      maxWidth: '210px',
      textAlign: 'left',
    },
    enterDelta: { x: 0, y: -5 },
    staggerDelay: 0.10,
  },
  // Anchor 1: To the left, around cover's middle
  {
    id: 'mid-left',
    style: {
      top: '72px',
      left: '14px',
      maxWidth: '145px',
      textAlign: 'left',
    },
    enterDelta: { x: -5, y: 0 },
    staggerDelay: 0.04,
  },
  // Anchor 2: Near upper-right, partly obscured by artwork (starts 26px inside cover right edge)
  {
    id: 'upper-right-obscured',
    style: {
      top: '42px',
      left: 'calc(50% + 48px)',
      maxWidth: '180px',
      textAlign: 'left',
    },
    enterDelta: { x: 5, y: -3 },
    staggerDelay: 0.16,
  },
  // Anchor 3: Near lower-right, also partly obscured by artwork (starts 22px inside cover right edge)
  {
    id: 'lower-right-obscured',
    style: {
      top: '122px',
      left: 'calc(50% + 52px)',
      maxWidth: '175px',
      textAlign: 'left',
    },
    enterDelta: { x: 5, y: 3 },
    staggerDelay: 0.24,
  },
  // Anchor 4: Below-left of the artwork
  {
    id: 'lower-left',
    style: {
      top: '152px',
      left: '16px',
      maxWidth: '140px',
      textAlign: 'left',
    },
    enterDelta: { x: -5, y: 5 },
    staggerDelay: 0.20,
  },
];

/**
 * Natural short phrase excerpt helper.
 * Prevents paragraph blocks or huge walls of text while preserving word order and punctuation.
 */
export function formatLyricExcerpt(rawText, maxLen = 34) {
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
}) {
  const hasLyrics = lines.length > 0;

  // Track-seed subtle micro-offset variation (±2px) to keep every track organic while preserving exact anchor geometry
  const seedVariant = useMemo(() => {
    return Math.abs(hashString(seed || 'default')) % 3;
  }, [seed]);

  // Stateful fragment pool to guarantee smooth lifecycle: Enter -> Settle -> Active -> Dim -> Fade Out -> Remove
  const [fragments, setFragments] = useState([]);
  const lastActiveIndexRef = useRef(activeLineIndex);
  const lastSeedRef = useRef(seed);
  const exitTimersRef = useRef(new Map());

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
    const targetIndices = new Set();

    for (let i = minIdx; i <= maxIdx; i++) {
      const text = (lines[i]?.text || '').trim();
      if (text && text !== '♪' && text !== '---') {
        targetIndices.add(i);
      }
    }

    // On major seek or track change, instantly rebuild without lingering old phrases
    if (isSeekOrTrackChange) {
      exitTimersRef.current.forEach((t) => clearTimeout(t));
      exitTimersRef.current.clear();

      const newFrags = [];
      targetIndices.forEach((idx) => {
        const offset = idx - activeLineIndex;
        let role = 'distant';
        if (offset === 0) role = 'active';
        else if (offset === -1) role = 'past';
        else if (offset === 1) role = 'upcoming';

        const anchorIdx = idx % REFERENCE_ANCHORS.length;
        const baseAnchor = REFERENCE_ANCHORS[anchorIdx];

        const microX = seedVariant === 1 ? (anchorIdx % 2 === 0 ? 2 : -2) : (seedVariant === 2 ? -2 : 0);
        const microY = seedVariant === 2 ? (anchorIdx % 2 === 1 ? 2 : -1) : 0;

        newFrags.push({
          lineIndex: idx,
          line: lines[idx],
          displayText: formatLyricExcerpt(lines[idx].text, 36),
          role,
          anchorId: baseAnchor.id,
          style: {
            ...baseAnchor.style,
            transform: `translate(${microX}px, ${microY}px)`,
          },
          staggerDelay: baseAnchor.staggerDelay,
          status: 'settled',
        });
      });

      setFragments(newFrags);
      return;
    }

    // Normal progression: update roles, mark outgoing as exiting, add incoming
    setFragments((prev) => {
      const updated = [];
      const existingIndices = new Set();

      // Process existing fragments
      for (const frag of prev) {
        if (frag.status === 'exiting') {
          // Keep existing exiting fragment until its timer completes
          updated.push(frag);
          continue;
        }

        if (targetIndices.has(frag.lineIndex)) {
          // Still in active window: update role smoothly without remounting or shifting coordinates
          const offset = frag.lineIndex - activeLineIndex;
          let role = 'distant';
          if (offset === 0) role = 'active';
          else if (offset === -1) role = 'past';
          else if (offset === 1) role = 'upcoming';

          updated.push({
            ...frag,
            role,
            status: 'settled',
          });
          existingIndices.add(frag.lineIndex);
        } else {
          // Exiting the active window: start gentle fade out
          const exitingFrag = {
            ...frag,
            status: 'exiting',
          };
          updated.push(exitingFrag);

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

      // Add new incoming fragments
      targetIndices.forEach((idx) => {
        if (!existingIndices.has(idx)) {
          const offset = idx - activeLineIndex;
          let role = 'distant';
          if (offset === 0) role = 'active';
          else if (offset === -1) role = 'past';
          else if (offset === 1) role = 'upcoming';

          const anchorIdx = idx % REFERENCE_ANCHORS.length;
          const baseAnchor = REFERENCE_ANCHORS[anchorIdx];

          const microX = seedVariant === 1 ? (anchorIdx % 2 === 0 ? 2 : -2) : (seedVariant === 2 ? -2 : 0);
          const microY = seedVariant === 2 ? (anchorIdx % 2 === 1 ? 2 : -1) : 0;

          updated.push({
            lineIndex: idx,
            line: lines[idx],
            displayText: formatLyricExcerpt(lines[idx].text, 36),
            role,
            anchorId: baseAnchor.id,
            style: {
              ...baseAnchor.style,
              transform: `translate(${microX}px, ${microY}px)`,
            },
            staggerDelay: baseAnchor.staggerDelay,
            status: 'entering',
          });
        }
      });

      return updated;
    });
  }, [activeLineIndex, lines, showLyrics, isSynced, hasLyrics, seed, seedVariant]);

  return (
    <div
      className={`floating-stage${!showLyrics ? ' is-lyrics-hidden' : ''}`}
      role="region"
      aria-label="Floating lyrics stage"
    >
      {/* Layer 1: Floating Typography (z-index: 2, behind artwork) */}
      <div className="floating-stage__lyrics-layer" aria-live="polite">
        {showLyrics && isSynced && fragments.length > 0 && (
          fragments.map((frag) => {
            const { lineIndex, line, displayText, role, style, staggerDelay, status } = frag;
            const isActive = role === 'active' && status !== 'exiting';
            const pres = lyricsPresentation[lineIndex] || { style: lyricsStyle };

            let roleClass = 'floating-lyric';
            if (status === 'exiting') {
              roleClass += ' floating-lyric--exiting';
            } else if (isActive) {
              roleClass += ' floating-lyric--active';
            } else if (role === 'past') {
              roleClass += ' floating-lyric--past';
            } else if (role === 'upcoming') {
              roleClass += ' floating-lyric--future';
            } else {
              roleClass += ' floating-lyric--distant';
            }

            const animStyle = isReducedMotion || status !== 'entering'
              ? {
                  animation: 'none',
                }
              : {
                  animationDelay: `${staggerDelay}s`,
                };

            return (
              <div
                key={`frag-${lineIndex}`}
                className={roleClass}
                style={{
                  ...style,
                  ...animStyle,
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
