import { useEffect, useRef, useState } from 'react';
import { Equalizer } from './bits';

export default function VideoPiP({
  media,
  accentColor,
  displayPosition = 0,
  youtubeId,
  stream,
  streamActive = false,
}) {
  const iframeRef = useRef(null);
  const videoRef = useRef(null);
  const [iframeLoaded, setIframeLoaded] = useState(false);

  const playing = media?.status === 'playing';
  const hasArt = Boolean(media?.art);

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
    if (!iframeRef.current?.contentWindow || !youtubeId) return;
    const cmd = playing ? 'playVideo' : 'pauseVideo';
    try {
      iframeRef.current.contentWindow.postMessage(
        JSON.stringify({ event: 'command', func: cmd, args: '' }),
        '*'
      );
    } catch {}
  }, [playing, youtubeId]);

  // Synchronize YouTube embed seek position when seeking in SMTC
  const lastSyncSec = useRef(Math.floor((displayPosition || 0) / 1000));
  useEffect(() => {
    if (!iframeRef.current?.contentWindow || !youtubeId) return;
    const currentSec = Math.floor((displayPosition || 0) / 1000);
    // Sync if time difference exceeds 4 seconds (e.g. user jumped/seeked)
    if (Math.abs(currentSec - lastSyncSec.current) >= 4) {
      lastSyncSec.current = currentSec;
      try {
        iframeRef.current.contentWindow.postMessage(
          JSON.stringify({ event: 'command', func: 'seekTo', args: [currentSec, true] }),
          '*'
        );
      } catch {}
    }
  }, [displayPosition, youtubeId]);

  const startSec = Math.max(0, Math.floor((displayPosition || 0) / 1000));

  return (
    <div className="cinema-screen">
      <div className="cinema-screen__stage">
        {/* 1. Pure YouTube Embedded Video Player (No desktop bleed, no browser UI) */}
        {!isDrmPlatform && youtubeId && (
          <iframe
            ref={iframeRef}
            src={`https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0&iv_load_policy=3&playsinline=1&enablejsapi=1&start=${startSec}`}
            className={`cinema-screen__iframe${iframeLoaded ? ' is-ready' : ''}`}
            title="Cinema Video Stream"
            allow="autoplay; encrypted-media; picture-in-picture"
            onLoad={() => setIframeLoaded(true)}
          />
        )}

        {/* 2. Local Video Window Capture (for VLC / MPV dedicated players) */}
        {!isDrmPlatform && !youtubeId && streamActive && stream && (
          <video
            ref={videoRef}
            className="cinema-screen__video is-active"
            autoPlay
            playsInline
            muted
          />
        )}

        {/* 3. Cinematic Backdrop Poster (for Netflix/DRM, loading states, or theater standby) */}
        {(isDrmPlatform || (!youtubeId && !streamActive) || (!iframeLoaded && youtubeId)) && (
          <div className="cinema-screen__backdrop">
            {hasArt ? (
              <img src={media.art} alt="" className="cinema-screen__poster-img" />
            ) : (
              <div className="cinema-screen__glow-gradient" />
            )}
            <div className="cinema-screen__poster-overlay">
              <div className="cinema-screen__center-eq">
                <Equalizer color={accentColor || 'var(--accent)'} playing={playing} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
