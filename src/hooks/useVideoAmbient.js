import { useEffect, useRef, useState } from 'react';
import { island } from '../lib/bridge';

const CANVAS_W = 32;
const CANVAS_H = 18;

/**
 * Checks if the current media session represents a video rather than dedicated music.
 */
export function isVideoMedia(media) {
  if (!media || !media.active) return false;
  const app = (media.app || '').toLowerCase();
  const title = (media.title || '').toLowerCase();
  const provider = (media.provider || '').toLowerCase();

  // Explicit music applications or tracks with artists are always treated as music
  if (
    /spotify|apple music|itunes|tidal|deezer|foobar|amazon music|pandora|qobuz|winamp|youtube music|yt music|music\.youtube/i.test(app) ||
    /spotify|apple|youtube_music|ytmusic/i.test(provider) ||
    Boolean(media.artist && media.artist.trim().length > 0)
  ) {
    return false;
  }

  // Dedicated video apps
  if (/netflix|vlc|mpv|potplayer/i.test(app)) {
    return true;
  }

  // Browser sessions playing trailers, gameplay, or teasers without artist metadata
  if (/chrome|edge|brave|firefox/i.test(app)) {
    if (!media.artist && /^(official\s+)?(trailer|teaser)\b|clip|gameplay|teaser|doomsday/i.test(title)) {
      return true;
    }
  }

  return false;
}

/**
 * Extract YouTube videoId from title, art URL, or via search resolution
 */
export function extractYouTubeId(media) {
  if (!media) return null;
  if (media.youtubeId) return media.youtubeId;

  const title = media.title || '';
  const art = media.art || '';

  const mTitle = title.match(/watch\?v=([a-zA-Z0-9_-]{11})/);
  if (mTitle) return mTitle[1];

  const mArt = art.match(/\/vi(?:_webp)?\/([a-zA-Z0-9_-]{11})\//);
  if (mArt) return mArt[1];

  return null;
}

/**
 * Samples a canvas or image to extract dominant saturated color (ignoring letterbox black bars & whites)
 */
function sampleColorData(imgData) {
  let totalR = 0;
  let totalG = 0;
  let totalB = 0;
  let totalWeight = 0;

  for (let i = 0; i < imgData.length; i += 4) {
    const r = imgData[i];
    const g = imgData[i + 1];
    const b = imgData[i + 2];

    const brightness = (r + g + b) / 3;
    if (brightness < 22 || brightness > 248) continue;

    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    const sat = maxC > 0 ? (maxC - minC) / maxC : 0;
    const weight = 1 + sat * 3;

    totalR += r * weight;
    totalG += g * weight;
    totalB += b * weight;
    totalWeight += weight;
  }

  if (totalWeight < 1) return null;

  return `rgb(${Math.round(totalR / totalWeight)}, ${Math.round(totalG / totalWeight)}, ${Math.round(totalB / totalWeight)})`;
}

/**
 * useVideoAmbient: Manages pure YouTube video ID resolution, native stage color sampling,
 * and media stream fallback for local video players.
 */
export function useVideoAmbient(media, playing) {
  const [ambientColor, setAmbientColor] = useState(null);
  const [stream, setStream] = useState(null);
  const [streamActive, setStreamActive] = useState(false);
  const [youtubeId, setYoutubeId] = useState(() => extractYouTubeId(media));

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const streamRef = useRef(null);

  const isVideo = isVideoMedia(media);

  // Initialize hidden video & offscreen canvas on mount
  useEffect(() => {
    const video = document.createElement('video');
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    videoRef.current = video;

    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    canvasRef.current = canvas;
    ctxRef.current = canvas.getContext('2d', { willReadFrequently: true });

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      video.srcObject = null;
    };
  }, []);

  // Real-time synchronization from companion Chrome extension
  useEffect(() => {
    if (!island?.on) return undefined;
    return island.on('video:ambient-update', (data) => {
      if (data?.videoId) setYoutubeId(data.videoId);
      if (data?.color) setAmbientColor(data.color);
    });
  }, []);

  // Fast YouTube ID resolution
  useEffect(() => {
    let cancelled = false;

    if (!isVideo || !media?.active) {
      setYoutubeId(null);
      return undefined;
    }

    const directId = extractYouTubeId(media);
    if (directId) {
      setYoutubeId(directId);
      return undefined;
    }

    // If title exists and no direct ID found, ask backend resolver
    if (island?.media?.resolveYouTubeId && media.title) {
      island.media.resolveYouTubeId(media.title).then((resolved) => {
        if (!cancelled && resolved) {
          setYoutubeId(resolved);
        }
      });
    }

    return () => {
      cancelled = true;
    };
  }, [isVideo, media?.app, media?.title, media?.art]);

  // Real-time Ambient Mode Color Sampling:
  // Native Electron stage sampling captures the live compositor frame directly
  useEffect(() => {
    if (!isVideo || !playing) return undefined;

    let isSampling = false;
    const interval = setInterval(async () => {
      if (isSampling) return;
      isSampling = true;

      try {
        // Local HTML5 video element sampling (for local video player streams)
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = ctxRef.current;
        if (video && canvas && ctx && video.readyState >= 2 && video.videoWidth > 0) {
          ctx.drawImage(video, 0, 0, CANVAS_W, CANVAS_H);
          const imgData = ctx.getImageData(0, 0, CANVAS_W, CANVAS_H).data;
          const color = sampleColorData(imgData);
          if (color) {
            setAmbientColor(color);
          }
        }
      } catch {
        // pass
      } finally {
        isSampling = false;
      }
    }, 180);

    return () => clearInterval(interval);
  }, [isVideo, playing]);

  return { ambientColor, stream, streamActive, youtubeId };
}
