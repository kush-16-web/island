/**
 * Color extraction utility inspired by ColorThief.
 * Samples artwork pixels to find the dominant vibrant accent color.
 * Safe for base64 data URIs and remote URLs with fallback.
 */
export function extractCoverColor(imageSrc, callback) {
  if (!imageSrc || typeof imageSrc !== 'string') {
    callback(null);
    return;
  }

  const img = new Image();
  // Do NOT set crossOrigin on data URIs as Chromium will mark canvas tainted
  if (!imageSrc.startsWith('data:')) {
    img.crossOrigin = 'anonymous';
  }

  img.onload = () => {
    try {
      const canvas = document.createElement('canvas');
      const size = 32;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        callback(null);
        return;
      }

      ctx.drawImage(img, 0, 0, size, size);
      const imgData = ctx.getImageData(0, 0, size, size).data;

      // Color bucket accumulator
      const buckets = [];

      for (let i = 0; i < imgData.length; i += 4) {
        const r = imgData[i];
        const g = imgData[i + 1];
        const b = imgData[i + 2];
        const a = imgData[i + 3];

        if (a < 128) continue;

        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const sat = max === 0 ? 0 : (max - min) / max;
        const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

        // Skip near-black, near-white, or completely desaturated grays
        if (lum < 0.12 || lum > 0.92) continue;
        if (sat < 0.18) continue;

        // Vibrant score: reward high saturation and balanced luminance
        const score = sat * 2.2 + (1 - Math.abs(lum - 0.52) * 1.5);
        buckets.push({ r, g, b, sat, lum, score });
      }

      if (buckets.length === 0) {
        // Fallback: take average of non-black/white pixels
        callback(null);
        return;
      }

      // Sort by vibrancy score descending
      buckets.sort((a, b) => b.score - a.score);

      // Pick the best vibrant color
      const best = buckets[0];
      callback(`rgb(${best.r}, ${best.g}, ${best.b})`);
    } catch {
      callback(null);
    }
  };

  img.onerror = () => {
    callback(null);
  };

  img.src = imageSrc;
}

