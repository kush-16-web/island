/**
 * Extracts a dominant, vibrant accent color from an album/video cover art.
 * Returns an RGB string, or null if no vibrant color is found.
 */
export function extractCoverColor(imageSrc, callback) {
  if (!imageSrc || typeof imageSrc !== 'string') return callback(null);

  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 16;
      canvas.height = 16;
      const ctx = canvas.getContext('2d');
      if (!ctx) return callback(null);
      ctx.drawImage(img, 0, 0, 16, 16);
      const data = ctx.getImageData(0, 0, 16, 16).data;

      let maxScore = -1;
      let bestR = 255, bestG = 255, bestB = 255;

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const sat = max === 0 ? 0 : (max - min) / max;
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;

        // Score based on saturation and balanced luminescence
        if (sat > 0.28 && lum > 45 && lum < 220) {
          const score = sat * 2.0 + (1 - Math.abs(lum - 130) / 130);
          if (score > maxScore) {
            maxScore = score;
            bestR = r; bestG = g; bestB = b;
          }
        }
      }

      if (maxScore > 0) {
        callback(`rgb(${bestR}, ${bestG}, ${bestB})`);
      } else {
        callback(null);
      }
    } catch {
      callback(null);
    }
  };
  img.onerror = () => callback(null);
  img.src = imageSrc;
}
