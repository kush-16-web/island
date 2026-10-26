import { useEffect, useRef, useState } from 'react';
import { Equalizer } from './bits';
import SongArtPoster from './SongArtPoster';
import {
  enrichTrackMetadata,
  extractYouTubeIdFromMedia,
  getYouTubePosterCandidates,
  upgradeProviderArtUrl,
} from '../lib/art-resolver';

export default function VideoPiP({
  media,
  accentColor,
  displayPosition = 0,
  youtubeId,
  stream,
  streamActive = false,
  showSongArt = false,
  posterUrl,
}) {
  const videoRef = useRef(null);
  const [activeYtId, setActiveYtId] = useState(() => (
    youtubeId || media?.youtubeId || extractYouTubeIdFromMedia(media) || null
  ));

  // HD official studio artwork resolved from public catalog
  const [hdArtUrl, setHdArtUrl] = useState(null);

  // High-resolution poster candidates and fallback index
  const [candidateIndex, setCandidateIndex] = useState(0);

  const playing = media?.status === 'playing';
  const hasArt = Boolean(media?.art);

  // Immediate reset on track change to prevent stale artwork retention
  useEffect(() => {
    setHdArtUrl(null);
    setCandidateIndex(0);
    const directId = youtubeId || media?.youtubeId || extractYouTubeIdFromMedia(media) || null;
    setActiveYtId(directId);
  }, [media?.title, media?.artist, media?.youtubeId, youtubeId]);

  // Background enrich HD artwork whenever song changes
  useEffect(() => {
    let cancelled = false;
    if (!media?.title) {
      return;
    }

    enrichTrackMetadata(media.title, media.artist || '').then((res) => {
      if (!cancelled && res?.artwork) {
        setHdArtUrl(res.artwork);
      }
      if (!cancelled && res?.youtubeId && !activeYtId) {
        setActiveYtId(res.youtubeId);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [media?.title, media?.artist]);

  // Construct candidates list in order of priority (Highest resolution first)
  const posterCandidates = [];
  if (posterUrl) {
    posterCandidates.push(posterUrl);
  }
  if (media?.art) {
    const upgraded = upgradeProviderArtUrl(media.art);
    if (!posterCandidates.includes(upgraded)) {
      posterCandidates.push(upgraded);
    }
    if (!posterCandidates.includes(media.art)) {
      posterCandidates.push(media.art);
    }
  }
  if (hdArtUrl && !posterCandidates.includes(hdArtUrl)) {
    posterCandidates.push(hdArtUrl);
  }
  if (activeYtId) {
    const ytPosters = getYouTubePosterCandidates(activeYtId);
    for (const p of ytPosters) {
      if (!posterCandidates.includes(p)) {
        posterCandidates.push(p);
      }
    }
  }

  const currentPosterUrl = posterCandidates[candidateIndex] || posterUrl || media?.art || '';

  const handlePosterError = () => {
    if (candidateIndex < posterCandidates.length - 1) {
      setCandidateIndex((prev) => prev + 1);
    }
  };

  // DRM platforms (Netflix, Disney+, Prime Video) where video capture is DRM-blacked out
  const isDrmPlatform = Boolean(
    (media?.app && /netflix|prime|disney|hulu|hbo|max\.com/i.test(media.app)) ||
    (media?.title && /netflix/i.test(media.title))
  );

  // Bind local stream if available (e.g. VLC / MPV local video window capture)
  useEffect(() => {
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.muted = true;
      videoRef.current.playsInline = true;
      videoRef.current.play().catch(() => {});
    }
  }, [stream]);

  // Living Canvas fine-art mode is dormant during Pass 2.2.6 while building toward Cinema Mode
  const ENABLE_CANVAS_ART = false;

  const showLocalVideo = !isDrmPlatform && streamActive && Boolean(stream);

  return (
    <div className="cinema-screen">
      <div className="cinema-screen__stage">
        {/* 0. Living Canvas Fine-Art Mode (Dormant during Pass 2.2.6) */}
        {ENABLE_CANVAS_ART && showSongArt ? (
          <SongArtPoster media={media} accentColor={accentColor} />
        ) : (
          <>
            {/* 1. Local Video Window Capture (for VLC / MPV dedicated players only) */}
            {showLocalVideo && (
              <video
                ref={videoRef}
                className="cinema-screen__video is-active"
                autoPlay
                playsInline
                muted
              />
            )}

            {/* 2. Cinematic High-Resolution Artwork / Backdrop Poster (No iframe, no YouTube errors) */}
            {!showLocalVideo && (
              <div className="cinema-screen__backdrop">
                {/* Ambient Blurred Aura Layer for seamless, vibrant edge blending */}
                <div
                  className="cinema-screen__backdrop-ambient"
                  style={{
                    backgroundImage: currentPosterUrl ? `url("${currentPosterUrl}")` : undefined,
                  }}
                />

                {currentPosterUrl ? (
                  <img
                    src={currentPosterUrl}
                    alt=""
                    className="cinema-screen__poster-img"
                    onError={handlePosterError}
                  />
                ) : hasArt ? (
                  <img
                    src={media.art}
                    alt=""
                    className="cinema-screen__poster-img"
                  />
                ) : (
                  <div className="cinema-screen__glow-gradient" />
                )}

                {/* Ambient Backdrop Depth Overlay */}
                <div className="cinema-screen__poster-overlay">
                  <div className="cinema-screen__center-eq">
                    <Equalizer color={accentColor || 'var(--accent, #38bdf8)'} playing={playing} />
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
