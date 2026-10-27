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
export const BACKUP_STORAGE_KEY = 'island_favorites_v2_backup';
export const LEGACY_STORAGE_KEY = 'island_fav_tracks';

export const SUPPORTED_PROVIDERS = Object.freeze({
  SPOTIFY: 'spotify',
  YOUTUBE: 'youtube',
  YOUTUBE_MUSIC: 'youtube',
  APPLE: 'apple',
  LOCAL: 'local',
  GENERIC: 'generic',
  UNKNOWN: 'unknown',
});

/**
 * Robust evidence checks for provider verification.
 * Distinguishes true provider ownership from accidental iTunes search enrichment.
 */
export function isVerifiedYouTube(track) {
  if (!track) return false;
  if (track.youtubeId) return true;
  if (typeof track.providerTrackId === 'string' && /^[a-zA-Z0-9_-]{11}$/.test(track.providerTrackId)) return true;
  const url = String(track.playableUrl || track.originalUrl || '').toLowerCase();
  if (url.includes('youtube.com') || url.includes('youtu.be')) return true;
  const art = String(track.artwork || track.art || '').toLowerCase();
  if (art.includes('ytimg.com') || art.includes('youtube.com')) return true;
  const rawApp = String(track.rawAppId || track.sourceAppId || '').toLowerCase();
  if (rawApp.includes('youtube') || rawApp.includes('cinhimbnkkaohfgiekfkjhmbdcndachm')) return true;
  const app = String(track.app || '').toLowerCase();
  if (app.includes('youtube')) return true;
  return false;
}

export function isVerifiedSpotify(track) {
  if (!track) return false;
  if (typeof track.providerTrackId === 'string' && track.providerTrackId.startsWith('spotify:')) return true;
  const url = String(track.playableUrl || track.originalUrl || '').toLowerCase();
  if (url.startsWith('spotify:') || url.includes('open.spotify.com')) return true;
  const rawApp = String(track.rawAppId || track.sourceAppId || '').toLowerCase();
  if (rawApp.includes('spotify')) return true;
  const app = String(track.app || '').toLowerCase();
  if (app.includes('spotify')) return true;
  return false;
}

export function isVerifiedApple(track) {
  if (!track) return false;
  const rawApp = String(track.rawAppId || track.sourceAppId || '').toLowerCase();
  if (rawApp.includes('applemusic') || rawApp.includes('itunes')) return true;
  const app = String(track.app || '').toLowerCase();
  if (app.includes('apple music') || app.includes('itunes')) return true;
  const url = String(track.playableUrl || track.originalUrl || '').toLowerCase();
  // Only actual catalog tracks/albums, NOT generic public iTunes search results
  if (url.includes('music.apple.com') && !url.includes('search?term=') && !url.includes('/search?')) return true;
  return false;
}

export function isVerifiedLocal(track) {
  if (!track) return false;
  const app = String(track.app || '').toLowerCase();
  const rawApp = String(track.rawAppId || '').toLowerCase();
  return app.includes('vlc') || app.includes('media player') || app.includes('groove') || app.includes('foobar') || rawApp.includes('vlc');
}

/**
 * Determine the music provider from active SMTC media attributes.
 * @param {object} media - SMTC media state { app, rawAppId, youtubeId, title, artist, provider }
 * @returns {string} provider key
 */
export function detectProvider(media = {}) {
  if (!media) return SUPPORTED_PROVIDERS.GENERIC;
  const rawApp = String(media.rawAppId || media.sourceAppId || '').toLowerCase();
  const app = String(media.app || '').toLowerCase();

  // Strongest source evidence: Spotify application
  if (app.includes('spotify') || rawApp.includes('spotify') || isVerifiedSpotify(media)) {
    return SUPPORTED_PROVIDERS.SPOTIFY;
  }

  if (media.provider && Object.values(SUPPORTED_PROVIDERS).includes(media.provider)) {
    // Normalize youtube_music alias
    if (media.provider === 'youtube_music') return SUPPORTED_PROVIDERS.YOUTUBE;
    // Guard: If marked Apple Music, ensure it actually has Apple evidence and wasn't just iTunes artwork
    if (media.provider === SUPPORTED_PROVIDERS.APPLE && !isVerifiedApple(media)) {
      if (isVerifiedYouTube(media)) return SUPPORTED_PROVIDERS.YOUTUBE;
      if (isVerifiedSpotify(media)) return SUPPORTED_PROVIDERS.SPOTIFY;
      return SUPPORTED_PROVIDERS.GENERIC;
    }
    return media.provider;
  }

  const title = String(media.title || '').toLowerCase();
  const art = String(media.art || media.artwork || '').toLowerCase();

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
export function buildPlayableReference(titleOrTrack, artist, provider, extra = {}) {
  let title = titleOrTrack;
  let effectiveArtist = artist;
  let effectiveProvider = provider;
  let effectiveExtra = extra || {};

  if (typeof titleOrTrack === 'object' && titleOrTrack !== null) {
    const item = titleOrTrack;
    title = item.title;
    effectiveArtist = item.artist;
    effectiveProvider = item.provider;
    effectiveExtra = {
      ...item,
      youtubeId: item.youtubeId || item.videoId,
      ...extra,
    };
  }

  const query = `${title || ''} ${effectiveArtist || ''}`.trim();
  const encodedQuery = encodeURIComponent(query);
  const normalizedProvider = effectiveProvider === 'youtube_music' ? SUPPORTED_PROVIDERS.YOUTUBE : effectiveProvider;

  switch (normalizedProvider) {
    case SUPPORTED_PROVIDERS.SPOTIFY: {
      if (effectiveExtra.providerTrackId && effectiveExtra.providerTrackId.startsWith('spotify:')) {
        return effectiveExtra.providerTrackId;
      }
      if (effectiveExtra.spotifyUri && effectiveExtra.spotifyUri.startsWith('spotify:')) {
        return effectiveExtra.spotifyUri;
      }
      if (effectiveExtra.playableUrl && (effectiveExtra.playableUrl.startsWith('spotify:') || effectiveExtra.playableUrl.includes('open.spotify.com'))) {
        return effectiveExtra.playableUrl;
      }
      return `spotify:search:${encodedQuery}`;
    }
    case SUPPORTED_PROVIDERS.YOUTUBE: {
      const ytId = effectiveExtra.youtubeId || effectiveExtra.videoId;
      if (ytId) {
        return `https://music.youtube.com/watch?v=${ytId}`;
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
  const normProv = provider === 'youtube_music' ? SUPPORTED_PROVIDERS.YOUTUBE : provider;
  if (providerTrackId) {
    return `${normProv}:${providerTrackId}`;
  }
  return `${normProv}:${cleanTitle}__${cleanArtist}`;
}

/**
 * Reconnect an ambiguous or misclassified favorite to a user-confirmed provider.
 */
export function reconnectFavoriteProvider(id, targetProvider, storage = null) {
  const s = storage || (typeof window !== 'undefined' ? window.localStorage : null);
  const list = getAllFavorites(s);
  let updated = false;

  const nextList = list.map((item) => {
    if (item.id === id) {
      updated = true;
      const validProvider = Object.values(SUPPORTED_PROVIDERS).includes(targetProvider)
        ? targetProvider
        : SUPPORTED_PROVIDERS.YOUTUBE;
      const newPlayableUrl = buildPlayableReference(item.title, item.artist, validProvider, {
        youtubeId: item.youtubeId,
        providerTrackId: item.providerTrackId,
      });
      return {
        ...item,
        id: createFavoriteId(item.title, item.artist, validProvider, item.providerTrackId),
        provider: validProvider,
        playableUrl: newPlayableUrl,
        isAmbiguousSource: false,
        sourceConfirmedAt: Date.now(),
      };
    }
    return item;
  });

  if (updated) {
    setAllFavorites(nextList, s);
  }
  return updated;
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
      // 1. Safety Backup: preserve untouched original storage before any repair or mutation
      try {
        if (!s.getItem(BACKUP_STORAGE_KEY)) {
          s.setItem(BACKUP_STORAGE_KEY, rawUnified);
        }
      } catch {}

      const parsed = JSON.parse(rawUnified);
      if (Array.isArray(parsed)) unifiedList = parsed;
    }
  } catch {}

  let repairedAny = false;
  // Repair any records where tracks were misclassified or corrupted by iTunes artwork
  unifiedList = unifiedList.map((item) => {
    if (!item) return item;

    // Check YouTube / Spotify evidence
    const hasYtEvidence = isVerifiedYouTube(item);
    const hasSpEvidence = isVerifiedSpotify(item);
    const hasAppleEvidence = isVerifiedApple(item);

    // Case 1: Labeled Apple, but has unambiguous YouTube evidence
    if (item.provider === SUPPORTED_PROVIDERS.APPLE && hasYtEvidence) {
      repairedAny = true;
      const repairedProvider = SUPPORTED_PROVIDERS.YOUTUBE;
      return {
        ...item,
        provider: repairedProvider,
        isAmbiguousSource: false,
        id: createFavoriteId(item.title, item.artist, repairedProvider, item.providerTrackId),
        playableUrl: item.playableUrl || buildPlayableReference(item.title, item.artist, repairedProvider, { youtubeId: item.youtubeId }),
      };
    }

    // Case 2: Labeled Apple, but has unambiguous Spotify evidence
    if (item.provider === SUPPORTED_PROVIDERS.APPLE && hasSpEvidence) {
      repairedAny = true;
      const repairedProvider = SUPPORTED_PROVIDERS.SPOTIFY;
      return {
        ...item,
        provider: repairedProvider,
        isAmbiguousSource: false,
        id: createFavoriteId(item.title, item.artist, repairedProvider, item.providerTrackId),
        playableUrl: item.playableUrl || buildPlayableReference(item.title, item.artist, repairedProvider, { providerTrackId: item.providerTrackId }),
      };
    }

    // Case 3: Labeled Apple, but lacks ANY Apple evidence (corrupted by iTunes artwork enrichment)
    if (item.provider === SUPPORTED_PROVIDERS.APPLE && !hasAppleEvidence) {
      repairedAny = true;
      // Mark as ambiguous so UI can offer reconnection; provide safe playable fallback URL
      return {
        ...item,
        provider: SUPPORTED_PROVIDERS.UNKNOWN,
        isAmbiguousSource: true,
        originalCorruptedProvider: SUPPORTED_PROVIDERS.APPLE,
        playableUrl: item.playableUrl || buildPlayableReference(item.title, item.artist, SUPPORTED_PROVIDERS.YOUTUBE),
      };
    }

    // Case 4: Missing playableUrl on ANY record
    if (!item.playableUrl) {
      repairedAny = true;
      return {
        ...item,
        playableUrl: buildPlayableReference(item.title, item.artist, item.provider || SUPPORTED_PROVIDERS.GENERIC, {
          youtubeId: item.youtubeId,
          providerTrackId: item.providerTrackId,
        }),
      };
    }

    // Case 5: YouTube favorite with watch?v= URL missing explicit youtubeId / providerTrackId
    if (item.provider === SUPPORTED_PROVIDERS.YOUTUBE && (!item.youtubeId || !item.providerTrackId) && item.playableUrl) {
      try {
        const u = new URL(item.playableUrl);
        const vid = u.searchParams.get('v');
        if (vid && /^[a-zA-Z0-9_-]{11}$/.test(vid)) {
          repairedAny = true;
          return {
            ...item,
            youtubeId: vid,
            providerTrackId: vid,
            isUnresolvedIdentity: false,
          };
        }
      } catch {}
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
  const targetProvider = track.provider || (track.app ? detectProvider(track) : null);

  return list.some((f) => {
    if (targetProvider && f.provider && f.provider !== targetProvider) {
      return false;
    }
    const titleMatch = normalizeText(f.title) === targetTitle;
    if (!titleMatch) return false;
    if (!targetArtist || !f.artist) return true;
    return normalizeText(f.artist) === targetArtist;
  });
}

/**
 * Add a track to unified favorites with companion correlation and exact identity preservation.
 */
export function addFavorite(track, storageOrOptions = null, maybeCompanion = null) {
  if (!track || !track.title) return null;

  let storage = storageOrOptions;
  let companion = maybeCompanion;
  if (storageOrOptions && typeof storageOrOptions === 'object' && typeof storageOrOptions.getItem !== 'function') {
    storage = storageOrOptions.storage || null;
    companion = storageOrOptions.companionState || storageOrOptions.companion || null;
  }

  const list = getAllFavorites(storage);
  const detectedProvider = track.provider || detectProvider(track);

  let finalProvider = detectedProvider;
  let resolvedYoutubeId = null;
  let resolvedProviderTrackId = track.providerTrackId || null;
  let resolvedUrl = track.playableUrl || track.originalUrl || null;

  const isSpotify = detectedProvider === SUPPORTED_PROVIDERS.SPOTIFY || isVerifiedSpotify(track);

  if (isSpotify) {
    finalProvider = SUPPORTED_PROVIDERS.SPOTIFY;
    if (resolvedProviderTrackId && resolvedProviderTrackId.startsWith('spotify:')) {
      resolvedUrl = resolvedUrl || resolvedProviderTrackId;
    } else if (resolvedUrl && (resolvedUrl.startsWith('spotify:') || resolvedUrl.includes('open.spotify.com'))) {
      if (!resolvedProviderTrackId && resolvedUrl.startsWith('spotify:')) {
        resolvedProviderTrackId = resolvedUrl;
      }
    }
    if (!resolvedUrl) {
      resolvedUrl = buildPlayableReference(track.title, track.artist, SUPPORTED_PROVIDERS.SPOTIFY, {
        providerTrackId: resolvedProviderTrackId,
      });
    }
  } else {
    // Non-Spotify track: check for YouTube identity or correlation with companion
    const comp = companion || (typeof window !== 'undefined' ? window.__islandCompanionState : null);
    resolvedYoutubeId =
      track.youtubeId ||
      (typeof track.providerTrackId === 'string' && /^[a-zA-Z0-9_-]{11}$/.test(track.providerTrackId)
        ? track.providerTrackId
        : null);

    if (!resolvedYoutubeId && resolvedUrl) {
      try {
        const u = new URL(resolvedUrl);
        const v = u.searchParams.get('v');
        if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) {
          resolvedYoutubeId = v;
        }
      } catch {}
    }

    if (!resolvedYoutubeId && comp && comp.isYtMusicActive && comp.currentTrack?.videoId) {
      const normTrack = normalizeText(track.title);
      const normComp = normalizeText(comp.currentTrack.title || '');
      if (normTrack && normComp && (normTrack.includes(normComp) || normComp.includes(normTrack))) {
        resolvedYoutubeId = comp.currentTrack.videoId;
        resolvedUrl = `https://music.youtube.com/watch?v=${resolvedYoutubeId}`;
      }
    }

    if (resolvedYoutubeId || detectedProvider === SUPPORTED_PROVIDERS.YOUTUBE || isVerifiedYouTube(track)) {
      finalProvider = SUPPORTED_PROVIDERS.YOUTUBE;
      resolvedProviderTrackId = resolvedYoutubeId;
      resolvedUrl =
        resolvedUrl ||
        buildPlayableReference(track.title, track.artist, SUPPORTED_PROVIDERS.YOUTUBE, {
          youtubeId: resolvedYoutubeId,
          providerTrackId: resolvedYoutubeId,
        });
    } else if (detectedProvider === SUPPORTED_PROVIDERS.APPLE && isVerifiedApple(track)) {
      finalProvider = SUPPORTED_PROVIDERS.APPLE;
      resolvedUrl = resolvedUrl || buildPlayableReference(track.title, track.artist, SUPPORTED_PROVIDERS.APPLE);
    } else if (detectedProvider === SUPPORTED_PROVIDERS.LOCAL) {
      finalProvider = SUPPORTED_PROVIDERS.LOCAL;
    } else {
      finalProvider = detectedProvider || SUPPORTED_PROVIDERS.UNKNOWN;
    }
  }

  const isUnresolvedIdentity =
    (finalProvider === SUPPORTED_PROVIDERS.YOUTUBE && !resolvedYoutubeId) ||
    finalProvider === SUPPORTED_PROVIDERS.UNKNOWN;

  const id = track.id || createFavoriteId(track.title, track.artist, finalProvider, resolvedProviderTrackId);

  // Provider-aware duplicate checking: identical songs from different providers must NOT collide!
  const normTitle = normalizeText(track.title);
  const normArtist = normalizeText(track.artist || '');
  const existingIndex = list.findIndex((f) => {
    if (f.id === id) return true;
    const fProv = (f.provider || '').toLowerCase();
    const targetProv = (finalProvider || '').toLowerCase();
    if (fProv === targetProv) {
      const titleMatch = normalizeText(f.title) === normTitle;
      if (titleMatch && (!normArtist || !f.artist || normalizeText(f.artist) === normArtist)) {
        return true;
      }
    }
    return false;
  });

  if (existingIndex >= 0) {
    // If existing record was missing exact provider ID and we now have one, heal it!
    if (resolvedYoutubeId && !list[existingIndex].youtubeId) {
      list[existingIndex] = {
        ...list[existingIndex],
        provider: finalProvider,
        providerTrackId: resolvedYoutubeId,
        youtubeId: resolvedYoutubeId,
        playableUrl: `https://music.youtube.com/watch?v=${resolvedYoutubeId}`,
        isUnresolvedIdentity: false,
      };
      setAllFavorites(list, storage);
      return list[existingIndex];
    }
    if (finalProvider === SUPPORTED_PROVIDERS.SPOTIFY && resolvedProviderTrackId && !list[existingIndex].providerTrackId) {
      list[existingIndex] = {
        ...list[existingIndex],
        provider: finalProvider,
        providerTrackId: resolvedProviderTrackId,
        playableUrl: resolvedUrl,
      };
      setAllFavorites(list, storage);
      return list[existingIndex];
    }
    return list[existingIndex];
  }

  const newFavorite = {
    id,
    title: track.title,
    artist: track.artist || '',
    album: track.album || '',
    artwork: track.artwork || track.art || null,
    provider: finalProvider,
    source: finalProvider,
    isVerifiedSpotify: finalProvider === SUPPORTED_PROVIDERS.SPOTIFY,
    providerTrackId: resolvedProviderTrackId || null,
    youtubeId: resolvedYoutubeId || null,
    playableUrl: resolvedUrl,
    originalUrl: track.originalUrl || track.url || track.playableUrl || resolvedUrl,
    isUnresolvedIdentity,
    addedAt: Date.now(),
  };

  const nextList = [newFavorite, ...list];
  setAllFavorites(nextList, storage);
  return newFavorite;
}

function stripTitleNoise(title) {
  return normalizeText(
    String(title || '')
      .replace(/\s*\([^)]*(?:official|video|audio|lyrics|visualizer|remix|feat|ft)[^)]*\)/gi, '')
      .replace(/\s*\[[^\]]*(?:official|video|audio|lyrics|visualizer|remix|feat|ft)[^\]]*\]/gi, '')
      .replace(/\s*-\s*(?:official|video|audio|lyrics).*/gi, '')
  );
}

/**
 * Heal an existing favorite record with an exact video ID and canonical playable URL.
 */
export function healFavoriteWithExactId(idOrTitle, exactVideoId, storage = null) {
  if (!idOrTitle || !exactVideoId || !/^[a-zA-Z0-9_-]{11}$/.test(exactVideoId)) return null;
  const list = getAllFavorites(storage);
  const rawTarget = normalizeText(idOrTitle);
  const cleanTarget = stripTitleNoise(idOrTitle);

  let updatedTrack = null;
  const nextList = list.map((item) => {
    if (!item) return item;
    const itemNorm = normalizeText(item.title);
    const itemClean = stripTitleNoise(item.title);

    // 1. Direct ID match
    const isIdMatch = item.id === idOrTitle;
    // 2. Exact or stripped title match
    const isExactMatch = itemNorm === rawTarget || itemClean === cleanTarget;
    // 3. Containment match (e.g. "Die For You" within "The Weeknd - Die For You (Official Video)")
    const isFuzzyMatch =
      cleanTarget.length >= 4 &&
      (itemClean.includes(cleanTarget) || cleanTarget.includes(itemClean));

    if (isIdMatch || isExactMatch || isFuzzyMatch) {
      updatedTrack = {
        ...item,
        provider: SUPPORTED_PROVIDERS.YOUTUBE,
        providerTrackId: exactVideoId,
        youtubeId: exactVideoId,
        playableUrl: `https://music.youtube.com/watch?v=${exactVideoId}`,
        isUnresolvedIdentity: false,
      };
      return updatedTrack;
    }
    return item;
  });

  if (updatedTrack) {
    setAllFavorites(nextList, storage);
  }
  return updatedTrack;
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
    const targetProvider = idOrTrack.provider || (idOrTrack.app ? detectProvider(idOrTrack) : null);
    nextList = list.filter((f) => {
      if (targetProvider && f.provider && f.provider !== targetProvider) {
        return true; // Keep favorites from other providers
      }
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

