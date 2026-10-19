import { motion } from 'framer-motion';
import { Icon } from './icons';
import MarqueeText from './MarqueeText';

const LINE_HEIGHT = 28; // Standard vertical line pitch in pixels
const VIEWPORT_HEIGHT = 84;

/**
 * MiniLyrics: Borderless Apple Music / YouTube Music live scrolling lyrics reel.
 * Vertically translates lines with physical spring easing, pure white active typography,
 * and top/bottom gradient alpha dissolve.
 */
export default function MiniLyrics({
  lyricsData,
  loading,
  activeLineIndex,
  accentColor,
  onClick,
}) {
  if (loading) {
    return (
      <div className="mini-lyrics is-loading" onClick={onClick} role="button" tabIndex={0}>
        <div className="mini-lyrics__shimmer" />
        <span className="mini-lyrics__status">Finding lyrics...</span>
      </div>
    );
  }

  if (!lyricsData || !lyricsData.found) {
    return (
      <div className="mini-lyrics is-empty" onClick={onClick}>
        <span className="mini-lyrics__status">No lyrics found</span>
      </div>
    );
  }

  if (lyricsData.instrumental) {
    return (
      <div className="mini-lyrics is-instrumental" onClick={onClick}>
        <span className="mini-lyrics__status">♪ Instrumental ♪</span>
      </div>
    );
  }

  const lines = lyricsData.lines || [];
  const hasActiveLine = activeLineIndex >= 0 && activeLineIndex < lines.length;
  const safeActiveIndex = hasActiveLine ? activeLineIndex : 0;

  // Center active line in the vertical viewport (or preview line 0 during intro)
  const targetY = hasActiveLine
    ? -safeActiveIndex * LINE_HEIGHT + (VIEWPORT_HEIGHT / 2 - LINE_HEIGHT / 2)
    : (VIEWPORT_HEIGHT / 2 - LINE_HEIGHT / 2);

  return (
    <div
      className="mini-lyrics"
      onClick={onClick}
      role="button"
      tabIndex={0}
      title="Click to view full lyrics"
    >
      <div className="mini-lyrics__viewport">
        <motion.div
          className="mini-lyrics__reel"
          animate={{ y: targetY }}
          transition={{ type: 'spring', stiffness: 240, damping: 26 }}
        >
          {lines.map((line, idx) => {
            const isActive = hasActiveLine && idx === activeLineIndex;
            const distance = hasActiveLine ? Math.abs(idx - activeLineIndex) : idx + 1;
            let lineClass = 'mini-lyrics__line';
            if (isActive) lineClass += ' is-active';
            else if (distance === 1) lineClass += ' is-adjacent';
            else lineClass += ' is-far';

            if (isActive) {
              return (
                <MarqueeText
                  key={line.id || idx}
                  text={line.text}
                  className={lineClass}
                  style={{ height: LINE_HEIGHT }}
                />
              );
            }

            return (
              <div
                key={line.id || idx}
                className={lineClass}
                style={{ height: LINE_HEIGHT }}
              >
                {line.text}
              </div>
            );
          })}
        </motion.div>
      </div>

      <div className="mini-lyrics__expand-hint" aria-hidden="true">
        <Icon.Chevron width={13} height={13} />
      </div>
    </div>
  );
}
