import React, { useState, useMemo } from 'react';
import { Icon } from './icons';
import { playFavoriteTrack, getFriendlyProviderName } from '../lib/music-actions';
import { SUPPORTED_PROVIDERS } from '../lib/favorites';

/**
 * InlineFavorites: Rich interactive Favorites collection rendered directly inside Agent chat turns.
 * Satisfies Pass 2.2.6 Part 3:
 * - Album artwork with fallback
 * - Song title & artist
 * - Source provider badge (Spotify, YouTube Music, Unknown)
 * - Provider-aware Play action (never redirects away for browsing)
 * - Compact horizontal or scrollable vertical list with filtering
 */
export default function InlineFavorites({ tracks = [], onPlay = null }) {
  const [filter, setFilter] = useState('all');
  const [playingId, setPlayingId] = useState(null);

  const availableProviders = useMemo(() => {
    const set = new Set();
    for (const t of tracks) {
      const p = (t.provider || '').toLowerCase();
      if (p) set.add(p);
    }
    return Array.from(set);
  }, [tracks]);

  const filteredTracks = useMemo(() => {
    if (filter === 'all') return tracks;
    return tracks.filter((t) => {
      const p = (t.provider || '').toLowerCase();
      if (filter === 'spotify') return p === 'spotify';
      if (filter === 'youtube') return p === 'youtube' || p === 'youtube_music';
      return p === filter;
    });
  }, [tracks, filter]);

  const handlePlayTrack = (track, e) => {
    e?.stopPropagation?.();
    setPlayingId(track.id || track.title);

    if (typeof onPlay === 'function') {
      onPlay(track);
    } else {
      playFavoriteTrack(track, {
        onOpenUrl: (url) => window.island?.media?.openUrl?.(url),
        onDispatchCompanion: (cmd) => {
          try {
            return window.island?.companion?.dispatchCommand?.(cmd);
          } catch {
            return null;
          }
        },
        onControl: (act) => window.island?.media?.control?.(act),
      });
    }

    setTimeout(() => {
      setPlayingId(null);
    }, 2000);
  };

  if (!tracks || tracks.length === 0) {
    return null;
  }

  const getBadgeClass = (item) => {
    if (item.isAmbiguousSource || item.provider === 'unknown') return 'unknown';
    if (item.provider === SUPPORTED_PROVIDERS.SPOTIFY) return 'spotify';
    if (item.provider === SUPPORTED_PROVIDERS.APPLE) return 'apple';
    return 'youtube';
  };

  const getBadgeText = (item) => {
    if (item.isAmbiguousSource || item.provider === 'unknown') return 'Unknown';
    if (item.provider === SUPPORTED_PROVIDERS.SPOTIFY) return 'Spotify';
    if (item.provider === SUPPORTED_PROVIDERS.APPLE) return 'Apple Music';
    return 'YouTube Music';
  };

  return (
    <div className="inline-favs" role="region" aria-label="Favorite Songs Collection">
      {/* Optional Compact Filter Pills if multiple sources exist */}
      {availableProviders.length > 1 && (
        <div className="inline-favs__filters">
          <button
            type="button"
            className={`inline-favs__filter-chip ${filter === 'all' ? 'is-active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All ({tracks.length})
          </button>
          {availableProviders.includes('spotify') && (
            <button
              type="button"
              className={`inline-favs__filter-chip ${filter === 'spotify' ? 'is-active' : ''}`}
              onClick={() => setFilter('spotify')}
            >
              Spotify
            </button>
          )}
          {(availableProviders.includes('youtube') || availableProviders.includes('youtube_music')) && (
            <button
              type="button"
              className={`inline-favs__filter-chip ${filter === 'youtube' ? 'is-active' : ''}`}
              onClick={() => setFilter('youtube')}
            >
              YouTube Music
            </button>
          )}
        </div>
      )}

      {/* Interactive Song List */}
      <div className="inline-favs__list">
        {filteredTracks.map((item, idx) => {
          const isPlayingThis = playingId === (item.id || item.title);
          const badgeClass = getBadgeClass(item);
          const badgeText = getBadgeText(item);

          return (
            <div
              key={item.id || `${item.title}-${idx}`}
              className={`inline-favs__item ${isPlayingThis ? 'is-playing' : ''}`}
              onClick={(e) => handlePlayTrack(item, e)}
              role="button"
              tabIndex={0}
              title={`Play ${item.title}`}
            >
              {/* Ordinal indicator */}
              <span className="inline-favs__index">{idx + 1}</span>

              {/* Artwork thumbnail */}
              <div className="inline-favs__art-wrapper">
                {item.artwork ? (
                  <img src={item.artwork} alt={item.title} className="inline-favs__art" />
                ) : (
                  <div className="inline-favs__art-fallback">
                    <Icon.Music width={14} height={14} />
                  </div>
                )}
              </div>

              {/* Title & Artist */}
              <div className="inline-favs__info">
                <div className="inline-favs__title-row">
                  <span className="inline-favs__title" title={item.title}>
                    {item.title}
                  </span>
                  <span className={`inline-favs__badge inline-favs__badge--${badgeClass}`}>
                    {badgeText}
                  </span>
                </div>
                <div className="inline-favs__artist" title={item.artist || 'Unknown artist'}>
                  {item.artist || 'Unknown artist'}
                </div>
              </div>

              {/* Play Action */}
              <button
                type="button"
                className={`inline-favs__play-btn ${isPlayingThis ? 'is-active' : ''}`}
                onClick={(e) => handlePlayTrack(item, e)}
                aria-label={`Play ${item.title}`}
                title={`Play ${item.title}`}
              >
                <Icon.Play width={11} height={11} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
