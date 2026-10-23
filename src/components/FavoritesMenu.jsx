import React, { useState, useEffect, useMemo } from 'react';
import {
  getAllFavorites,
  removeFavorite,
  updateFavorite,
  reconnectFavoriteProvider,
  healFavoriteWithExactId,
  SUPPORTED_PROVIDERS,
} from '../lib/favorites';
import { playFavoriteTrack } from '../lib/music-actions';
import { enrichTrackMetadata } from '../lib/art-resolver';
import { Icon } from './icons';
import { Empty } from './bits';

/**
 * FavoritesMenu: Native Island favorites library interface.
 * Matches Image 1 & 2:
 * - Clean spacious header: "Favorites", "Your music, across connected sources"
 * - Dynamic provider filter pills: Only shows sources that actually exist in the user's favorites
 * - Automatic HD artwork and metadata enrichment for tracks missing covers
 * - Song rows: Artwork, Title, "Artist · Provider", Play button, Heart button
 * - Ambiguous source repair: 1-click reconnection to YouTube Music or Spotify for unverified legacy tracks
 * - Sleek custom modern scrollbar with zero clipping or Windows native arrows
 */
export default function FavoritesMenu({
  onPlayTrack,
  onClose,
  accentColor,
}) {
  const [favorites, setFavorites] = useState(() => getAllFavorites());
  const [filterProvider, setFilterProvider] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [companionStatus, setCompanionStatus] = useState(() => (typeof window !== 'undefined' && window.__islandCompanionState) || null);

  useEffect(() => {
    if (window.island?.companion?.getStatus) {
      window.island.companion.getStatus().then((status) => {
        setCompanionStatus(status);
      }).catch(() => {});
    }
    const unsub = window.island?.on?.('companion:status-changed', (data) => {
      setCompanionStatus(data?.info || data);
    });
    return () => unsub?.();
  }, []);

  // Synchronize immediately whenever favorites change anywhere in the app
  useEffect(() => {
    const handleUpdate = () => {
      setFavorites(getAllFavorites());
    };
    window.addEventListener('island:favorites-changed', handleUpdate);
    return () => window.removeEventListener('island:favorites-changed', handleUpdate);
  }, []);

  // Background enrichment: automatically fetch official HD cover art and metadata for tracks missing art
  useEffect(() => {
    let isMounted = true;
    const itemsMissingArt = favorites.filter((f) => !f.artwork);
    if (itemsMissingArt.length > 0) {
      itemsMissingArt.forEach(async (item) => {
        try {
          const enriched = await enrichTrackMetadata(item.title, item.artist);
          if (isMounted && enriched.artwork) {
            updateFavorite(item.id, {
              artwork: enriched.artwork,
              artist: enriched.artist || item.artist,
              album: enriched.album || item.album,
            });
            setFavorites(getAllFavorites());
          }
        } catch {}
      });
    }
    return () => { isMounted = false; };
  }, [favorites.length]);

  const getProviderLabel = (provider, isAmbiguous = false) => {
    if (isAmbiguous || provider === 'unknown') return 'Unconfirmed Source';
    if (provider === SUPPORTED_PROVIDERS.SPOTIFY) return 'Spotify';
    if (provider === SUPPORTED_PROVIDERS.YOUTUBE) return 'YouTube Music';
    if (provider === SUPPORTED_PROVIDERS.APPLE) return 'Apple Music';
    if (provider === SUPPORTED_PROVIDERS.LOCAL) return 'Local Media';
    return provider ? (provider.charAt(0).toUpperCase() + provider.slice(1)) : '';
  };

  const handleReconnect = (id, targetProvider) => {
    reconnectFavoriteProvider(id, targetProvider);
    setFavorites(getAllFavorites());
  };

  // Compute compact source filters: All, Spotify, YouTube Music, and Unknown (only when unresolved entries exist)
  const filterOptions = useMemo(() => {
    const options = [
      { id: 'all', label: 'All' },
      { id: 'spotify', label: 'Spotify' },
      { id: 'youtube', label: 'YouTube Music' },
    ];
    const hasUnknown = favorites.some((f) => f.isAmbiguousSource || f.provider === 'unknown');
    if (hasUnknown) {
      options.push({ id: 'unknown', label: 'Unknown' });
    }
    const otherProviders = new Set();
    for (const f of favorites) {
      const p = (f.provider || '').toLowerCase();
      if (p === 'apple' || p === 'local') otherProviders.add(p);
    }
    for (const p of otherProviders) {
      options.push({ id: p, label: getProviderLabel(p) });
    }
    return options;
  }, [favorites]);

  // Filter and search
  const filteredList = useMemo(() => {
    return favorites.filter((item) => {
      if (filterProvider !== 'all') {
        const itemP = (item.provider || '').toLowerCase();
        const targetP = filterProvider.toLowerCase();
        if (targetP === 'unknown') {
          if (!item.isAmbiguousSource && itemP !== 'unknown' && itemP !== 'generic') return false;
        } else if (targetP === 'youtube' || targetP === 'youtube_music') {
          if (itemP !== 'youtube' && itemP !== 'youtube_music') return false;
        } else if (itemP !== targetP) {
          return false;
        }
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const titleMatch = item.title && item.title.toLowerCase().includes(q);
        const artistMatch = item.artist && item.artist.toLowerCase().includes(q);
        return titleMatch || artistMatch;
      }
      return true;
    });
  }, [favorites, filterProvider, searchQuery]);

  const handleRemove = (e, item) => {
    e.stopPropagation();
    removeFavorite(item.id);
    setFavorites(getAllFavorites());
  };

  const handlePlay = (item) => {
    if (typeof onPlayTrack === 'function') {
      onPlayTrack(item);
    } else {
      playFavoriteTrack(item, {
        onOpenUrl: (url) => window.island?.media?.openUrl?.(url),
      });
    }
  };

  const dynamicAccent = accentColor || 'var(--music-accent, var(--accent, #38bdf8))';

  return (
    <div className="fav-menu" style={{ '--menu-accent': dynamicAccent }}>
      {/* Header */}
      <div className="fav-menu__header">
        <div className="fav-menu__title-group">
          <h2 className="fav-menu__title">Favorites</h2>
          <p className="fav-menu__sub">Your music, across connected sources</p>
        </div>

        <div className="fav-menu__top-actions">
          {onClose ? (
            <button
              type="button"
              className="icon-btn icon-btn--sm fav-menu__close-btn"
              onClick={onClose}
              title="Return to Now Playing"
              aria-label="Close Favorites"
            >
              <Icon.Close width={14} height={14} />
            </button>
          ) : (
            <div className="fav-menu__top-icon" title="Favorites">
              <Icon.Heart width={18} height={18} />
            </div>
          )}
        </div>
      </div>

      {/* Compact Source Filters: All, Spotify, YouTube Music, Unknown */}
      <div className="fav-menu__toolbar">
        <div className="fav-menu__chips">
          {filterOptions.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`fav-chip ${filterProvider === opt.id ? 'is-active' : ''}`}
              onClick={() => setFilterProvider(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {favorites.length > 5 && (
          <div className="fav-menu__search-box">
            <Icon.Search width={12} height={12} className="fav-menu__search-icon" />
            <input
              type="text"
              className="fav-menu__search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search title or artist..."
            />
            {searchQuery && (
              <button
                type="button"
                className="fav-menu__search-clear"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>
        )}
      </div>

      {/* Content List with sleek custom scrollbar */}
      <div className="fav-menu__list-container">
        {favorites.length === 0 ? (
          <Empty
            icon={Icon.Heart}
            title="No favorites yet"
            hint="Click the heart button on any playing track or ask your assistant 'Add this to my favorites' to save your music library here."
          />
        ) : filteredList.length === 0 ? (
          <div className="fav-menu__no-results">
            <span>No songs found for this filter or search.</span>
          </div>
        ) : (
          <div className="fav-menu__list">
            {filteredList.map((item) => {
              const providerLabel = getProviderLabel(item.provider, item.isAmbiguousSource);
              const badgeClass = item.isAmbiguousSource || item.provider === 'unknown'
                ? 'unknown'
                : item.provider === SUPPORTED_PROVIDERS.SPOTIFY
                ? 'spotify'
                : item.provider === SUPPORTED_PROVIDERS.APPLE
                ? 'apple'
                : 'youtube';
              const badgeText = item.isAmbiguousSource || item.provider === 'unknown'
                ? 'Unknown'
                : item.provider === SUPPORTED_PROVIDERS.SPOTIFY
                ? 'Spotify'
                : item.provider === SUPPORTED_PROVIDERS.APPLE
                ? 'Apple Music'
                : 'YouTube Music';

              return (
                <div
                  key={item.id}
                  className="fav-item"
                  onClick={() => handlePlay(item)}
                  title={`Play ${item.title}`}
                  role="button"
                  tabIndex={0}
                >
                  {/* Artwork Thumbnail */}
                  <div className="fav-item__art-wrapper">
                    {item.artwork ? (
                      <img src={item.artwork} alt={item.title} className="fav-item__art" />
                    ) : (
                      <div className="fav-item__art-fallback">
                        <Icon.Music width={18} height={18} />
                      </div>
                    )}
                  </div>

                  {/* Metadata with Provider Indicator */}
                  <div className="fav-item__meta">
                    <div className="fav-item__title" title={item.title}>
                      {item.title}
                      <span className={`fav-item__provider-badge fav-item__provider-badge--${badgeClass}`}>
                        {badgeText}
                      </span>
                    </div>
                    <div className="fav-item__artist" title={item.artist || 'Unknown artist'}>
                      {item.artist || 'Unknown artist'}
                    </div>
                    {item.isAmbiguousSource && (
                      <div className="fav-item__reconnect-group" onClick={(e) => e.stopPropagation()}>
                        <span className="fav-item__reconnect-label">Connect:</span>
                        <button
                          type="button"
                          className="fav-item__reconnect-btn"
                          onClick={() => handleReconnect(item.id, SUPPORTED_PROVIDERS.YOUTUBE)}
                          title="Connect to YouTube Music"
                        >
                          YouTube Music
                        </button>
                        <button
                          type="button"
                          className="fav-item__reconnect-btn"
                          onClick={() => handleReconnect(item.id, SUPPORTED_PROVIDERS.SPOTIFY)}
                          title="Connect to Spotify"
                        >
                          Spotify
                        </button>
                      </div>
                    )}
                    {!item.isAmbiguousSource && (item.isUnresolvedIdentity || (item.provider === 'youtube' && !item.youtubeId)) && (
                      <div className="fav-item__reconnect-group" onClick={(e) => e.stopPropagation()}>
                        {companionStatus?.currentTrack?.videoId ? (
                          <button
                            type="button"
                            className="fav-item__reconnect-btn"
                            style={{ color: 'var(--music-accent, #38bdf8)' }}
                            onClick={() => {
                              healFavoriteWithExactId(item.id, companionStatus.currentTrack.videoId);
                              setFavorites(getAllFavorites());
                            }}
                            title={`Link to currently playing track (${companionStatus.currentTrack.title})`}
                          >
                            🔗 Link to Playing Track
                          </button>
                        ) : (
                          <span className="fav-item__unresolved-tag" style={{ fontSize: '10px', opacity: 0.6 }}>
                            Search on play
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Right Actions: Play + Heart */}
                  <div className="fav-item__actions">
                    <button
                      type="button"
                      className="fav-item__play-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePlay(item);
                      }}
                      title={`Play ${item.title}`}
                      aria-label={`Play ${item.title}`}
                    >
                      <Icon.Play width={13} height={13} />
                    </button>

                    <button
                      type="button"
                      className="fav-item__heart-btn"
                      onClick={(e) => handleRemove(e, item)}
                      title="Remove from favorites"
                      aria-label="Remove from favorites"
                      style={{ '--heart-color': '#ff3b69' }}
                    >
                      <Icon.HeartSolid width={15} height={15} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
