import { useEffect, useState } from 'react';
import { formatTrackTime } from '../lib/format';
import { useLyrics } from '../hooks/useLyrics';
import { Art, Empty } from './bits';
import { Icon } from './icons';
import MiniLyrics from './MiniLyrics';
import FullLyrics from './FullLyrics';

export default function NowPlaying({
  media,
  platform,
  onControl,
  accentColor,
  onLyricsViewChange,
}) {
  const [viewMode, setViewMode] = useState('player'); // 'player' | 'lyrics'
  const playing = media.status === 'playing';
  const [localNow, setLocalNow] = useState(Date.now);

  useEffect(() => {
    if (!playing) return;
    const interval = setInterval(() => setLocalNow(Date.now()), 200);
    return () => clearInterval(interval);
  }, [playing, media.reportedAt, media.positionMs]);

  const elapsed = playing ? Math.max(0, localNow - media.reportedAt) : 0;
  const hasDuration = media.durationMs > 0;
  const position = Math.min(hasDuration ? media.durationMs : Infinity, Math.max(0, media.positionMs + elapsed));
  const pct = hasDuration ? Math.min(100, Math.max(0, (position / media.durationMs) * 100)) : 0;
  const seed = `${media.title}${media.artist}`;

  // Fetch and synchronize lyrics
  const { lyricsData, loading, activeLineIndex } = useLyrics(media, position);

  // Notify parent of view mode change for dynamic height adjustment
  const handleSetViewMode = (mode) => {
    setViewMode(mode);
    onLyricsViewChange?.(mode === 'lyrics');
  };

  // Reset to player view if active track changes
  useEffect(() => {
    handleSetViewMode('player');
  }, [media.title, media.artist]);

  if (!media.active) {
    const onWindows = platform === 'win32';
    return (
      <Empty
        icon={Icon.Music}
        title="Nothing playing"
        hint={
          onWindows
            ? 'Start a song in Spotify, YouTube Music or any browser tab and it shows up here.'
            : 'Now playing reads the Windows media session, so it only works on Windows.'
        }
      />
    );
  }

  if (viewMode === 'lyrics') {
    return (
      <FullLyrics
        media={media}
        lyricsData={lyricsData}
        activeLineIndex={activeLineIndex}
        currentPositionMs={position}
        onClose={() => handleSetViewMode('player')}
        onControl={onControl}
        accentColor={accentColor}
      />
    );
  }

  return (
    <div className="np">
      <div className="np__top">
        <Art src={media.art} seed={seed} size={88} radius={18} />
        <div className="np__meta">
          <div className="np__title">{media.title}</div>
          <div className="np__artist">{media.artist || 'Unknown artist'}</div>
          {media.app && <span className="chip-app">{media.app}</span>}
        </div>
        <MiniLyrics
          lyricsData={lyricsData}
          loading={loading}
          activeLineIndex={activeLineIndex}
          accentColor={accentColor}
          onClick={() => handleSetViewMode('lyrics')}
        />
      </div>

      <div className="np__progress">
        <span>{formatTrackTime(position)}</span>
        <div className="np__bar" aria-hidden="true">
          {hasDuration && (
            <div
              className="np__fill"
              style={{
                width: `${pct}%`,
                background: accentColor || 'var(--accent)',
              }}
            />
          )}
        </div>
        <span>{hasDuration ? `-${formatTrackTime(media.durationMs - position)}` : 'Live'}</span>
      </div>

      <div className="np__controls">
        <button type="button" className="icon-btn" aria-label="Previous track" onClick={() => onControl('previous')}>
          <Icon.Prev width={22} height={22} />
        </button>
        <button type="button" className="play-btn" aria-label={playing ? 'Pause' : 'Play'} onClick={() => onControl('playpause')}>
          {playing ? <Icon.Pause width={22} height={22} /> : <Icon.Play width={22} height={22} />}
        </button>
        <button type="button" className="icon-btn" aria-label="Next track" onClick={() => onControl('next')}>
          <Icon.Next width={22} height={22} />
        </button>
      </div>
    </div>
  );
}
