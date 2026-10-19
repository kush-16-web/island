import { AnimatePresence, motion } from 'framer-motion';
import { Icon } from './icons';

/**
 * MiniLyrics: Compact synchronized lyrics widget placed beside song metadata.
 * Inspired by YouTube Music's mini-player lyrics preview.
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
      <div className="mini-lyrics is-empty">
        <span className="mini-lyrics__status">No lyrics found</span>
      </div>
    );
  }

  if (lyricsData.instrumental) {
    return (
      <div className="mini-lyrics is-instrumental">
        <span className="mini-lyrics__status">♪ Instrumental ♪</span>
      </div>
    );
  }

  const lines = lyricsData.lines || [];
  const currentLine = activeLineIndex >= 0 ? lines[activeLineIndex] : lines[0];
  const prevLine = activeLineIndex > 0 ? lines[activeLineIndex - 1] : null;
  const nextLine = activeLineIndex >= 0 && activeLineIndex < lines.length - 1 ? lines[activeLineIndex + 1] : lines[1] || null;

  return (
    <div
      className="mini-lyrics"
      onClick={onClick}
      role="button"
      tabIndex={0}
      title="Click to view full lyrics"
    >
      <div className="mini-lyrics__lines">
        {prevLine && (
          <div className="mini-lyrics__line is-prev">
            {prevLine.text}
          </div>
        )}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentLine?.id || 'curr'}
            className="mini-lyrics__line is-current"
            style={{ '--lyric-accent': accentColor || 'var(--accent)' }}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22 }}
          >
            {currentLine ? currentLine.text : '...'}
          </motion.div>
        </AnimatePresence>
        {nextLine && (
          <div className="mini-lyrics__line is-next">
            {nextLine.text}
          </div>
        )}
      </div>

      <div className="mini-lyrics__expand-hint" aria-hidden="true">
        <Icon.Chevron width={12} height={12} />
      </div>
    </div>
  );
}
