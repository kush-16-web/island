import React, { useState, useMemo } from 'react';
import { Icon } from './icons';
import { playFavoriteTrack } from '../lib/music-actions';

/**
 * InlineFavorites: Compact, high-density Favorites collection rendered directly inside Agent chat turns.
 * Satisfies Pass 2.2.6.2 Part C:
 * - Ultra-compact row height (~46-50px) allowing multiple songs to be visible simultaneously
 * - Small square album artwork (~36px)
 * - Single-line truncated title & artist in muted typography
 * - Subtle monochrome provider indicator
 * - Small monochrome Play control
 * - Compact index for clear voice references ("Play the third one")
 * - Bounded, independently scrollable list area with smooth mousewheel & trackpad navigation
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

  const getProviderLabel = (item) => {
    if (item.isAmbiguousSource || item.provider === 'unknown') return 'Unknown';
    if (item.provider === 'spotify') return 'Spotify';
    if (item.provider === 'apple') return 'Apple Music';
    return 'YouTube Music';
  };

  return (
    <div className="inline-favs" role="region" aria-label="Favorite Songs Collection">
      {/* Compact Source Filters */}
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

      {/* High-Density Compact Song List */}
      <div className="inline-favs__list" tabIndex={0} role="list">
        {filteredTracks.map((item, idx) => {
          const isPlayingThis = playingId === (item.id || item.title);
          const providerText = getProviderLabel(item);

          return (
            <div
              key={item.id || `${item.title}-${idx}`}
              className={`inline-favs__item ${isPlayingThis ? 'is-playing' : ''}`}
              onClick={(e) => handlePlayTrack(item, e)}
              role="listitem"
              tabIndex={0}
              title={`Play ${item.title}`}
            >
              {/* Voice-reference index */}
              <span className="inline-favs__index">{idx + 1}</span>

              {/* Compact artwork thumbnail */}
              <div className="inline-favs__art-wrapper">
                {item.artwork ? (
                  <img src={item.artwork} alt="" className="inline-favs__art" loading="lazy" />
                ) : (
                  <div className="inline-favs__art-fallback">
                    <Icon.Music width={13} height={13} />
                  </div>
                )}
              </div>

              {/* Track Title, Artist & Provider */}
              <div className="inline-favs__info">
                <div className="inline-favs__title" title={item.title}>
                  {item.title}
                </div>
                <div className="inline-favs__meta-row">
                  <span className="inline-favs__artist" title={item.artist || 'Unknown artist'}>
                    {item.artist || 'Unknown artist'}
                  </span>
                  <span className="inline-favs__provider-dot">•</span>
                  <span className="inline-favs__provider">{providerText}</span>
                </div>
              </div>

              {/* Monochrome Play Control */}
              <button
                type="button"
                className={`inline-favs__play-btn ${isPlayingThis ? 'is-active' : ''}`}
                onClick={(e) => handlePlayTrack(item, e)}
                aria-label={`Play ${item.title}`}
                title={`Play ${item.title}`}
              >
                <Icon.Play width={10} height={10} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
