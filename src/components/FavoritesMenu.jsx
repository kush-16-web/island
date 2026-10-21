import React, { useState, useEffect, useMemo } from 'react';
import { getAllFavorites, removeFavorite, updateFavorite, SUPPORTED_PROVIDERS } from '../lib/favorites';
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
              provider: item.provider && item.provider !== 'generic'
                ? item.provider
                : (enriched.provider || item.provider),
            });
            setFavorites(getAllFavorites());
          }
        } catch {}
      });
    }
    return () => { isMounted = false; };
  }, [favorites.length]);

  const getProviderLabel = (provider) => {
    if (provider === SUPPORTED_PROVIDERS.SPOTIFY) return 'Spotify';
    if (provider === SUPPORTED_PROVIDERS.YOUTUBE) return 'YouTube Music';
    if (provider === SUPPORTED_PROVIDERS.APPLE) return 'Apple Music';
    return provider ? (provider.charAt(0).toUpperCase() + provider.slice(1)) : '';
  };

  // Compute available providers among saved songs dynamically (No hardcoded phantom chips)
  const availableProviders = useMemo(() => {
    const set = new Set();
    for (const f of favorites) {
      const p = (f.provider || '').toLowerCase();
      if (p && p !== 'generic' && p !== 'unknown' && p !== 'local') {
        set.add(p);
      }
    }
    return Array.from(set);
  }, [favorites]);

  // Filter and search
  const filteredList = useMemo(() => {
    return favorites.filter((item) => {
      if (filterProvider !== 'all') {
        const itemP = (item.provider || '').toLowerCase();
        const targetP = filterProvider.toLowerCase();
        if (itemP !== targetP) return false;
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
    } else if (item.playableUrl && window.island?.media?.openUrl) {
      window.island.media.openUrl(item.playableUrl);
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

      {/* Dynamic Filter Chips (Only show sources present in favorites) */}
      <div className="fav-menu__toolbar">
        <div className="fav-menu__chips">
          <button
            type="button"
            className={`fav-chip ${filterProvider === 'all' ? 'is-active' : ''}`}
            onClick={() => setFilterProvider('all')}
          >
            All
          </button>
          {availableProviders.map((p) => {
            const label = getProviderLabel(p);
            return (
              <button
                key={p}
                type="button"
                className={`fav-chip ${filterProvider === p ? 'is-active' : ''}`}
                onClick={() => setFilterProvider(p)}
              >
                {label}
              </button>
            );
          })}
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
            icon="♥"
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
              const providerLabel = getProviderLabel(item.provider);
              const subtext = item.artist
                ? `${item.artist}${providerLabel ? ` · ${providerLabel}` : ''}`
                : (providerLabel || 'Track');

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

                  {/* Metadata */}
                  <div className="fav-item__meta">
                    <div className="fav-item__title" title={item.title}>
                      {item.title}
                    </div>
                    <div className="fav-item__artist" title={subtext}>
                      {subtext}
                    </div>
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
