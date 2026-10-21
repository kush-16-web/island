import { useMemo } from 'react';
import { interpretSongForArt } from '../lib/song-art';

/**
 * SongArtPoster: Living Canvas Editorial Fine-Art Continuous-Line Poster.
 * Visualizes the song's interpreted emotional core, visual metaphor, and single-stroke ink path.
 */
export default function SongArtPoster({ media, accentColor }) {
  const title = media?.title || 'Unknown Track';
  const artist = media?.artist || 'Unknown Artist';

  const concept = useMemo(() => {
    return interpretSongForArt(title, artist);
  }, [title, artist]);

  const cp = concept.color_palette;
  const lineType = concept.line_type || 'abstract';

  // Dynamic continuous-line path variations based on musical archetype
  const getContinuousLinePath = () => {
    switch (lineType) {
      case 'romantic':
        return (
          <path
            d="M 60,340 C 140,260 180,180 260,190 C 340,200 360,310 440,270 C 520,230 500,120 590,130 C 670,140 700,240 760,200"
            fill="none"
            stroke={cp.line_color}
            strokeWidth="2.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="song-art__line"
          />
        );
      case 'melancholic':
        return (
          <path
            d="M 80,120 C 120,220 160,340 240,320 C 320,300 350,180 430,220 C 510,260 550,380 630,340 C 700,310 730,240 780,260"
            fill="none"
            stroke={cp.line_color}
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="song-art__line"
          />
        );
      case 'solar':
        return (
          <path
            d="M 70,360 C 160,340 210,260 300,280 C 390,300 420,160 510,140 C 600,120 660,220 720,160 C 760,120 780,90 820,70"
            fill="none"
            stroke={cp.line_color}
            strokeWidth="3.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="song-art__line"
          />
        );
      case 'acoustic':
        return (
          <path
            d="M 80,260 C 160,200 220,130 300,160 C 380,190 410,310 500,290 C 590,270 640,170 710,190 C 760,210 790,270 820,250"
            fill="none"
            stroke={cp.line_color}
            strokeWidth="2.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="song-art__line"
          />
        );
      default:
        return (
          <path
            d="M 60,220 C 140,140 220,320 320,250 C 420,180 480,310 580,220 C 680,130 730,290 820,210"
            fill="none"
            stroke={cp.line_color}
            strokeWidth="2.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="song-art__line"
          />
        );
    }
  };

  return (
    <div
      className="song-art-stage"
      style={{
        '--art-bg': cp.background,
        '--art-line': cp.line_color,
        '--art-accent': cp.accent_color,
        '--art-secondary': cp.secondary_accent || cp.accent_color,
      }}
    >
      {/* Background Ambient Aura */}
      <div className="song-art__aura" />

      {/* Editorial Watermark / Header */}
      <div className="song-art__header">
        <div className="song-art__badge">
          <span className="song-art__sparkle">✦</span>
          <span>LIVING CANVAS • EDITORIAL SONG ART</span>
        </div>
        <div className="song-art__palette">
          <span className="song-art__dot" style={{ background: cp.line_color }} title="Line" />
          <span className="song-art__dot" style={{ background: cp.accent_color }} title="Accent" />
          {cp.secondary_accent && (
            <span className="song-art__dot" style={{ background: cp.secondary_accent }} title="Secondary" />
          )}
        </div>
      </div>

      {/* Centerpiece: Animated Continuous Line SVG Illustration */}
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

          {/* Ambient Resonance Circles */}
          <circle
            cx="440"
            cy="230"
            r="110"
            fill="none"
            stroke={cp.accent_color}
            strokeWidth="1"
            opacity="0.18"
            strokeDasharray="4 6"
          />
          <circle
            cx="440"
            cy="230"
            r="170"
            fill="none"
            stroke={cp.line_color}
            strokeWidth="0.8"
            opacity="0.12"
          />

          {/* Glowing Shadow Line */}
          <g filter="url(#song-art-glow)" opacity="0.45">
            {getContinuousLinePath()}
          </g>

          {/* Main Continuous Single-Stroke Ink Line */}
          {getContinuousLinePath()}

          {/* Focal Nodes */}
          <circle cx="260" cy="190" r="5" fill={cp.accent_color} className="song-art__node" />
          <circle cx="440" cy="270" r="6" fill={cp.line_color} className="song-art__node" />
          <circle cx="590" cy="130" r="4" fill={cp.accent_color} className="song-art__node" />
        </svg>
      </div>

      {/* Editorial Metaphor & Info Overlay */}
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
