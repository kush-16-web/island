import { useMemo } from 'react';
import { generateProceduralCurve, interpretSongForArt } from '../lib/song-art';

/**
 * SongArtPoster: Living Canvas Editorial Fine-Art Continuous-Line Poster.
 * Visualizes the song's interpreted emotional core, visual metaphor, and procedurally generated single-stroke ink path.
 * Dynamically samples the current track's album cover art and accent color.
 */
export default function SongArtPoster({ media, accentColor }) {
  const title = media?.title || 'Unknown Track';
  const artist = media?.artist || 'Unknown Artist';

  const concept = useMemo(() => {
    return interpretSongForArt(title, artist);
  }, [title, artist]);

  const proceduralCurve = useMemo(() => {
    return generateProceduralCurve(title, artist);
  }, [title, artist]);

  const cp = concept.color_palette;
  const effectiveAccent = accentColor || cp.accent_color;

  return (
    <div
      className="song-art-stage"
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

      {/* 3. Editorial Watermark / Header */}
      <div className="song-art__header">
        <div className="song-art__badge">
          <span className="song-art__sparkle">✦</span>
          <span>LIVING CANVAS • EDITORIAL SONG ART</span>
        </div>
        <div className="song-art__palette">
          <span className="song-art__dot" style={{ background: cp.line_color }} title="Line" />
          <span className="song-art__dot" style={{ background: effectiveAccent }} title="Accent" />
          {cp.secondary_accent && (
            <span className="song-art__dot" style={{ background: cp.secondary_accent }} title="Secondary" />
          )}
        </div>
      </div>

      {/* 4. Centerpiece: Procedurally Generated Unique Continuous Line SVG Illustration */}
      <div className="song-art__canvas-wrapper">
        <svg
          viewBox="0 0 900 440"
          className="song-art__svg"
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
        >
          <defs>
            <filter id="song-art-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="8" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Ambient Harmonic Resonance Rings */}
          <circle
            cx="450"
            cy="220"
            r="120"
            fill="none"
            stroke={effectiveAccent}
            strokeWidth="1"
            opacity="0.22"
            strokeDasharray="4 6"
          />
          <circle
            cx="450"
            cy="220"
            r="180"
            fill="none"
            stroke={cp.line_color}
            strokeWidth="0.8"
            opacity="0.14"
          />

          {/* Glowing Shadow Line */}
          <path
            d={proceduralCurve.pathD}
            fill="none"
            stroke={effectiveAccent}
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter="url(#song-art-glow)"
            opacity="0.5"
            className="song-art__line"
          />

          {/* Main Continuous Single-Stroke Ink Line */}
          <path
            d={proceduralCurve.pathD}
            fill="none"
            stroke={cp.line_color}
            strokeWidth="2.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="song-art__line"
          />

          {/* Procedural Focal Crest Nodes */}
          {proceduralCurve.nodes.map((node, idx) => (
            <circle
              key={idx}
              cx={node.x}
              cy={node.y}
              r={node.r || 5}
              fill={idx % 2 === 0 ? effectiveAccent : cp.line_color}
              className="song-art__node"
              style={{ animationDelay: `${idx * 0.4}s` }}
            />
          ))}
        </svg>
      </div>

      {/* 5. Editorial Metaphor & Musical Identity */}
      <div className="song-art__footer">
        <div className="song-art__metaphor">
          &ldquo;{concept.central_metaphor}&rdquo;
        </div>
        <div className="song-art__meta-row">
          <span className="song-art__theme">{concept.emotional_theme}</span>
          <div className="song-art__symbols">
            {(concept.supporting_symbols || []).map((sym, idx) => (
              <span key={idx} className="song-art__symbol-chip">
                {sym}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
