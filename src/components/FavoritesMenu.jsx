import React, { useState, useEffect, useMemo } from 'react';
import { getAllFavorites, removeFavorite, SUPPORTED_PROVIDERS } from '../lib/favorites';
import { Icon } from './icons';
import { Empty } from './bits';

/**
 * FavoritesMenu: Native Island favorites library interface.
 * Matches Island's existing glassmorphism surfaces, typography, dynamic album color,
 * and compact interaction patterns.
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

  // Compute available providers among saved songs
  const availableProviders = useMemo(() => {
    const set = new Set();
    for (const f of favorites) {
      if (f.provider && f.provider !== SUPPORTED_PROVIDERS.GENERIC) {
        set.add(f.provider);
      }
    }
    return Array.from(set);
  }, [favorites]);

  // Filter and search
  const filteredList = useMemo(() => {
    return favorites.filter((item) => {
      if (filterProvider !== 'all' && item.provider !== filterProvider) {
        return false;
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
          <div className="fav-menu__icon">
            <Icon.Heart width={15} height={15} filled />
          </div>
          <span className="fav-menu__title">Favorites</span>
          <span className="fav-menu__badge">{favorites.length}</span>
        </div>

        {onClose && (
          <button
            type="button"
            className="icon-btn icon-btn--sm"
            onClick={onClose}
            title="Return to Now Playing"
            aria-label="Close Favorites"
          >
            <Icon.Close width={14} height={14} />
          </button>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="fav-menu__toolbar">
        {availableProviders.length > 0 && (
          <div className="fav-menu__chips">
            <button
              type="button"
              className={`fav-chip ${filterProvider === 'all' ? 'is-active' : ''}`}
              onClick={() => setFilterProvider('all')}
            >
              All ({favorites.length})
            </button>
            {availableProviders.map((p) => {
              const label =
                p === SUPPORTED_PROVIDERS.SPOTIFY
                  ? 'Spotify'
                  : p === SUPPORTED_PROVIDERS.YOUTUBE
                  ? 'YouTube'
                  : p === SUPPORTED_PROVIDERS.APPLE
                  ? 'Apple Music'
                  : p;
              const count = favorites.filter((f) => f.provider === p).length;
              return (
                <button
                  key={p}
                  type="button"
                  className={`fav-chip ${filterProvider === p ? 'is-active' : ''}`}
                  onClick={() => setFilterProvider(p)}
                >
                  {label} ({count})
                </button>
              );
            })}
          </div>
        )}

        {favorites.length > 4 && (
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

      {/* Content List */}
      <div className="fav-menu__list-container">
        {favorites.length === 0 ? (
          <Empty
            icon="♥"
            title="No favorites yet"
            hint="Click the heart button on any playing track or ask Jadu 'Add this to my favorites' to save your music library here."
          />
        ) : filteredList.length === 0 ? (
          <div className="fav-menu__no-results">
            <span>No songs match your search or filter.</span>
          </div>
        ) : (
          <div className="fav-menu__list">
            {filteredList.map((item) => (
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
                      <Icon.Music width={16} height={16} />
                    </div>
                  )}
                  <div className="fav-item__play-overlay">
                    <Icon.Play width={14} height={14} />
                  </div>
                </div>

                {/* Metadata */}
                <div className="fav-item__meta">
                  <div className="fav-item__title" title={item.title}>
                    {item.title}
                  </div>
                  <div className="fav-item__artist" title={item.artist}>
                    {item.artist || 'Unknown artist'}
                  </div>
                </div>

                {/* Provider Pill */}
                {item.provider && item.provider !== 'generic' && (
                  <span className={`fav-item__provider fav-item__provider--${item.provider}`}>
                    {item.provider === 'spotify'
                      ? 'Spotify'
                      : item.provider === 'youtube'
                      ? 'YouTube'
                      : item.provider === 'apple'
                      ? 'Apple'
                      : item.provider}
                  </span>
                )}

                {/* Remove Button */}
                <button
                  type="button"
                  className="fav-item__heart-btn"
                  onClick={(e) => handleRemove(e, item)}
                  title="Remove from favorites"
                  aria-label="Remove from favorites"
                >
                  <Icon.Heart width={14} height={14} filled />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
