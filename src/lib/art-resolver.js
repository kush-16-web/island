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
export async function enrichTrackMetadata(title, artist = '') {
  if (!title) return { artwork: null, artist: null, album: null, provider: null };

  const query = `${title} ${artist}`.trim();

  // 1. Query iTunes API (Fast, public, provides crystal-clear 600x600 HD album covers)
  try {
    const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=1`, {
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.results && data.results.length > 0) {
        const item = data.results[0];
        const rawArt = item.artworkUrl100 || '';
        const hdArt = rawArt.replace(/\/\d+x\d+bb\./, '/600x600bb.');
        return {
          artwork: hdArt || rawArt || null,
          artist: item.artistName || artist || null,
          album: item.collectionName || null,
          provider: 'apple',
        };
      }
    }
  } catch {}

  // 2. Query YouTube resolution via Electron bridge if available
  if (typeof window !== 'undefined' && window.island?.media?.resolveYouTubeId) {
    try {
      const ytId = await window.island.media.resolveYouTubeId(query);
      if (ytId) {
        return {
          artwork: `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`,
          artist: artist || null,
          album: null,
          provider: 'youtube',
        };
      }
    } catch {}
  }

  return { artwork: null, artist: null, album: null, provider: null };
}
