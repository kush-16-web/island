/**
 * LRCLIB API Client and Synchronized Lyrics Engine
 * Provides cached fetching, parsing of LRC and ELRC (word-level) timestamps,
 * and binary search matching for YouTube Music style playback synchronization.
 */

const USER_AGENT = 'IslandDesktop/0.1.0 (https://github.com/island)';
const API_BASE = 'https://lrclib.net/api';

// In-memory cache keyed by "track|artist"
const lyricsCache = new Map();

/**
 * Parses standard LRC timestamps: [mm:ss.xx] or [mm:ss.xxx] into milliseconds
 */
function parseTimestamp(minStr, secStr) {
  const min = parseInt(minStr, 10) || 0;
  const sec = parseFloat(secStr) || 0;
  return Math.round((min * 60 + sec) * 1000);
}

/**
 * Parses LRC / ELRC text into structured synchronized lyric lines.
 * Supports:
 * - Line-level timestamps: [00:12.34] Lyric text
 * - Word-level timestamps (ELRC): [00:12.34] <00:12.34> Word1 <00:13.10> Word2
 */
export function parseLrc(lrcText) {
  if (!lrcText || typeof lrcText !== 'string') return [];

  const rawLines = lrcText.split(/\r?\n/);
  const parsed = [];
  const lineRegex = /^\[(\d{2}):(\d{2}(?:\.\d{1,3})?)\](.*)$/;
  const wordTagRegex = /<(\d{2}):(\d{2}(?:\.\d{1,3})?)>([^<]+)/g;

  for (let idx = 0; idx < rawLines.length; idx++) {
    const raw = rawLines[idx].trim();
    if (!raw) continue;

    const match = raw.match(lineRegex);
    if (!match) continue;

    const timeMs = parseTimestamp(match[1], match[2]);
    const lineBody = match[3].trim();
    if (!lineBody) continue;

    // Check for word-level sync tags
    const words = [];
    let wordMatch;
    let hasWordTags = false;

    while ((wordMatch = wordTagRegex.exec(lineBody)) !== null) {
      hasWordTags = true;
      const wTimeMs = parseTimestamp(wordMatch[1], wordMatch[2]);
      const wText = wordMatch[3].trim();
      if (wText) {
        words.push({
          text: wText,
          startMs: wTimeMs,
          endMs: 0,
        });
      }
    }

    if (words.length > 0) {
      for (let i = 0; i < words.length; i++) {
        words[i].endMs = i < words.length - 1 ? words[i + 1].startMs : timeMs + 4000;
      }
    }

    const cleanText = hasWordTags
      ? lineBody.replace(/<\d{2}:\d{2}(?:\.\d{1,3})?>/g, '').replace(/\s+/g, ' ').trim()
      : lineBody;

    // Filter out metadata tags like [by:...] or [re:...]
    if (cleanText.startsWith('by:') || cleanText.startsWith('re:') || cleanText.startsWith('ve:')) {
      continue;
    }

    parsed.push({
      id: `line-${idx}-${timeMs}`,
      timeMs,
      endMs: 0,
      text: cleanText,
      words: words.length > 0 ? words : null,
    });
  }

  // Calculate line end times from next line's start time
  for (let i = 0; i < parsed.length; i++) {
    parsed[i].endMs = i < parsed.length - 1 ? parsed[i + 1].timeMs : parsed[i].timeMs + 6000;
  }

  return parsed.sort((a, b) => a.timeMs - b.timeMs);
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

/**
 * Fetches lyrics from LRCLIB for the given track metadata.
 * Uses exact match first, then falls back to search.
 */
export async function fetchLyrics({ title, artist, album, durationSec }) {
  if (!title) return { found: false, error: 'No title provided' };

  const cacheKey = `${title.toLowerCase().trim()}|${(artist || '').toLowerCase().trim()}`;
  if (lyricsCache.has(cacheKey)) {
    return lyricsCache.get(cacheKey);
  }

  const cleanTitle = cleanSearchQuery(title);
  const cleanArtist = (artist || '').trim();

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
        trackName: data.trackName || title,
        artistName: data.artistName || artist,
        lines: [{ id: 'inst-0', timeMs: 0, endMs: 999999, text: '♪ Instrumental ♪' }],
        hasWordSync: false,
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

    const lines = hasSynced
      ? parseLrc(data.syncedLyrics)
      : data.plainLyrics
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean)
          .map((text, idx) => ({
            id: `plain-${idx}`,
            timeMs: null,
            endMs: null,
            text,
            words: null,
          }));

    const result = {
      found: true,
      instrumental: false,
      isSynced: hasSynced,
      hasWordSync: Boolean(data.hasWordSync || lines.some((l) => l.words && l.words.length > 0)),
      trackName: data.trackName || title,
      artistName: data.artistName || artist,
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
