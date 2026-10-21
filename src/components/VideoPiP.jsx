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
}) {
  const iframeRef = useRef(null);
  const videoRef = useRef(null);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [activeYtId, setActiveYtId] = useState(() => (
    youtubeId || media?.youtubeId || extractYouTubeIdFromMedia(media) || null
  ));

  // HD official studio artwork resolved from public catalog
  const [hdArtUrl, setHdArtUrl] = useState(null);

  // High-resolution poster candidates and fallback index
  const [candidateIndex, setCandidateIndex] = useState(0);

  const playing = media?.status === 'playing';
  const hasArt = Boolean(media?.art);

  // Background enrich HD artwork whenever song changes
  useEffect(() => {
    let cancelled = false;
    if (!media?.title) {
      setHdArtUrl(null);
      return;
    }

    enrichTrackMetadata(media.title, media.artist || '').then((res) => {
      if (!cancelled && res?.artwork) {
        setHdArtUrl(res.artwork);
        setCandidateIndex(0);
      }
      if (!cancelled && res?.youtubeId && !activeYtId) {
        setActiveYtId(res.youtubeId);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [media?.title, media?.artist]);

  // Sync / resolve YouTube ID dynamically if not supplied
  useEffect(() => {
    const directId = youtubeId || media?.youtubeId || extractYouTubeIdFromMedia(media);
    if (directId) {
      setActiveYtId(directId);
      setCandidateIndex(0);
      return;
    }

    if (window.island?.media?.resolveYouTubeId && media?.title) {
      window.island.media.resolveYouTubeId(media.title).then((resolved) => {
        if (resolved) {
          setActiveYtId(resolved);
          setCandidateIndex(0);
        }
      });
    }
  }, [youtubeId, media?.youtubeId, media?.title, media?.art]);

  // Construct candidates list in order of priority (Highest resolution first)
  const posterCandidates = [];
  if (hdArtUrl) {
    posterCandidates.push(hdArtUrl);
  }
  if (activeYtId) {
    posterCandidates.push(...getYouTubePosterCandidates(activeYtId));
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

  const currentPosterUrl = posterCandidates[candidateIndex] || media?.art || '';

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

  // Synchronize YouTube embed play / pause state with SMTC
  useEffect(() => {
    if (!iframeRef.current?.contentWindow || !activeYtId) return;
    const cmd = playing ? 'playVideo' : 'pauseVideo';
    try {
      iframeRef.current.contentWindow.postMessage(
        JSON.stringify({ event: 'command', func: cmd, args: '' }),
        '*'
      );
    } catch {}
  }, [playing, activeYtId]);

  // Synchronize YouTube embed seek position when seeking in SMTC
  const lastSyncSec = useRef(Math.floor((displayPosition || 0) / 1000));
  useEffect(() => {
    if (!iframeRef.current?.contentWindow || !activeYtId) return;
    const currentSec = Math.floor((displayPosition || 0) / 1000);
    if (Math.abs(currentSec - lastSyncSec.current) >= 4) {
      lastSyncSec.current = currentSec;
      try {
        iframeRef.current.contentWindow.postMessage(
          JSON.stringify({ event: 'command', func: 'seekTo', args: [currentSec, true] }),
          '*'
        );
      } catch {}
    }
  }, [displayPosition, activeYtId]);

  const startSec = Math.max(0, Math.floor((displayPosition || 0) / 1000));

  return (
    <div className="cinema-screen">
      <div className="cinema-screen__stage">
        {/* 0. Living Canvas Fine-Art Mode */}
        {showSongArt ? (
          <SongArtPoster media={media} accentColor={accentColor} />
        ) : (
          <>
            {/* 1. Pure YouTube Embedded Video Player (No desktop bleed, no browser UI) */}
            {!isDrmPlatform && activeYtId && (
              <iframe
                ref={iframeRef}
                src={`https://www.youtube-nocookie.com/embed/${activeYtId}?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0&iv_load_policy=3&playsinline=1&enablejsapi=1&start=${startSec}`}
                className={`cinema-screen__iframe${iframeLoaded ? ' is-ready' : ''}`}
                title="Cinema Video Stream"
                allow="autoplay; encrypted-media; picture-in-picture"
                onLoad={() => setIframeLoaded(true)}
              />
            )}

            {/* 2. Local Video Window Capture (for VLC / MPV dedicated players) */}
            {!isDrmPlatform && !activeYtId && streamActive && stream && (
              <video
                ref={videoRef}
                className="cinema-screen__video is-active"
                autoPlay
                playsInline
                muted
              />
            )}

            {/* 3. Cinematic High-Resolution Backdrop Poster */}
            {(isDrmPlatform || (!activeYtId && !streamActive) || (!iframeLoaded && activeYtId)) && (
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
