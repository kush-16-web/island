// Dynamic Island Companion - YouTube Ambient Lighting & Video Sync
(function () {
  console.log('[Dynamic Island] Companion extension initialized on YouTube');

  const CANVAS_W = 24;
  const CANVAS_H = 14;
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  let lastSentColor = '';
  let lastSentVideoId = '';
  let lastPostTime = 0;

  function getVideoId() {
    try {
      const url = new URL(window.location.href);
      if (url.pathname.startsWith('/shorts/')) {
        const parts = url.pathname.split('/shorts/')[1];
        return parts ? parts.split('/')[0] : null;
      }
      return url.searchParams.get('v');
    } catch {
      return null;
    }
  }

  function sampleVideoColor(video) {
    if (!video || video.readyState < 2 || !video.videoWidth) return null;

    try {
      ctx.drawImage(video, 0, 0, CANVAS_W, CANVAS_H);
      const imgData = ctx.getImageData(0, 0, CANVAS_W, CANVAS_H).data;

      let totalR = 0;
      let totalG = 0;
      let totalB = 0;
      let totalWeight = 0;

      for (let i = 0; i < imgData.length; i += 4) {
        const r = imgData[i];
        const g = imgData[i + 1];
        const b = imgData[i + 2];

        // Filter out letterbox black bars & extreme washed-out white
        const brightness = (r + g + b) / 3;
        if (brightness < 20 || brightness > 248) continue;

        // Saturation weighting: prioritize vivid cinematic colors (Marvel red, One Piece ocean blue)
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

      const avgR = Math.round(totalR / totalWeight);
      const avgG = Math.round(totalG / totalWeight);
      const avgB = Math.round(totalB / totalWeight);

      return `rgb(${avgR}, ${avgG}, ${avgB})`;
    } catch {
      return null;
    }
  }

  async function postToIsland(payload) {
    try {
      await fetch('http://127.0.0.1:47823/video-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        mode: 'cors',
      });
    } catch {
      // Dynamic Island local server might be closed
    }
  }

  // Real-time synchronization loop (runs every 100ms)
  setInterval(() => {
    const video = document.querySelector('video');
    const videoId = getVideoId();

    if (!video || !videoId) return;

    const isPlaying = !video.paused && !video.ended;
    const sampledColor = isPlaying ? sampleVideoColor(video) : null;

    const now = Date.now();
    const colorChanged = sampledColor && sampledColor !== lastSentColor;
    const idChanged = videoId !== lastSentVideoId;

    if ((colorChanged && now - lastPostTime > 80) || idChanged) {
      lastPostTime = now;
      if (sampledColor) lastSentColor = sampledColor;
      lastSentVideoId = videoId;

      postToIsland({
        videoId,
        color: sampledColor || lastSentColor,
        playing: isPlaying,
        time: video.currentTime,
        duration: video.duration,
        title: document.title.replace(/ - YouTube$/, '').trim(),
      });
    }
  }, 100);
})();
