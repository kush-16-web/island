const fs = require('fs');
const path = require('path');
const { nativeImage, app } = require('electron');

app.whenReady().then(() => {
  const assetsDir = path.join(__dirname, '..', 'assets');
  const origPath = path.join(assetsDir, 'island-original.png');
  const img = nativeImage.createFromPath(origPath);
  const size = img.getSize();
  const w = size.width;
  const h = size.height;

  const buf = Buffer.from(img.toBitmap()); // RGBA 32-bit

  // Flood fill / threshold alpha on outer background
  // Background is around #f1f3f7 ~ #f3f4f8 (R: 238-246, G: 240-248, B: 244-252)
  const isBg = (x, y) => {
    if (x < 0 || x >= w || y < 0 || y >= h) return false;
    const idx = (y * w + x) * 4;
    const r = buf[idx];
    const g = buf[idx + 1];
    const b = buf[idx + 2];
    // Check if color is close to off-white/light-grey background
    return r >= 232 && g >= 234 && b >= 238 && Math.abs(r - g) < 12 && Math.abs(g - b) < 12;
  };

  // Breadth-first search flood from 4 outer edges
  const visited = new Uint8Array(w * h);
  const queue = [];

  // Seed boundary pixels
  for (let x = 0; x < w; x++) {
    if (isBg(x, 0)) { queue.push(x, 0); visited[0 * w + x] = 1; }
    if (isBg(x, h - 1)) { queue.push(x, h - 1); visited[(h - 1) * w + x] = 1; }
  }
  for (let y = 0; y < h; y++) {
    if (isBg(0, y)) { queue.push(0, y); visited[y * w + 0] = 1; }
    if (isBg(w - 1, y)) { queue.push(w - 1, y); visited[y * w + (w - 1)] = 1; }
  }

  let head = 0;
  while (head < queue.length) {
    const cx = queue[head++];
    const cy = queue[head++];

    const neighbors = [
      [cx + 1, cy],
      [cx - 1, cy],
      [cx, cy + 1],
      [cx, cy - 1],
    ];

    for (const [nx, ny] of neighbors) {
      if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
        const nPos = ny * w + nx;
        if (!visited[nPos] && isBg(nx, ny)) {
          visited[nPos] = 1;
          queue.push(nx, ny);
        }
      }
    }
  }

  // Apply alpha transparency to all flooded outer background pixels
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const pos = y * w + x;
      if (visited[pos]) {
        const idx = pos * 4;
        buf[idx + 3] = 0; // Alpha 0
      }
    }
  }

  // Create nativeImage from modified bitmap
  const transparentImg = nativeImage.createFromBitmap(buf, { width: w, height: h });
  const outPath = path.join(assetsDir, 'island-transparent-cutout.png');
  fs.writeFileSync(outPath, transparentImg.toPNG());
  console.log('Saved island-transparent-cutout.png to assets/');

  // Generate transparent 512, 128, 64, 48, 32, 24, 16
  const sizes = [512, 128, 64, 48, 32, 24, 16];
  for (const s of sizes) {
    const resized = transparentImg.resize({ width: s, height: s, quality: 'best' });
    fs.writeFileSync(path.join(assetsDir, `island-transparent-${s}.png`), resized.toPNG());
  }

  console.log('Generated scaled transparent cutouts in assets/');
  app.quit();
});

