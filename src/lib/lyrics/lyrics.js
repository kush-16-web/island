/**
 * LRCLIB API Client and Synchronized Lyrics Engine
 * Provides cached fetching, multi-format parsing (LRC, ELRC word-level, NetEase YRC, TTML XML),
 * strict normalization, and binary search matching for YouTube Music style playback synchronization.
 */

const USER_AGENT = 'IslandDesktop/0.1.0 (https://github.com/island)';
const API_BASE = 'https://lrclib.net/api';

// In-memory cache keyed by "track|artist"
const lyricsCache = new Map();

/**
 * Parses standard LRC timestamps: [mm:ss.xx] or [mm:ss.xxx] into milliseconds
 */
export function parseTimestamp(minStr, secStr) {
  const min = parseInt(minStr, 10) || 0;
  const sec = parseFloat(secStr) || 0;
  return Math.round((min * 60 + sec) * 1000);
}

/**
 * Parses diverse timecode representations (hh:mm:ss.xxx, mm:ss.xxx, ss.xxx, 12.34s, 12340ms) into milliseconds
 */
export function parseTimecode(str) {
  if (str == null) return 0;
  const s = String(str).trim();
  if (s.endsWith('ms')) {
    return Math.round(parseFloat(s));
  }
  if (s.endsWith('s')) {
    return Math.round(parseFloat(s) * 1000);
  }
  const parts = s.split(':');
  if (parts.length === 3) {
    const hr = parseInt(parts[0], 10) || 0;
    const min = parseInt(parts[1], 10) || 0;
    const sec = parseFloat(parts[2]) || 0;
    return Math.round((hr * 3600 + min * 60 + sec) * 1000);
  }
  if (parts.length === 2) {
    const min = parseInt(parts[0], 10) || 0;
    const sec = parseFloat(parts[1]) || 0;
    return Math.round((min * 60 + sec) * 1000);
  }
  const num = parseFloat(s);
  return isNaN(num) ? 0 : Math.round(num > 1000 ? num : num * 1000);
}

/**
 * Normalizes a list of parsed lines:
 * - Computes endTime and endMs from following lines or duration
 * - Bounds word end times and validates monotonic ordering
 * - Never invents word timestamps when missing
 */
function normalizeLyricLines(rawLines) {
  if (!Array.isArray(rawLines) || rawLines.length === 0) return [];

  // Filter and sort chronologically
  const lines = rawLines
    .filter((l) => l && (typeof l.text === 'string') && (l.text.trim().length > 0 || l.words?.length > 0))
    .sort((a, b) => (a.timeMs ?? 0) - (b.timeMs ?? 0));

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isSynced = typeof line.timeMs === 'number' && !isNaN(line.timeMs);

    if (isSynced) {
      line.startTimeMs = line.timeMs;
      line.startTime = line.timeMs / 1000;
      if (line.endMs == null || line.endMs <= line.timeMs) {
        line.endMs = i < lines.length - 1 && typeof lines[i + 1].timeMs === 'number'
          ? lines[i + 1].timeMs
          : line.timeMs + 6000;
      }
      line.endTime = line.endMs / 1000;
    } else {
      line.timeMs = null;
      line.startTimeMs = null;
      line.startTime = null;
      line.endMs = null;
      line.endTime = null;
    }

    if (line.words && Array.isArray(line.words) && line.words.length > 0) {
      let isMonotonic = true;
      let prevStart = -1;

      for (let wIdx = 0; wIdx < line.words.length; wIdx++) {
        const word = line.words[wIdx];
        if (typeof word.startMs !== 'number' || isNaN(word.startMs) || word.startMs < prevStart) {
          isMonotonic = false;
          break;
        }
        prevStart = word.startMs;

        // If explicit endMs not given, derive from next word or line end
        if (word.endMs == null || word.endMs <= word.startMs) {
          if (wIdx < line.words.length - 1 && typeof line.words[wIdx + 1].startMs === 'number') {
            word.endMs = Math.max(word.startMs + 60, line.words[wIdx + 1].startMs);
          } else {
            word.endMs = Math.max(word.startMs + 100, Math.min(line.endMs || (word.startMs + 1800), word.startMs + 1800));
          }
        }
        word.durationMs = Math.max(50, word.endMs - word.startMs);
        word.startTime = word.startMs / 1000;
        word.endTime = word.endMs / 1000;
      }

      if (isMonotonic) {
        line.syncType = 'word';
      } else {
        // Discard invalid/non-monotonic word timing; strictly fall back to line sync
        line.words = null;
        line.syncType = isSynced ? 'line' : 'unsynced';
      }
    } else {
      line.words = null;
      line.syncType = isSynced ? 'line' : 'unsynced';
    }
  }

  return lines;
}

/**
 * Parses NetEase YRC format lyrics:
 * Line tag: [startMs,durationMs]
 * Word tags: (wordStartMs,wordDurationMs,0)wordText
 */
export function parseYrc(yrcText) {
  if (!yrcText || typeof yrcText !== 'string') return [];

  const rawLines = yrcText.split(/\r?\n/);
  const parsed = [];
  const lineRegex = /^\[(\d+),(\d+)\](.*)$/;
  const wordRegex = /\((\d+),(\d+),\d+\)([^(]*)/g;

  for (let idx = 0; idx < rawLines.length; idx++) {
    const raw = rawLines[idx].trim();
    if (!raw) continue;

    const match = raw.match(lineRegex);
    if (!match) continue;

    const lineStartMs = parseInt(match[1], 10);
    const lineDurationMs = parseInt(match[2], 10);
    const lineEndMs = lineStartMs + lineDurationMs;
    const body = match[3];

    const words = [];
    let wordMatch;
    let fullText = '';
    let isMonotonic = true;
    let lastStart = -1;

    while ((wordMatch = wordRegex.exec(body)) !== null) {
      const wStart = parseInt(wordMatch[1], 10);
      const wDur = parseInt(wordMatch[2], 10);
      const wText = wordMatch[3] || '';

      if (wStart < lastStart) {
        isMonotonic = false;
      }
      lastStart = wStart;

      fullText += wText;
      if (wText.trim().length > 0) {
        words.push({
          text: wText.trim(),
          startMs: wStart,
          endMs: wStart + wDur,
          durationMs: Math.max(50, wDur),
        });
      }
    }

    const cleanText = (fullText || body.replace(/\(\d+,\d+,\d+\)/g, '')).trim();
    if (!cleanText) continue;

    parsed.push({
      id: `line-${idx}-${lineStartMs}`,
      timeMs: lineStartMs,
      endMs: lineEndMs,
      text: cleanText,
      words: isMonotonic && words.length > 0 ? words : null,
    });
  }

  return normalizeLyricLines(parsed);
}

/**
 * Parses TTML / XML timed text lyrics (Apple Music, Spotify Timed Text format):
 * <p begin="..." end="...">
 *   <span begin="..." end="...">Word</span>
 * </p>
 */
export function parseTtml(ttmlText) {
  if (!ttmlText || typeof ttmlText !== 'string') return [];

  const parsed = [];
  const pRegex = /<p\b([^>]*)>([\s\S]*?)<\/p>/gi;
  const spanRegex = /<span\b([^>]*)>([\s\S]*?)<\/span>/gi;
  const attrRegex = /(\w+)="([^"]*)"/g;

  let pMatch;
  let lineIdx = 0;

  while ((pMatch = pRegex.exec(ttmlText)) !== null) {
    const pAttrsRaw = pMatch[1];
    const pBody = pMatch[2];

    const attrs = {};
    let attrMatch;
    while ((attrMatch = attrRegex.exec(pAttrsRaw)) !== null) {
      attrs[attrMatch[1].toLowerCase()] = attrMatch[2];
    }

    const beginStr = attrs['begin'] || attrs['itunes:keyframe'] || '';
    const endStr = attrs['end'] || '';
    const lineStartMs = parseTimecode(beginStr);
    const lineEndMs = endStr ? parseTimecode(endStr) : 0;

    const words = [];
    let spanMatch;
    let fullText = '';
    let isMonotonic = true;
    let lastStart = -1;

    while ((spanMatch = spanRegex.exec(pBody)) !== null) {
      const sAttrsRaw = spanMatch[1];
      const sText = spanMatch[2].replace(/<[^>]+>/g, '').trim();

      const sAttrs = {};
      let sAttrMatch;
      while ((sAttrMatch = attrRegex.exec(sAttrsRaw)) !== null) {
        sAttrs[sAttrMatch[1].toLowerCase()] = sAttrMatch[2];
      }

      if (sAttrs['begin']) {
        const wStartMs = parseTimecode(sAttrs['begin']);
        const wEndMs = sAttrs['end'] ? parseTimecode(sAttrs['end']) : 0;
        if (wStartMs < lastStart) {
          isMonotonic = false;
        }
        lastStart = wStartMs;

        if (sText) {
          words.push({
            text: sText,
            startMs: wStartMs,
            endMs: wEndMs,
            durationMs: wEndMs > wStartMs ? wEndMs - wStartMs : 0,
          });
          fullText += (fullText ? ' ' : '') + sText;
        }
      }
    }

    const cleanText = (fullText || pBody.replace(/<[^>]+>/g, '')).trim();
    if (!cleanText) continue;

    parsed.push({
      id: `ttml-${lineIdx++}-${lineStartMs}`,
      timeMs: lineStartMs,
      endMs: lineEndMs,
      text: cleanText,
      words: isMonotonic && words.length > 0 ? words : null,
    });
  }

  return normalizeLyricLines(parsed);
}

/**
 * Parses LRC / ELRC text into structured synchronized lyric lines.
 * Supports:
 * - Line-level timestamps: [00:12.34] Lyric text
 * - Word-level timestamps (ELRC): [00:12.34] <00:12.34> Word1 <00:13.10> Word2 <00:14.20>
 * - Leading untagged words in ELRC lines
 * - Trailing explicit end timestamp tags
 */
export function parseLrc(lrcText) {
  if (!lrcText || typeof lrcText !== 'string') return [];

  // Transparently dispatch TTML or YRC if passed into parseLrc
  const trimmed = lrcText.trim();
  if (trimmed.startsWith('<tt') || trimmed.includes('<tt ') || (trimmed.includes('<p') && trimmed.includes('begin='))) {
    return parseTtml(lrcText);
  }
  if (/^\[\d+,\d+\]/m.test(trimmed)) {
    return parseYrc(lrcText);
  }

  const rawLines = lrcText.split(/\r?\n/);
  const parsed = [];
  const lineRegex = /^\[(\d{1,2}):(\d{2}(?:\.\d{1,3})?)\](.*)$/;

  for (let idx = 0; idx < rawLines.length; idx++) {
    const raw = rawLines[idx].trim();
    if (!raw) continue;

    const match = raw.match(lineRegex);
    if (!match) continue;

    const timeMs = parseTimestamp(match[1], match[2]);
    const lineBody = match[3].trim();
    if (!lineBody) continue;

    // Filter out metadata tags like [by:...], [re:...], [ve:...]
    if (/^(by|re|ve|offset|ti|ar|al):/i.test(lineBody)) {
      continue;
    }

    // Check for word-level sync tags: tokenize into tags and text segments
    const hasWordTags = /<\d{1,2}:\d{2}(?:\.\d{1,3})?>/.test(lineBody);
    let words = null;

    if (hasWordTags) {
      const tagOrTextRegex = /(?:<(\d{1,2}):(\d{2}(?:\.\d{1,3})?)>)|([^<]+)/g;
      const parsedWords = [];
      let tokenMatch;
      let currentTagMs = timeMs;
      let isMonotonic = true;
      let lastStart = -1;

      while ((tokenMatch = tagOrTextRegex.exec(lineBody)) !== null) {
        if (tokenMatch[1] != null && tokenMatch[2] != null) {
          // It's a timestamp tag <mm:ss.xx>
          const tagMs = parseTimestamp(tokenMatch[1], tokenMatch[2]);
          currentTagMs = tagMs;
          // If preceding word exists and doesn't have an explicit endMs, set it to this tagMs
          if (parsedWords.length > 0) {
            const prevWord = parsedWords[parsedWords.length - 1];
            if (!prevWord.endMs || prevWord.endMs <= prevWord.startMs) {
              prevWord.endMs = Math.max(prevWord.startMs + 50, tagMs);
              prevWord.durationMs = prevWord.endMs - prevWord.startMs;
            }
          }
        } else if (tokenMatch[3]) {
          // It's text content between or after tags
          const textSegment = tokenMatch[3].trim();
          if (textSegment) {
            // Split segment into individual words if separated by spaces
            const segWords = textSegment.split(/\s+/).filter(Boolean);
            for (let s = 0; s < segWords.length; s++) {
              const wText = segWords[s];
              const wStartMs = currentTagMs;
              if (wStartMs < lastStart) {
                isMonotonic = false;
              }
              lastStart = wStartMs;

              parsedWords.push({
                text: wText,
                startMs: wStartMs,
                endMs: 0,
                durationMs: 0,
              });
            }
          }
        }
      }

      if (isMonotonic && parsedWords.length > 0) {
        words = parsedWords;
      }
    }

    const cleanText = hasWordTags
      ? lineBody.replace(/<\d{1,2}:\d{2}(?:\.\d{1,3})?>/g, '').replace(/\s+/g, ' ').trim()
      : lineBody;

    if (!cleanText) continue;

    parsed.push({
      id: `line-${idx}-${timeMs}`,
      timeMs,
      endMs: 0,
      text: cleanText,
      words,
    });
  }

  return normalizeLyricLines(parsed);
}

/**
 * Universal lyric parser supporting LRC, ELRC, NetEase YRC, TTML XML, and plain text
 */
export function parseLyrics(text) {
  if (!text || typeof text !== 'string') return [];
  const trimmed = text.trim();

  if (trimmed.startsWith('<tt') || trimmed.includes('<tt ') || (trimmed.includes('<p') && trimmed.includes('begin='))) {
    return parseTtml(text);
  }
  if (/^\[\d+,\d+\]/m.test(trimmed)) {
    return parseYrc(text);
  }
  if (/^\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]/m.test(trimmed)) {
    return parseLrc(text);
  }

  // Plain unsynchronized lyrics
  return trimmed
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((text, idx) => ({
      id: `plain-${idx}`,
      timeMs: null,
      startTimeMs: null,
      startTime: null,
      endMs: null,
      endTime: null,
      text,
      words: null,
      syncType: 'unsynced',
    }));
}

/**
 * Cleans track title by removing extra info like "(Official Video)", "[Remastered]", etc.
 * to maximize LRCLIB match accuracy.
 */
function cleanSearchQuery(title) {
  if (!title) return '';
  return title
    .replace(/\s*[\(\[](feat|ft|official|audio|video|lyrics|remastered|deluxe|explicit|hd|4k)[^\)\]]*[\)\]]/gi, '')
    .replace(/\s*-\s*(feat|ft|official|remastered).*/gi, '')
    .trim();
}

const LRC_RED_API_BASE = 'https://lrc.red';

/**
 * Validates whether an LRC.RED search hit accurately matches the requested track
 */
function isLrcRedTrackMatch(hit, cleanTitle, cleanArtist, durationSec) {
  if (!hit || !hit.title) return false;
  const hitTitle = hit.title.toLowerCase().trim();
  const targetTitle = cleanTitle.toLowerCase().trim();

  // 1. Title match: target must be contained in hitTitle or vice versa
  if (!hitTitle.includes(targetTitle) && !targetTitle.includes(hitTitle)) {
    return false;
  }

  // 2. Reject version mismatch: if target is standard track, reject remixes/live/covers/mixed
  const isTargetSpecial = /remix|live|cover|acoustic|mixed|\(mix\)/i.test(targetTitle);
  const isHitSpecial = /remix|live|cover|acoustic|mixed|\(mix\)/i.test(hitTitle) || (hit.album && /mix/i.test(hit.album));
  if (!isTargetSpecial && isHitSpecial) {
    return false;
  }

  // 3. Artist match: verify primary artist
  if (cleanArtist && hit.artist) {
    const hitArtist = hit.artist.toLowerCase();
    const primaryTarget = cleanArtist.split(/[&,]/)[0].trim().toLowerCase();
    if (!hitArtist.includes(primaryTarget) && !primaryTarget.includes(hitArtist.split(/[&,]/)[0].trim())) {
      return false;
    }
  }

  // 4. Duration match: within 8s tolerance if durationSec is available
  if (durationSec && Number(durationSec) > 0 && hit.duration && Number(hit.duration) > 0) {
    if (Math.abs(Number(hit.duration) - Number(durationSec)) > 8) {
      return false;
    }
  }

  return true;
}

/**
 * Attempts to fetch genuine word-synced lyrics (TTML) from LRC.RED
 */
async function fetchWordSyncedLyrics({ cleanTitle, cleanArtist, durationSec }) {
  try {
    const query = cleanArtist ? `${cleanTitle} ${cleanArtist}` : cleanTitle;
    const searchUrl = `${LRC_RED_API_BASE}/search.json?q=${encodeURIComponent(query)}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4500);

    const res = await fetch(searchUrl, {
      headers: { 'User-Agent': 'IslandAI/0.1.0 (https://github.com/island-ai)' },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) return null;
    const data = await res.json();
    if (!data || !Array.isArray(data.hits) || data.hits.length === 0) return null;

    // Find first confident match
    const matchingHit = data.hits.find((h) => isLrcRedTrackMatch(h, cleanTitle, cleanArtist, durationSec));
    if (!matchingHit || !matchingHit.isrc) return null;

    // Fetch track detail to verify sync type and obtain TTML file URL
    const trackUrl = `${LRC_RED_API_BASE}/s/${matchingHit.isrc}.json`;
    const tController = new AbortController();
    const tTimeoutId = setTimeout(() => tController.abort(), 4500);

    const trackRes = await fetch(trackUrl, {
      headers: { 'User-Agent': 'IslandAI/0.1.0 (https://github.com/island-ai)' },
      signal: tController.signal,
    });
    clearTimeout(tTimeoutId);

    if (!trackRes.ok) return null;
    const trackData = await trackRes.json();

    const ttmlUrl = trackData.files?.ttml;
    if (!ttmlUrl) return null;

    const fController = new AbortController();
    const fTimeoutId = setTimeout(() => fController.abort(), 4500);

    const ttmlRes = await fetch(ttmlUrl, {
      headers: { 'User-Agent': 'IslandAI/0.1.0 (https://github.com/island-ai)' },
      signal: fController.signal,
    });
    clearTimeout(fTimeoutId);

    if (!ttmlRes.ok) return null;
    const ttmlText = await ttmlRes.text();

    const lines = parseTtml(ttmlText);
    const wordTimedLinesCount = lines.filter((l) => l.syncType === 'word' && l.words && l.words.length > 0).length;

    if (lines.length === 0 || wordTimedLinesCount === 0) {
      return null;
    }

    if (Boolean(import.meta.env?.DEV)) {
      console.log(`[LyricsSync] Word-synced TTML loaded from LRC.RED for "${matchingHit.title}" by "${matchingHit.artist}" (${wordTimedLinesCount}/${lines.length} word-timed lines)`);
    }

    return {
      found: true,
      instrumental: false,
      isSynced: true,
      hasWordSync: true,
      syncType: 'word',
      provider: 'LRC.RED',
      format: 'TTML',
      trackName: matchingHit.title,
      artistName: matchingHit.artist,
      albumName: matchingHit.album,
      duration: matchingHit.duration,
      lines,
    };
  } catch (err) {
    console.warn('[LyricsSync] LRC.RED word query error:', err);
    return null;
  }
}

/**
 * Fetches lyrics from LRC.RED (word-synced primary) with robust fallback to LRCLIB (line-synced).
 * Uses exact match and multi-tier search fallback.
 */
export async function fetchLyrics({ title, artist, album, durationSec }) {
  if (!title) return { found: false, error: 'No title provided' };

  const cacheKey = `${title.toLowerCase().trim()}|${(artist || '').toLowerCase().trim()}`;
  if (lyricsCache.has(cacheKey)) {
    return lyricsCache.get(cacheKey);
  }

  const cleanTitle = cleanSearchQuery(title);
  const cleanArtist = (artist || '').trim();

  // 1. Try word-synced primary source (LRC.RED)
  try {
    const wordSyncedResult = await fetchWordSyncedLyrics({ cleanTitle, cleanArtist, durationSec });
    if (wordSyncedResult && wordSyncedResult.hasWordSync) {
      lyricsCache.set(cacheKey, wordSyncedResult);
      return wordSyncedResult;
    }
  } catch (e) {
    // Continue to LRCLIB fallback
  }

  // 2. Fall back to LRCLIB (line-synced or word-synced YAML if available)
  try {
    // 1. Try exact match with GET /api/get
    const getUrl = new URL(`${API_BASE}/get`);
    getUrl.searchParams.set('track_name', cleanTitle || title);
    if (cleanArtist) getUrl.searchParams.set('artist_name', cleanArtist);
    if (album) getUrl.searchParams.set('album_name', album);
    if (durationSec && Number(durationSec) > 0) getUrl.searchParams.set('duration', String(Math.round(durationSec)));

    let response = await fetch(getUrl.toString(), {
      headers: { 'User-Agent': USER_AGENT },
    });

    let data = null;
    if (response.ok) {
      data = await response.json();
    } else {
      // 2. Multi-tier search fallback:
      // First try: full title + artist
      // Second try: title + primary artist
      // Third try: title only
      const primaryArtist = cleanArtist ? cleanArtist.split(/[&,]/)[0].trim() : '';
      const candidateQueries = [
        cleanArtist ? `${cleanTitle || title} ${cleanArtist}` : cleanTitle || title,
        primaryArtist && primaryArtist !== cleanArtist ? `${cleanTitle || title} ${primaryArtist}` : '',
        cleanTitle || title,
      ].filter(Boolean);

      for (const query of candidateQueries) {
        try {
          const searchUrl = new URL(`${API_BASE}/search`);
          searchUrl.searchParams.set('q', query);
          const searchRes = await fetch(searchUrl.toString(), {
            headers: { 'User-Agent': USER_AGENT },
          });
          if (searchRes.ok) {
            const searchResults = await searchRes.json();
            if (Array.isArray(searchResults) && searchResults.length > 0) {
              // Prefer result with synced lyrics over plain lyrics
              data = searchResults.find((r) => r.syncedLyrics && r.syncedLyrics.trim().length > 0) || searchResults[0];
              if (data) break;
            }
          }
        } catch {}
      }
    }

    if (!data) {
      const result = { found: false, notFound: true };
      lyricsCache.set(cacheKey, result);
      return result;
    }

    if (data.instrumental) {
      const result = {
        found: true,
        instrumental: true,
        provider: 'LRCLIB',
        format: 'Instrumental',
        trackName: data.trackName || title,
        artistName: data.artistName || artist,
        lines: [{
          id: 'inst-0',
          timeMs: 0,
          startTimeMs: 0,
          startTime: 0,
          endMs: 999999,
          endTime: 999.999,
          text: '♪ Instrumental ♪',
          words: null,
          syncType: 'line',
        }],
        hasWordSync: false,
        syncType: 'line',
      };
      lyricsCache.set(cacheKey, result);
      return result;
    }

    const hasSynced = Boolean(data.syncedLyrics && data.syncedLyrics.trim().length > 0);
    const hasPlain = Boolean(data.plainLyrics && data.plainLyrics.trim().length > 0);

    if (!hasSynced && !hasPlain) {
      const result = { found: false, notFound: true };
      lyricsCache.set(cacheKey, result);
      return result;
    }

    // Check if data.hasWordSync is true and lyricsfile contains TTML or YAML words
    let lines = [];
    let detectedFormat = 'LRC';
    if (data.hasWordSync && data.lyricsfile) {
      const trimmed = data.lyricsfile.trim();
      if (trimmed.startsWith('<tt') || trimmed.includes('<p begin=')) {
        lines = parseTtml(trimmed);
        detectedFormat = 'TTML';
      } else {
        lines = parseLyrics(trimmed);
        detectedFormat = 'Lyricsfile';
      }
    }

    if (lines.length === 0) {
      lines = hasSynced
        ? parseLrc(data.syncedLyrics)
        : parseLyrics(data.plainLyrics);
      detectedFormat = hasSynced ? 'LRC' : 'Plain';
    }

    const hasWordSync = Boolean(data.hasWordSync || lines.some((l) => l.syncType === 'word' && l.words && l.words.length > 0));
    const syncType = hasWordSync ? 'word' : (hasSynced ? 'line' : 'unsynced');
    const wordTimedCount = lines.filter((l) => l.syncType === 'word' && l.words && l.words.length > 0).length;

    if (Boolean(import.meta.env?.DEV)) {
      console.log(`[LyricsSync] Lyrics loaded from LRCLIB for "${data.trackName || title}" (${syncType} sync, ${wordTimedCount}/${lines.length} word lines)`);
    }

    const result = {
      found: true,
      instrumental: false,
      isSynced: hasSynced || hasWordSync,
      hasWordSync,
      syncType,
      provider: 'LRCLIB',
      format: detectedFormat,
      trackName: data.trackName || title,
      artistName: data.artistName || artist,
      albumName: data.albumName || album,
      duration: data.duration,
      lines,
    };

    lyricsCache.set(cacheKey, result);
    return result;
  } catch (err) {
    console.warn('[lyrics] fetch failed:', err);
    return { found: false, error: err.message };
  }
}

/**
 * Finds the active lyric line index for a given playback position in milliseconds.
 * Uses binary search for high performance.
 */
export function findActiveLyricIndex(lines, positionMs) {
  if (!lines || lines.length === 0) return -1;
  if (positionMs < lines[0].timeMs) return -1;
  if (positionMs >= lines[lines.length - 1].timeMs) return lines.length - 1;

  let low = 0;
  let high = lines.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const cur = lines[mid];
    const next = lines[mid + 1];

    if (cur.timeMs <= positionMs && (!next || positionMs < next.timeMs)) {
      return mid;
    }

    if (positionMs < cur.timeMs) {
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  return low;
}
