/**
 * phonetic-transliteration.js: Lightweight phonetic & Hindi-English transliteration matcher.
 *
 * Requirements (PASS 2.2.6.2):
 * 1. Resilient matching for Whisper phonetic transcriptions of multilingual & Hindi titles (e.g. "two" / "too" -> "Tuu").
 * 2. Zero hardcoded song titles or special-case voice rules.
 * 3. Low-overhead execution optimized for Ryzen 3 7320U & 8GB RAM laptops (pure string ops, no neural networks).
 * 4. General transliteration equivalence:
 *    - Homophones & English number words: two/too/to/2 -> tu, won/one/1 -> wan, four/for/4 -> for, etc.
 *    - Hindi vowel digraphs: oo/uu/u -> u, ee/ii/i -> i, aa/a -> a, ai/ei -> ay, au/ou -> o.
 *    - Hindi consonant digraphs: bh->b, dh->d, th->t, kh->k, gh->g, ph->f, sh->s, jh->j, ch->c.
 *    - Transliteration interchanges: w <-> v, q/c -> k, z -> j/s.
 *    - Consonant geminates: tt->t, ll->l, mm->m, etc.
 */

// Common spoken English homophones / number words that Whisper transcribes for phonetically identical non-English words
const HOMOPHONE_MAP = new Map([
  ['two', 'tu'],
  ['too', 'tu'],
  ['to', 'tu'],
  ['2', 'tu'],
  ['won', 'wan'],
  ['one', 'wan'],
  ['1', 'wan'],
  ['four', 'for'],
  ['fore', 'for'],
  ['4', 'for'],
  ['eight', 'et'],
  ['ate', 'et'],
  ['8', 'et'],
  ['night', 'nait'],
  ['knight', 'nait'],
  ['die', 'dai'],
  ['dye', 'dai'],
  ['you', 'yu'],
  ['u', 'yu'],
]);

/**
 * Generate a phonetic transliteration fingerprint for a single word or token.
 */
export function getWordPhoneticFingerprint(word) {
  if (!word || typeof word !== 'string') return '';

  let w = word.toLowerCase().trim();
  // Strip non-alphanumeric
  w = w.replace(/[^a-z0-9]/g, '');
  if (!w) return '';

  // 1. Homophone & number substitution
  if (HOMOPHONE_MAP.has(w)) {
    w = HOMOPHONE_MAP.get(w);
  }

  // 2. Hindi-English consonant digraph reduction
  w = w
    .replace(/ph/g, 'f')
    .replace(/bh/g, 'b')
    .replace(/dh/g, 'd')
    .replace(/th/g, 't')
    .replace(/kh/g, 'k')
    .replace(/gh/g, 'g')
    .replace(/jh/g, 'j')
    .replace(/sh/g, 's')
    .replace(/ch/g, 'c');

  // 3. Interchangeable consonants in Indian English / Hindi transliteration
  w = w
    .replace(/w/g, 'v')
    .replace(/q/g, 'k')
    .replace(/x/g, 'ks')
    .replace(/c(?!h)/g, 'k');

  // 4. Vowel digraph & lengthening reduction
  w = w
    .replace(/oo+/g, 'u')
    .replace(/uu+/g, 'u')
    .replace(/ee+/g, 'i')
    .replace(/ii+/g, 'i')
    .replace(/aa+/g, 'a')
    .replace(/ai+/g, 'ay')
    .replace(/ei+/g, 'ay')
    .replace(/ou+/g, 'o')
    .replace(/au+/g, 'o');

  // 5. Consonant geminate reduction (e.g. "rabba" -> "raba", "tuu" -> "tu")
  w = w.replace(/([b-df-hj-np-tv-z])\1+/g, '$1');

  // 6. Trailing silent 'h' or 'a' in transliteration
  w = w.replace(/h$/g, '');

  return w;
}

/**
 * Generate a full phrase phonetic fingerprint by fingerprinting each token.
 */
export function getPhrasePhoneticFingerprint(text) {
  if (!text || typeof text !== 'string') return '';
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  return tokens.map(getWordPhoneticFingerprint).filter(Boolean).join(' ');
}

/**
 * Levenshtein distance between two short strings.
 */
export function levenshteinDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = i;
    for (let j = 1; j <= b.length; j++) {
      const val = a[i - 1] === b[j - 1] ? row[j - 1] : Math.min(row[j - 1], row[j], prev) + 1;
      row[j - 1] = prev;
      prev = val;
    }
    row[b.length] = prev;
  }
  return row[b.length];
}

/**
 * Calculate phonetic similarity (0.0 to 1.0) between query text and target title.
 */
export function calculatePhoneticSimilarity(queryText, targetTitle) {
  if (!queryText || !targetTitle) return 0;

  const fpQuery = getPhrasePhoneticFingerprint(queryText);
  const fpTarget = getPhrasePhoneticFingerprint(targetTitle);

  if (!fpQuery || !fpTarget) return 0;

  // Exact fingerprint match
  if (fpQuery === fpTarget) {
    return 1.0;
  }

  // Token containment (e.g. query is a word inside target title or vice versa)
  if (fpQuery.length >= 3 && fpTarget.includes(fpQuery)) {
    return 0.90;
  }
  if (fpTarget.length >= 3 && fpQuery.includes(fpTarget)) {
    return 0.88;
  }

  // Levenshtein on fingerprints
  const maxLen = Math.max(fpQuery.length, fpTarget.length);
  if (maxLen === 0) return 0;

  const dist = levenshteinDistance(fpQuery, fpTarget);
  const sim = Math.max(0, 1 - dist / maxLen);

  return Math.round(sim * 100) / 100;
}
