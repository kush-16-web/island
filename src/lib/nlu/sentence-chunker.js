/**
 * sentence-chunker.js: Natural sentence boundary tokenizer for speech synthesis pipelining.
 * PASS 2.2.8.1
 *
 * Splits spoken dialogue into 1 to 3 speech-friendly chunks:
 * - Chunk 1 synthesizes immediately to achieve sub-second first-audio response time.
 * - Remaining chunks synthesize concurrently while Chunk 1 is audibly playing.
 * - Preserves abbreviations (Dr., e.g., i.e., vs., AM, PM), decimals, and natural prosody.
 */

const COMMON_ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr',
  'eg', 'ie', 'vs', 'etc', 'approx', 'est',
  'am', 'pm', 'jan', 'feb', 'mar', 'apr', 'aug', 'sept', 'oct', 'nov', 'dec',
]);

/**
 * Split clean spoken text into 1 to 3 natural sentence chunks for audio pipelining.
 *
 * @param {string} text - Clean spoken text (pre-normalized)
 * @param {object} options
 * @param {number} [options.maxChunks=3] - Maximum number of chunks (default 3)
 * @param {number} [options.minChunkLength=25] - Minimum character length for an independent chunk
 * @returns {Array<string>} Array of 1 to 3 sentence strings
 */
export function splitIntoSpeechSentences(text, options = {}) {
  if (!text || typeof text !== 'string') return [];
  const clean = text.trim();
  if (!clean) return [];

  const maxChunks = options.maxChunks || 3;
  const minChunkLength = options.minChunkLength || 25;

  // If text is already very short, keep it as a single chunk
  if (clean.length < 80) {
    return [clean];
  }

  // Tokenize using regex looking for sentence terminals followed by space and uppercase
  // or end of string, while protecting decimals and abbreviations
  const rawSegments = [];
  let currentStart = 0;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];

    if (ch === '.' || ch === '!' || ch === '?' || ch === '\n') {
      // Check if this is a decimal number (e.g. 3.5)
      if (ch === '.' && i > 0 && i < clean.length - 1 && /\d/.test(clean[i - 1]) && /\d/.test(clean[i + 1])) {
        continue;
      }

      // Check for common abbreviations preceding the period
      if (ch === '.' && i > 1) {
        const precedingSlice = clean.slice(Math.max(0, i - 10), i);
        const lastWordMatch = precedingSlice.match(/([a-zA-Z]+)$/);
        if (lastWordMatch) {
          const word = lastWordMatch[1].toLowerCase();
          if (COMMON_ABBREVIATIONS.has(word)) {
            continue;
          }
        }
      }

      // Check next character: must be space followed by uppercase or number, or newline, or end
      const nextChar = clean[i + 1];
      const charAfterSpace = clean[i + 2];

      const isTerminal =
        i === clean.length - 1 ||
        ch === '\n' ||
        (nextChar === ' ' && (!charAfterSpace || /[A-Z0-9"']/.test(charAfterSpace)));

      if (isTerminal) {
        const segment = clean.slice(currentStart, i + 1).trim();
        if (segment) {
          rawSegments.push(segment);
        }
        currentStart = i + 1;
        // Skip subsequent spaces
        while (currentStart < clean.length && clean[currentStart] === ' ') {
          currentStart++;
        }
        i = currentStart - 1;
      }
    }
  }

  // Add trailing segment if any
  if (currentStart < clean.length) {
    const remaining = clean.slice(currentStart).trim();
    if (remaining) {
      rawSegments.push(remaining);
    }
  }

  if (rawSegments.length <= 1) {
    return [clean];
  }

  // Merge micro-segments (< minChunkLength) into neighboring segments
  const merged = [];
  for (let s of rawSegments) {
    if (merged.length > 0 && (s.length < minChunkLength || merged[merged.length - 1].length < minChunkLength)) {
      merged[merged.length - 1] += ' ' + s;
    } else {
      merged.push(s);
    }
  }

  // Cap at maxChunks: if there are more than maxChunks, combine the tail into the last chunk
  if (merged.length > maxChunks) {
    const head = merged.slice(0, maxChunks - 1);
    const tail = merged.slice(maxChunks - 1).join(' ');
    head.push(tail);
    return head;
  }

  return merged.length > 0 ? merged : [clean];
}
