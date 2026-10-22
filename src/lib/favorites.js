/**
 * favorites.js: Authoritative, provider-aware Unified Favorites store for Island.
 *
 * Requirements:
 * 1. Single source of truth for Player heart button, Favorites menu, and Jadu voice actions.
 * 2. Multi-provider awareness: Spotify, YouTube Music, Apple Music, Local, Generic.
 * 3. Preserves artwork, album, provider track ID, and safe playable references.
 * 4. Idempotent migration from legacy 'island_fav_tracks'.
 * 5. Event-driven synchronization via 'island:favorites-changed' custom event.
 */

import { normalizeText } from './music-actions.js';

export const UNIFIED_STORAGE_KEY = 'island_favorites_v2';
export const LEGACY_STORAGE_KEY = 'island_fav_tracks';

export const SUPPORTED_PROVIDERS = Object.freeze({
  SPOTIFY: 'spotify',
  YOUTUBE: 'youtube',
  APPLE: 'apple',
  LOCAL: 'local',
  GENERIC: 'generic',
});

/**
 * Determine the music provider from active SMTC media attributes.
 * @param {object} media - SMTC media state { app, rawAppId, youtubeId, title, artist, provider }
 * @returns {string} provider key
 */
export function detectProvider(media = {}) {
  if (!media) return SUPPORTED_PROVIDERS.GENERIC;
  if (media.provider && Object.values(SUPPORTED_PROVIDERS).includes(media.provider)) {
    return media.provider;
  }
  const app = String(media.app || '').toLowerCase();
  const rawApp = String(media.rawAppId || media.sourceAppId || '').toLowerCase();
  const title = String(media.title || '').toLowerCase();
  const art = String(media.art || media.artwork || '').toLowerCase();

  if (app.includes('spotify') || rawApp.includes('spotify')) return SUPPORTED_PROVIDERS.SPOTIFY;
  if (
    app.includes('apple music') ||
    app.includes('itunes') ||
    rawApp.includes('applemusic') ||
    rawApp.includes('itunes')
  ) {
    return SUPPORTED_PROVIDERS.APPLE;
  }
  if (
    Boolean(media.youtubeId) ||
    app.includes('youtube') ||
    rawApp.includes('youtube') ||
    rawApp.includes('cinhimbnkkaohfgiekfkjhmbdcndachm') ||
    title.includes('youtube') ||
    art.includes('ytimg') ||
    art.includes('youtube')
  ) {
    return SUPPORTED_PROVIDERS.YOUTUBE;
  }
  if (app.includes('vlc') || app.includes('media player') || app.includes('groove') || app.includes('foobar')) {
    return SUPPORTED_PROVIDERS.LOCAL;
  }
  return SUPPORTED_PROVIDERS.GENERIC;
}

/**
 * Build a safe, provider-specific playable URL or deep-link URI.
 */
export function buildPlayableReference(title, artist, provider, extra = {}) {
  const query = `${title || ''} ${artist || ''}`.trim();
  const encodedQuery = encodeURIComponent(query);

  switch (provider) {
    case SUPPORTED_PROVIDERS.SPOTIFY: {
      if (extra.providerTrackId && extra.providerTrackId.startsWith('spotify:')) {
        return extra.providerTrackId;
      }
      // Spotify URI protocol triggers desktop app directly
      return `spotify:search:${encodedQuery}`;
    }
    case SUPPORTED_PROVIDERS.YOUTUBE: {
      if (extra.youtubeId) {
        return `https://music.youtube.com/watch?v=${extra.youtubeId}`;
      }
      return `https://music.youtube.com/search?q=${encodedQuery}`;
    }
    case SUPPORTED_PROVIDERS.APPLE: {
      return `https://music.apple.com/search?term=${encodedQuery}`;
    }
    default:
      return `https://music.youtube.com/search?q=${encodedQuery}`;
  }
}

/**
 * Create a stable, provider-aware favorite ID.
 * Avoids colliding songs with the same title across different providers.
 */
export function createFavoriteId(title, artist, provider = 'generic', providerTrackId = null) {
  const cleanTitle = normalizeText(title);
  const cleanArtist = normalizeText(artist);
  if (providerTrackId) {
    return `${provider}:${providerTrackId}`;
  }
  return `${provider}:${cleanTitle}__${cleanArtist}`;
}

/**
 * Migrate legacy favorites and repair misclassified provider records.
 */
export function migrateLegacyFavorites(storage = null) {
  const s = storage || (typeof window !== 'undefined' ? window.localStorage : null);
  if (!s) return [];

  let unifiedList = [];
  try {
    const rawUnified = s.getItem(UNIFIED_STORAGE_KEY);
    if (rawUnified) {
      const parsed = JSON.parse(rawUnified);
      if (Array.isArray(parsed)) unifiedList = parsed;
    }
  } catch {}

  let repairedAny = false;
  // Repair any records where YouTube tracks were mistakenly classified as Apple Music
  unifiedList = unifiedList.map((item) => {
    if (!item) return item;
    const isYouTubeUrl = item.playableUrl && (item.playableUrl.includes('youtube.com') || item.playableUrl.includes('youtu.be'));
    const isYouTubeId = Boolean(item.youtubeId || (item.providerTrackId && !item.providerTrackId.startsWith('spotify:')));
    const hasYouTubeArt = item.artwork && item.artwork.includes('ytimg');

    if (item.provider === SUPPORTED_PROVIDERS.APPLE && (isYouTubeUrl || isYouTubeId || hasYouTubeArt)) {
      repairedAny = true;
      const repairedProvider = SUPPORTED_PROVIDERS.YOUTUBE;
      return {
        ...item,
        provider: repairedProvider,
        id: createFavoriteId(item.title, item.artist, repairedProvider, item.providerTrackId),
        playableUrl: item.playableUrl || buildPlayableReference(item.title, item.artist, repairedProvider, { youtubeId: item.youtubeId }),
      };
    }
    return item;
  });

  if (repairedAny) {
    try {
      s.setItem(UNIFIED_STORAGE_KEY, JSON.stringify(unifiedList));
    } catch {}
  }

  const existingIds = new Set(unifiedList.map((f) => f.id));
  const existingTitleArtists = new Set(
    unifiedList.map((f) => `${normalizeText(f.title)}|${normalizeText(f.artist || '')}`)
  );

  // Check legacy map: "${title}|${artist}": { title, artist, addedAt }
  try {
    const rawLegacy = s.getItem(LEGACY_STORAGE_KEY);
    if (rawLegacy) {
      const legacyMap = JSON.parse(rawLegacy);
      let migratedAny = false;

      for (const [key, item] of Object.entries(legacyMap)) {
        if (!item || !item.title) continue;
        const provider = item.provider || SUPPORTED_PROVIDERS.GENERIC;
        const id = item.id || createFavoriteId(item.title, item.artist, provider);
        const titleArtistKey = `${normalizeText(item.title)}|${normalizeText(item.artist || '')}`;

        if (!existingIds.has(id) && !existingTitleArtists.has(titleArtistKey)) {
          unifiedList.push({
            id,
            title: item.title,
            artist: item.artist || '',
            album: item.album || '',
            artwork: item.art || item.artwork || null,
            provider,
            providerTrackId: item.providerTrackId || null,
            playableUrl: item.playableUrl || buildPlayableReference(item.title, item.artist, provider),
            addedAt: item.addedAt || Date.now(),
          });
          existingIds.add(id);
          existingTitleArtists.add(titleArtistKey);
          migratedAny = true;
        }
      }

      if (migratedAny) {
        s.setItem(UNIFIED_STORAGE_KEY, JSON.stringify(unifiedList));
      }
    }
  } catch {}

  return unifiedList;
}

/**
 * Retrieve all favorites as a list.
 */
export function getAllFavorites(storage = null) {
  const s = storage || (typeof window !== 'undefined' ? window.localStorage : null);
  if (!s) return [];

  // Run transparent migration and repair
  return migrateLegacyFavorites(s);
}

/**
 * Save the entire list and broadcast an update.
 */
export function setAllFavorites(favorites, storage = null) {
  const s = storage || (typeof window !== 'undefined' ? window.localStorage : null);
  if (!s) return false;

  try {
    s.setItem(UNIFIED_STORAGE_KEY, JSON.stringify(favorites));

    // Keep legacy key in sync for backward compatibility
    const legacyMap = {};
    for (const f of favorites) {
      const legacyKey = `${f.title}|${f.artist || ''}`;
      legacyMap[legacyKey] = {
        id: f.id,
        title: f.title,
        artist: f.artist,
        provider: f.provider,
        addedAt: f.addedAt,
      };
    }
    s.setItem(LEGACY_STORAGE_KEY, JSON.stringify(legacyMap));

    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('island:favorites-changed', { detail: favorites }));
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a given track (or active media) is in favorites.
 */
export function isTrackFavorite(track, storage = null) {
  if (!track || !track.title) return false;
  const list = getAllFavorites(storage);
  const targetTitle = normalizeText(track.title);
  const targetArtist = normalizeText(track.artist || '');

  return list.some((f) => {
    const titleMatch = normalizeText(f.title) === targetTitle;
    if (!titleMatch) return false;
    if (!targetArtist || !f.artist) return true;
    return normalizeText(f.artist) === targetArtist;
  });
}

/**
 * Add a track to unified favorites.
 */
export function addFavorite(track, storage = null) {
  if (!track || !track.title) return null;

  const list = getAllFavorites(storage);
  const provider = track.provider || detectProvider(track);
  const id = track.id || createFavoriteId(track.title, track.artist, provider, track.providerTrackId);

  // Check for duplicate ID
  const existingIndex = list.findIndex((f) => f.id === id);
  if (existingIndex >= 0) {
    return list[existingIndex];
  }

  const newFavorite = {
    id,
    title: track.title,
    artist: track.artist || '',
    album: track.album || '',
    artwork: track.artwork || track.art || null,
    provider,
    providerTrackId: track.providerTrackId || track.youtubeId || null,
    playableUrl:
      track.playableUrl ||
      buildPlayableReference(track.title, track.artist, provider, {
        youtubeId: track.youtubeId,
        providerTrackId: track.providerTrackId,
      }),
    addedAt: Date.now(),
  };

  const nextList = [newFavorite, ...list];
  setAllFavorites(nextList, storage);
  return newFavorite;
}

/**
 * Remove a favorite by ID or by title/artist.
 */
export function removeFavorite(idOrTrack, storage = null) {
  const list = getAllFavorites(storage);
  let nextList = [];

  if (typeof idOrTrack === 'string') {
    nextList = list.filter((f) => f.id !== idOrTrack);
  } else if (idOrTrack && idOrTrack.title) {
    const targetTitle = normalizeText(idOrTrack.title);
    const targetArtist = normalizeText(idOrTrack.artist || '');
    nextList = list.filter((f) => {
      const titleMatch = normalizeText(f.title) === targetTitle;
      const artistMatch = !targetArtist || !f.artist || normalizeText(f.artist) === targetArtist;
      return !(titleMatch && artistMatch);
    });
  } else {
    return false;
  }

  setAllFavorites(nextList, storage);
  return true;
}

/**
 * Update an existing favorite's attributes (e.g. enriched artwork or provider).
 */
export function updateFavorite(id, patch, storage = null) {
  const list = getAllFavorites(storage);
  let updated = false;
  const nextList = list.map((item) => {
    if (item.id === id) {
      updated = true;
      return { ...item, ...patch };
    }
    return item;
  });
  if (updated) {
    setAllFavorites(nextList, storage);
  }
  return updated;
}

