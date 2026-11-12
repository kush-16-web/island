const fs = require('fs');
const path = require('path');
const { nativeImage, app } = require('electron');

app.whenReady().then(() => {
  const origPath = path.join(__dirname, '..', 'assets', 'island-original.png');
  const img = nativeImage.createFromPath(origPath);
  const size = img.getSize();
  const w = size.width;
  const h = size.height;
  const buf = Buffer.from(img.toBitmap()); // RGBA

  console.log(`Original image: ${w}x${h}`);

  // Background color in original artwork:
  // Studio lighting background is around R:240-244, G:241-245, B:246-250 (average [242, 243, 248])
  // Let's compute color distance from background [242, 243, 248]
  const bgR = 242, bgG = 243, bgB = 248;

  // Let's find tight bounding box of island content
  // First, identify background via BFS from outer border with smooth color distance threshold
  const visited = new Uint8Array(w * h);
  const queue = [];

  const getDist = (x, y) => {
    const idx = (y * w + x) * 4;
    const r = buf[idx], g = buf[idx+1], b = buf[idx+2];
    const dr = r - bgR, dg = g - bgG, db = b - bgB;
    return Math.sqrt(dr*dr + dg*dg + db*db);
  };

  // Outer border seed
  for (let x = 0; x < w; x++) {
    queue.push(x, 0); visited[0 * w + x] = 1;
    queue.push(x, h - 1); visited[(h - 1) * w + x] = 1;
  }
  for (let y = 0; y < h; y++) {
    queue.push(0, y); visited[y * w + 0] = 1;
    queue.push(w - 1, y); visited[y * w + (w - 1)] = 1;
  }

  // BFS flood fill on background
  let head = 0;
  // Threshold: studio background variance
  const threshold = 18; // Background pixels within 18 Euclidean color distance

  const isBgOrShadow = (nx, ny) => {
    const d = getDist(nx, ny);
    if (d <= threshold) return true;
    // Bottom floor shadow beneath the floating water cube:
    // Any neutral shadow pixel with spread < 35 and lightness > 80 at y >= 950
    if (ny >= 950) {
      const idx = (ny * w + nx) * 4;
      const r = buf[idx], g = buf[idx + 1], b = buf[idx + 2];
      const spread = Math.max(r, g, b) - Math.min(r, g, b);
      if (spread < 35 && r > 80 && g > 80 && b > 80) {
        return true;
      }
    }
    return false;
  };

  while (head < queue.length) {
    const cx = queue[head++];
    const cy = queue[head++];

    const neighbors = [
      [cx + 1, cy],
      [cx - 1, cy],
      [cx, cy + 1],
      [cx, cy - 1]
    ];

    for (const [nx, ny] of neighbors) {
      if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
        const pos = ny * w + nx;
        if (!visited[pos]) {
          if (isBgOrShadow(nx, ny)) {
            visited[pos] = 1;
            queue.push(nx, ny);
          }
        }
      }
    }
  }

  // Count background pixels
  let bgCount = 0;
  for (let i = 0; i < w * h; i++) if (visited[i]) bgCount++;
  console.log(`Flooded background pixels: ${bgCount} (${((bgCount / (w * h)) * 100).toFixed(1)}%)`);

  // Edge antialiasing & defringing:
  // For pixels bordering the visited background, calculate smooth alpha based on distance:
  // If d <= 12 -> alpha = 0
  // If 12 < d < 28 -> alpha = (d - 12) / 16
  // Also un-multiply background color to eliminate white/grey fringe/halo!
  let minX = w, maxX = 0, minY = h, maxY = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const pos = y * w + x;
      const idx = pos * 4;
      const d = getDist(x, y);

      if (visited[pos]) {
        buf[idx + 3] = 0; // Completely transparent
      } else {
        // Content pixel
        // Check if adjacent to background for defringing
        const isEdge = (
          (x > 0 && visited[pos - 1]) ||
          (x < w - 1 && visited[pos + 1]) ||
          (y > 0 && visited[pos - w]) ||
          (y < h - 1 && visited[pos + w])
        );

        if (isEdge && d < 32) {
          // Antialiased edge transition
          const alpha = Math.max(0, Math.min(1, (d - 10) / 22));
          buf[idx + 3] = Math.round(alpha * 255);

          // Defringe: recover true foreground color without white wash
          if (alpha > 0.05 && alpha < 0.95) {
            // Unblend: C_fg = (C_obs - (1 - alpha) * C_bg) / alpha
            const r = (buf[idx] - (1 - alpha) * bgR) / alpha;
            const g = (buf[idx + 1] - (1 - alpha) * bgG) / alpha;
            const b = (buf[idx + 2] - (1 - alpha) * bgB) / alpha;
            buf[idx] = Math.max(0, Math.min(255, Math.round(r)));
            buf[idx + 1] = Math.max(0, Math.min(255, Math.round(g)));
            buf[idx + 2] = Math.max(0, Math.min(255, Math.round(b)));
          }
        }

        if (buf[idx + 3] > 10) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
  }

  console.log(`Island bounding box: x=[${minX}, ${maxX}] (width ${maxX - minX + 1}), y=[${minY}, ${maxY}] (height ${maxY - minY + 1})`);

  // Center the bounding box in a square with modest, balanced margins (e.g. 5% padding)
  const contentW = maxX - minX + 1;
  const contentH = maxY - minY + 1;
  const maxDim = Math.max(contentW, contentH);
  const targetSquare = Math.round(maxDim * 1.08); // 8% breathing room
  console.log(`Target square dimensions: ${targetSquare}x${targetSquare}`);

  // Create centered square buffer
  const squareBuf = Buffer.alloc(targetSquare * targetSquare * 4); // All zeros (transparent)
  const offsetX = Math.round((targetSquare - contentW) / 2);
  const offsetY = Math.round((targetSquare - contentH) / 2);

  for (let cy = 0; cy < contentH; cy++) {
    const srcY = minY + cy;
    const dstY = offsetY + cy;
    for (let cx = 0; cx < contentW; cx++) {
      const srcX = minX + cx;
      const dstX = offsetX + cx;
      const srcIdx = (srcY * w + srcX) * 4;
      const dstIdx = (dstY * targetSquare + dstX) * 4;
      squareBuf[dstIdx] = buf[srcIdx];
      squareBuf[dstIdx + 1] = buf[srcIdx + 1];
      squareBuf[dstIdx + 2] = buf[srcIdx + 2];
      squareBuf[dstIdx + 3] = buf[srcIdx + 3];
    }
  }

  const masterCutout = nativeImage.createFromBitmap(squareBuf, { width: targetSquare, height: targetSquare });
  const assetsDirOut = path.join(__dirname, '..', 'assets');
  const brandDirOut = 'D:\\island-brand-assets';

  // Save master transparent cutout PNGs
  const png512 = masterCutout.resize({ width: 512, height: 512, quality: 'best' });
  const png256 = masterCutout.resize({ width: 256, height: 256, quality: 'best' });
  const png128 = masterCutout.resize({ width: 128, height: 128, quality: 'best' });
  const png64 = masterCutout.resize({ width: 64, height: 64, quality: 'best' });
  const png48 = masterCutout.resize({ width: 48, height: 48, quality: 'best' });
  const png32 = masterCutout.resize({ width: 32, height: 32, quality: 'best' });
  const png24 = masterCutout.resize({ width: 24, height: 24, quality: 'best' });
  const png16 = masterCutout.resize({ width: 16, height: 16, quality: 'best' });

  // Save to assets
  fs.writeFileSync(path.join(assetsDirOut, 'island-transparent-master.png'), masterCutout.toPNG());
  fs.writeFileSync(path.join(assetsDirOut, 'island-app-512.png'), png512.toPNG());
  fs.writeFileSync(path.join(assetsDirOut, 'icon.png'), png512.toPNG());
  fs.writeFileSync(path.join(assetsDirOut, 'island-256.png'), png256.toPNG());
  fs.writeFileSync(path.join(assetsDirOut, 'island-128.png'), png128.toPNG());
  fs.writeFileSync(path.join(assetsDirOut, 'island-64.png'), png64.toPNG());
  fs.writeFileSync(path.join(assetsDirOut, 'island-48.png'), png48.toPNG());
  fs.writeFileSync(path.join(assetsDirOut, 'island-32.png'), png32.toPNG());
  fs.writeFileSync(path.join(assetsDirOut, 'island-24.png'), png24.toPNG());
  fs.writeFileSync(path.join(assetsDirOut, 'island-16.png'), png16.toPNG());

  // Also save to brand dir
  fs.writeFileSync(path.join(brandDirOut, 'island-app-512.png'), png512.toPNG());
  fs.writeFileSync(path.join(brandDirOut, 'island-transparent-master.png'), masterCutout.toPNG());

  console.log('Saved transparent master and scaled PNGs.');
  app.quit();
});

