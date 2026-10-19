'use strict';
// Generates assets/tray.png, assets/tray@2x.png and assets/icon.png with no dependencies.
// Run with: npm run icons
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const stride = w * 4 + 1;
  const raw = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    raw[y * stride] = 0;
    rgba.copy(raw, y * stride + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// shade(x, y) -> [r, g, b, a(0..1)] or null. Supersampled for smooth edges.
function render(w, h, shade, ss = 4) {
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const c = shade(x + (sx + 0.5) / ss, y + (sy + 0.5) / ss);
          if (!c) continue;
          r += c[0] * c[3];
          g += c[1] * c[3];
          b += c[2] * c[3];
          a += c[3];
        }
      }
      if (a > 0) {
        const i = (y * w + x) * 4;
        out[i] = Math.round(r / a);
        out[i + 1] = Math.round(g / a);
        out[i + 2] = Math.round(b / a);
        out[i + 3] = Math.round((255 * a) / (ss * ss));
      }
    }
  }
  return out;
}

function sdRoundRect(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - hw + r;
  const qy = Math.abs(py - cy) - hh + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

const lerp = (a, b, t) => a + (b - a) * t;

function trayShade(scale) {
  return (x, y) => {
    const px = x / scale;
    const py = y / scale;
    if (Math.hypot(px - 9.5, py - 16) < 3) return [143, 156, 255, 1];
    if (sdRoundRect(px, py, 16, 16, 14, 7.5, 7.5) < 0) return [255, 255, 255, 1];
    return null;
  };
}

function iconShade(x, y) {
  if (sdRoundRect(x, y, 128, 128, 120, 120, 58) > 0) return null;
  // pill
  if (Math.hypot(x - 76, y - 108) < 11) return [143, 156, 255, 1];
  const bars = [[162, 14], [177, 26], [192, 18]];
  for (const [bx, bh] of bars) {
    if (sdRoundRect(x, y, bx, 108, 3.5, bh / 2, 3.5) < 0) return [255, 255, 255, 1];
  }
  if (sdRoundRect(x, y, 128, 108, 82, 29, 29) < 0) return [0, 0, 0, 1];
  const t = Math.min(1, Math.max(0, (x + y) / 480));
  return [Math.round(lerp(143, 255, t)), Math.round(lerp(156, 90, t)), Math.round(lerp(255, 110, t)), 1];
}

const outDir = path.join(__dirname, '..', 'assets');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'tray.png'), encodePng(16, 16, render(16, 16, trayShade(0.5))));
fs.writeFileSync(path.join(outDir, 'tray@2x.png'), encodePng(32, 32, render(32, 32, trayShade(1))));
fs.writeFileSync(path.join(outDir, 'icon.png'), encodePng(256, 256, render(256, 256, iconShade, 3)));
console.log('Wrote assets/tray.png, assets/tray@2x.png, assets/icon.png');
