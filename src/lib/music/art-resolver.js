'use strict';
/**
 * src/lib/art-resolver.js
 * High-Resolution Artwork & Poster Resolution Pipeline.
 *
 * Automatically resolves and upgrades low-res SMTC/browser thumbnails
 * (such as 120x90 or 320x180 YouTube thumbnails, 64x64 Spotify icons,
 * and 100x100 Apple Music art) to crystal-clear 1280x720 HD posters.
 */

/**
 * Extract YouTube 11-character video ID from media title, art URL, or metadata.
 */
export function extractYouTubeIdFromMedia(media) {
  if (!media) return null;
  if (media.youtubeId) return media.youtubeId;

  const title = media.title || '';
  const art = media.art || '';

  const mTitle = title.match(/watch\?v=([a-zA-Z0-9_-]{11})/);
  if (mTitle) return mTitle[1];

  const mArt = art.match(/\/vi(?:_webp)?\/([a-zA-Z0-9_-]{11})\//);
  if (mArt) return mArt[1];

  return null;
}

/**
 * Returns an ordered array of high-to-low resolution URLs for a YouTube video.
 */
export function getYouTubePosterCandidates(videoId) {
  if (!videoId) return [];
  return [
    `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
    `https://i.ytimg.com/vi_webp/${videoId}/maxresdefault.webp`,
    `https://img.youtube.com/vi/${videoId}/hq720.jpg`,
    `https://i.ytimg.com/vi/${videoId}/sddefault.jpg`,
    `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  ];
}

/**
 * Upgrades a known provider URL to its highest resolution counterpart.
 */
export function upgradeProviderArtUrl(url) {
  if (!url || typeof url !== 'string') return url;

  // Spotify: /ab67616d00004851 (64x64) or /ab67616d00001e02 (300x300) -> /ab67616d0000b273 (640x640 HD)
  if (url.includes('scdn.co/image/ab67616d00004851')) {
    return url.replace('ab67616d00004851', 'ab67616d0000b273');
  }
  if (url.includes('scdn.co/image/ab67616d00001e02')) {
    return url.replace('ab67616d00001e02', 'ab67616d0000b273');
  }

  // Apple Music: /100x100bb or /60x60bb -> /1200x1200bb
  if (url.includes('mzstatic.com') && /\/\d+x\d+bb\./.test(url)) {
    return url.replace(/\/\d+x\d+bb\./, '/1200x1200bb.');
  }

  // YouTube thumbnails in art URL: upgrade to maxresdefault
  const ytMatch = url.match(/\/vi(?:_webp)?\/([a-zA-Z0-9_-]{11})\/(?:default|mqdefault|hqdefault|sddefault)\./);
  if (ytMatch) {
    return `https://i.ytimg.com/vi/${ytMatch[1]}/maxresdefault.jpg`;
  }

  // Google / YouTube Music CDN: /...=w120-h120-l90-rj -> =w1200-h1200-l90-rj
  if (url.includes('googleusercontent.com') || url.includes('ggpht.com')) {
    if (/=w\d+-h\d+/.test(url)) {
      return url.replace(/=w\d+-h\d+/, '=w1200-h1200');
    }
    if (/=s\d+(-c)?/.test(url)) {
      return url.replace(/=s\d+(-c)?/, '=s1200');
    }
  }

  // Deezer: /cover/.../250x250 -> /cover/.../1000x1000
  if (url.includes('dzcdn.net') && /\/\d+x\d+-/.test(url)) {
    return url.replace(/\/\d+x\d+-/, '/1000x1000-');
  }

  // Tidal: /images/.../320x320.jpg -> /1280x1280.jpg
  if (url.includes('resources.tidal.com') && /\/\d+x\d+\.jpg/.test(url)) {
    return url.replace(/\/\d+x\d+\.jpg/, '/1280x1280.jpg');
  }

  return url;
}

/**
 * Enrich missing artwork, artist, and provider for a track.
 * Queries iTunes song directory first for official HD artwork (600x600),
 * and falls back to YouTube search if iTunes doesn't have it.
 * @param {string} title
 * @param {string} artist
 * @returns {Promise<{ artwork: string|null, artist: string|null, album: string|null, provider: string|null }>}
 */
// In-memory artwork cache to prevent duplicate queries and provide zero-latency poster displays
const trackArtCache = new Map();

export async function enrichTrackMetadata(title, artist = '') {
  if (!title) return { artwork: null, artist: null, album: null, provider: null };

  const cacheKey = `${title.toLowerCase().trim()}__${(artist || '').toLowerCase().trim()}`;
  if (trackArtCache.has(cacheKey)) {
    return trackArtCache.get(cacheKey);
  }

  const query = `${title} ${artist}`.trim();

  // 1. Query iTunes API (Fast, public, provides crystal-clear 1000x1000 studio album covers)
  try {
    const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=1`, {
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.results && data.results.length > 0) {
        const item = data.results[0];
        const rawArt = item.artworkUrl100 || '';
        const hdArt = rawArt.replace(/\/\d+x\d+bb\./, '/1000x1000bb.');
        const result = {
          artwork: hdArt || rawArt || null,
          artist: item.artistName || artist || null,
          album: item.collectionName || null,
          artworkSource: 'itunes',
        };
        trackArtCache.set(cacheKey, result);
        return result;
      }
    }
  } catch {}

  // 2. Query YouTube resolution via Electron bridge if available
  if (typeof window !== 'undefined' && window.island?.media?.resolveYouTubeId) {
    try {
      const ytId = await window.island.media.resolveYouTubeId(query);
      if (ytId) {
        const result = {
          artwork: `https://i.ytimg.com/vi/${ytId}/maxresdefault.jpg`,
          artist: artist || null,
          album: null,
          provider: 'youtube',
          youtubeId: ytId,
        };
        trackArtCache.set(cacheKey, result);
        return result;
      }
    } catch {}
  }

  return { artwork: null, artist: null, album: null, provider: null };
}

