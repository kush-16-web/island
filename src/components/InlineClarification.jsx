import React from 'react';
import { Icon } from './icons';
import { playFavoriteTrack } from '../lib/music-actions';

/**
 * InlineClarification: Compact candidate row(s) rendered directly inside Agent turns.
 * Satisfies Pass 2.2.6.2 Part A3:
 * - Shows up to 3 real candidates when clarification is needed
 * - Compact row height (~44-48px) matching the compact design system
 * - Single-click "Play" or click row to execute candidate directly through original provider
 * - Displays title, artist, artwork, and ordinal reference for voice interaction
 */
export default function InlineClarification({ candidates = [], onSelect = null }) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;

  const handleSelect = (track, e) => {
    e?.stopPropagation?.();
    if (typeof onSelect === 'function') {
      onSelect(track);
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
  };

  const displayList = candidates.slice(0, 3);

  return (
    <div className="inline-clarification" role="region" aria-label="Suggested Candidates">
      <div className="inline-clarification__list">
        {displayList.map((track, idx) => {
          const provider = (track.provider || 'youtube').toLowerCase();
          const providerLabel = provider === 'spotify' ? 'Spotify' : provider === 'apple' ? 'Apple Music' : 'YouTube Music';

          return (
            <div
              key={track.id || `${track.title}-${idx}`}
              className="inline-clarification__row"
              onClick={(e) => handleSelect(track, e)}
              role="button"
              tabIndex={0}
              title={`Play ${track.title} by ${track.artist || 'Unknown'}`}
            >
              <span className="inline-clarification__index">{idx + 1}</span>

              <div className="inline-clarification__art-box">
                {track.artwork ? (
                  <img src={track.artwork} alt={track.title} className="inline-clarification__art" />
                ) : (
                  <div className="inline-clarification__art-fallback">
                    <Icon.Music width={13} height={13} />
                  </div>
                )}
              </div>

              <div className="inline-clarification__info">
                <div className="inline-clarification__title" title={track.title}>
                  {track.title}
                </div>
                <div className="inline-clarification__sub">
                  <span className="inline-clarification__artist" title={track.artist || 'Unknown'}>
                    {track.artist || 'Unknown artist'}
                  </span>
                  <span className="inline-clarification__provider">
                    {providerLabel}
                  </span>
                </div>
              </div>

              <button
                type="button"
                className="inline-clarification__play-btn"
                onClick={(e) => handleSelect(track, e)}
                aria-label={`Play ${track.title}`}
                title={`Play ${track.title}`}
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
