import { useEffect, useMemo, useRef, useState } from 'react';
import { getCompositionForSong } from '../lib/song-art';

// Session-level completed artwork cache keyed by track identity
const completedArtworkCache = new Set();

/**
 * SongArtPoster: Living Canvas Progressive Fine-Art Generator.
 * Implements real artwork lifecycle (preparing -> sketch -> structure -> metaphor -> accent -> revealed).
 * Strokes reveal progressively via path length masks, with an active stylus tip laying down ink.
 * Completed strokes remain permanently on canvas.
 */
export default function SongArtPoster({ media, accentColor }) {
  const title = media?.title || 'Unknown Track';
  const artist = media?.artist || 'Unknown Artist';
  const trackKey = `${title}__${artist}`.toLowerCase().trim();

  const composition = useMemo(() => {
    return getCompositionForSong(title, artist);
  }, [title, artist]);

  const cp = composition.color_palette;
  const effectiveAccent = accentColor || cp.accent_color;

  // Check if track was already drawn in this session
  const alreadyCompleted = completedArtworkCache.has(trackKey);

  // Drawing progress (0.00 to 1.00)
  const [progress, setProgress] = useState(alreadyCompleted ? 1 : 0);
  const [stylusPos, setStylusPos] = useState(null);
  const [activeLayerIndex, setActiveLayerIndex] = useState(alreadyCompleted ? 3 : 0);

  const svgRef = useRef(null);
  const animFrameRef = useRef(null);
  const startTimeRef = useRef(null);

  // Check user motion preference
  const prefersReducedMotion = typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

  // Run the progressive drawing animation loop
  useEffect(() => {
    if (alreadyCompleted || prefersReducedMotion) {
      setProgress(1);
      setActiveLayerIndex(3);
      setStylusPos(null);
      return undefined;
    }

    setProgress(0);
    setActiveLayerIndex(0);
    setStylusPos(null);
    startTimeRef.current = null;

    const DRAW_DURATION_MS = 4600; // Total progressive drawing duration

    const tick = (now) => {
      if (!startTimeRef.current) startTimeRef.current = now;
      const elapsed = now - startTimeRef.current;
      const rawProgress = Math.min(1, elapsed / DRAW_DURATION_MS);

      // Smooth cubic easing for natural hand-drawing cadence
      const eased = rawProgress < 0.5
        ? 2 * rawProgress * rawProgress
        : 1 - Math.pow(-2 * rawProgress + 2, 2) / 2;

      setProgress(eased);

      // Determine active layer phase
      let currentLayerIdx = 0;
      let localLayerProgress = 0;

      if (eased < 0.25) {
        currentLayerIdx = 0; // Foundation (0.00 - 0.25)
        localLayerProgress = eased / 0.25;
      } else if (eased < 0.55) {
        currentLayerIdx = 1; // Structure (0.25 - 0.55)
        localLayerProgress = (eased - 0.25) / 0.30;
      } else if (eased < 0.85) {
        currentLayerIdx = 2; // Metaphor (0.55 - 0.85)
        localLayerProgress = (eased - 0.55) / 0.30;
      } else {
        currentLayerIdx = 3; // Accent (0.85 - 1.00)
        localLayerProgress = (eased - 0.85) / 0.15;
      }

      setActiveLayerIndex(currentLayerIdx);

      // Update stylus tip position based on active SVG path
      if (svgRef.current && eased < 0.98) {
        const activePathEl = svgRef.current.querySelector(`.song-art-layer-${currentLayerIdx} path`);
        if (activePathEl) {
          try {
            const totalLen = activePathEl.getTotalLength();
            if (totalLen > 0) {
              const pt = activePathEl.getPointAtLength(Math.min(totalLen, totalLen * localLayerProgress));
              setStylusPos({ x: pt.x, y: pt.y });
            }
          } catch {}
        }
      } else {
        setStylusPos(null);
      }

      if (rawProgress < 1) {
        animFrameRef.current = requestAnimationFrame(tick);
      } else {
        completedArtworkCache.add(trackKey);
        setStylusPos(null);
      }
    };

    animFrameRef.current = requestAnimationFrame(tick);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [trackKey, alreadyCompleted, prefersReducedMotion]);

  const handleReplay = (e) => {
    e.stopPropagation();
    completedArtworkCache.delete(trackKey);
    setProgress(0);
    setActiveLayerIndex(0);
    setStylusPos(null);
    startTimeRef.current = null;
  };

  // Color helper based on layer token
  const resolveLayerColor = (strokeKey) => {
    if (strokeKey === 'accent') return effectiveAccent;
    if (strokeKey === 'secondary') return cp.secondary_accent || effectiveAccent;
    return cp.line_color;
  };

  // Progress threshold helper for each of the 4 layers
  // Layer 0 (foundation): 0.00 to 0.25
  // Layer 1 (structure):  0.25 to 0.55
  // Layer 2 (metaphor):   0.55 to 0.85
  // Layer 3 (accent):     0.85 to 1.00
  const getLayerProgress = (layerIdx) => {
    if (layerIdx === 0) return Math.min(1, Math.max(0, progress / 0.25));
    if (layerIdx === 1) return Math.min(1, Math.max(0, (progress - 0.25) / 0.30));
    if (layerIdx === 2) return Math.min(1, Math.max(0, (progress - 0.55) / 0.30));
    return Math.min(1, Math.max(0, (progress - 0.85) / 0.15));
  };

  const isFinished = progress >= 0.99;

  return (
    <div
      className={`song-art-stage${isFinished ? ' is-finished' : ' is-drawing'}`}
      style={{
        '--art-bg': cp.background,
        '--art-line': cp.line_color,
        '--art-accent': effectiveAccent,
        '--art-secondary': cp.secondary_accent || effectiveAccent,
      }}
    >
      {/* 1. Dynamic Album Cover Ambient Aura Layer */}
      {media?.art ? (
        <div
          className="song-art__bg-cover"
          style={{ backgroundImage: `url("${media.art}")` }}
        />
      ) : null}

      {/* 2. Procedural Radial Aura Overlay */}
      <div className="song-art__aura" />

      {/* 3. Immersive Top Bar: Strategy title & color palette swatches */}
      <div className="song-art__header">
        <div className="song-art__badge">
          <span className="song-art__sparkle">✦</span>
          <span>{composition.strategyName}</span>
        </div>
        <div className="song-art__palette">
          <span className="song-art__dot" style={{ background: cp.line_color }} title="Line Color" />
          <span className="song-art__dot" style={{ background: effectiveAccent }} title="Accent Color" />
          {cp.secondary_accent && (
            <span className="song-art__dot" style={{ background: cp.secondary_accent }} title="Secondary Color" />
          )}
        </div>
      </div>

      {/* 4. Progressive Multi-Layered Vector Canvas */}
      <div className="song-art__canvas-wrapper">
        <svg
          ref={svgRef}
          viewBox="0 0 900 440"
          className="song-art__svg"
          preserveAspectRatio="xMidYMid meet"
          aria-label={composition.central_metaphor}
        >
          <defs>
            <filter id="art-stylus-glow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
            <filter id="art-layer-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Render each of the 4 progressive composition layers */}
          {composition.layers.map((layer, lIdx) => {
            const layerProg = getLayerProgress(lIdx);
            if (layerProg <= 0) return null; // Layer not yet reached in sequence

            const strokeColor = resolveLayerColor(layer.stroke);
            const isFullyDrawn = layerProg >= 1;

            return (
              <g
                key={layer.id}
                className={`song-art-layer song-art-layer-${lIdx}${isFullyDrawn ? ' is-completed' : ' is-active'}`}
                opacity={layer.opacity || 1}
              >
                {layer.paths.map((d, pIdx) => (
                  <path
                    key={pIdx}
                    d={d}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth={layer.strokeWidth || 2.2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    pathLength={1000}
                    strokeDasharray={1000}
                    strokeDashoffset={isFullyDrawn ? 0 : Math.round(1000 * (1 - layerProg))}
                    style={{
                      transition: prefersReducedMotion ? 'none' : 'stroke-dashoffset 0.05s linear',
                    }}
                  />
                ))}

                {/* Permanent focal nodes revealed once this layer completes */}
                {layer.nodes && layerProg >= 0.85 && (
                  <g className="song-art-layer-nodes">
                    {layer.nodes.map((node, nIdx) => (
                      <circle
                        key={nIdx}
                        cx={node.x}
                        cy={node.y}
                        r={node.r || 4}
                        fill={strokeColor}
                        className="song-art__permanent-node"
                      />
                    ))}
                  </g>
                )}
              </g>
            );
          })}

          {/* Active Drawing Stylus: Real-time pen tip following active stroke */}
          {stylusPos && (
            <g
              className="song-art__stylus"
              transform={`translate(${stylusPos.x}, ${stylusPos.y})`}
              filter="url(#art-stylus-glow)"
            >
              <circle r="7" fill={effectiveAccent} opacity="0.4" />
              <circle r="3.5" fill="#ffffff" />
            </g>
          )}
        </svg>
      </div>

      {/* 5. Subtitle & Source Info Row (Unobtrusive & Honest) */}
      <div className="song-art__footer">
        <div className="song-art__metaphor">
          &ldquo;{composition.central_metaphor}&rdquo;
        </div>
        <div className="song-art__meta-row">
          <span className="song-art__theme">{composition.emotional_theme}</span>

          <div className="song-art__footer-right">
            {/* Honest preview status indicator */}
            <span
              className="song-art__source-tag"
              title="Procedural vector composition generated locally (ComfyUI offline)"
            >
              ✦ Procedural Preview
            </span>

            {isFinished && (
              <button
                type="button"
                className="song-art__replay-btn"
                onClick={handleReplay}
                title="Replay artwork drawing sequence"
              >
                Replay
              </button>
            )}

            <div className="song-art__symbols">
              {(composition.supporting_symbols || []).slice(0, 3).map((sym, idx) => (
                <span key={idx} className="song-art__symbol-chip">
                  {sym}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
