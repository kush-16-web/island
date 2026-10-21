/**
 * Pure calculation of horizontal scroll offset driven strictly by playback timestamp.
 * 
 * Supports both:
 * 1. Word-level timestamps (Enhanced LRC / ELRC) - tracks each sung word, holding during vocal pauses.
 * 2. Line-level timestamps (Standard LRC fallback) - distributes motion across line duration
 *    with organic smooth Hermite easing, avoiding linear corner kicks.
 * 
 * @param {number} currentMs - Current song playback timestamp in milliseconds
 * @param {object} line - Lyric line object { timeMs, endMs, words, text }
 * @param {number} maxScroll - Maximum horizontal overflow scroll distance in pixels
 * @param {object} [options] - Optional settings { subpixel: boolean }
 * @returns {number} Target scroll offset in pixels [0, maxScroll]
 */
export function calculateLyricScrollOffset(currentMs, line, maxScroll, options = {}) {
  if (!maxScroll || maxScroll <= 0 || !line) return 0;
  if (typeof line.timeMs !== 'number' || isNaN(line.timeMs)) return 0;
  const lineStart = line.timeMs;
  if (currentMs <= lineStart) return 0;

  const subpixel = Boolean(options && options.subpixel);

  // Case A: Word-level timestamps available (Enhanced LRC / ELRC)
  if (Array.isArray(line.words) && line.words.length > 0) {
    const words = line.words;
    const firstWordStart = words[0].startMs;
    const lastWordEnd = words[words.length - 1].endMs;

    if (currentMs < firstWordStart) return 0;
    if (currentMs >= lastWordEnd) return maxScroll;

    // Calculate total character count across words for proportional visual progression
    const charLengths = words.map((w) => Math.max(1, (w.text || '').trim().length));
    const totalChars = charLengths.reduce((a, b) => a + b, 0);
    if (totalChars <= 0) return 0;

    let cumulativeChars = 0;
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      const wordLen = charLengths[i];
      const nextWord = words[i + 1];

      // Currently singing this word
      if (currentMs >= w.startMs && currentMs <= w.endMs) {
        const wordDuration = Math.max(1, w.endMs - w.startMs);
        const frac = Math.min(1, Math.max(0, (currentMs - w.startMs) / wordDuration));
        const progress = (cumulativeChars + frac * wordLen) / totalChars;
        const offset = maxScroll * progress;
        return subpixel ? Number(offset.toFixed(2)) : Math.round(offset);
      }

      cumulativeChars += wordLen;

      // In vocal pause / breath gap between words: HOLD position steadily!
      if (nextWord && currentMs > w.endMs && currentMs < nextWord.startMs) {
        const pauseProgress = cumulativeChars / totalChars;
        const offset = maxScroll * pauseProgress;
        return subpixel ? Number(offset.toFixed(2)) : Math.round(offset);
      }
    }

    return maxScroll;
  }

  // Case B: Line-level timestamps (Standard LRC fallback)
  // Distribute motion across the line duration with natural musical pacing
  const rawEnd = typeof line.endMs === 'number' && !isNaN(line.endMs) ? line.endMs : lineStart + 4000;
  const lineEnd = rawEnd > lineStart ? rawEnd : lineStart + 4000;
  const duration = Math.max(200, lineEnd - lineStart);

  // Natural pacing: comfortable lead-in pause before singing starts, and sustain hold at end
  const leadInMs = Math.min(300, Math.round(duration * 0.08));
  const tailHoldMs = Math.min(450, Math.round(duration * 0.10));
  const activeDuration = Math.max(100, duration - leadInMs - tailHoldMs);

  const elapsed = currentMs - lineStart;
  if (elapsed <= leadInMs) return 0;
  if (elapsed >= duration - tailHoldMs) return maxScroll;

  const activeElapsed = elapsed - leadInMs;
  const linearProgress = Math.min(1, Math.max(0, activeElapsed / activeDuration));

  // Smooth Hermite interpolation (smoothstep) for organic, fluid line motion without abrupt start/stop kicks
  // S(x) = x^2 * (3 - 2x)
  const progress = linearProgress * linearProgress * (3 - 2 * linearProgress);

  const offset = maxScroll * progress;
  return subpixel ? Number(offset.toFixed(2)) : Math.round(offset);
}
