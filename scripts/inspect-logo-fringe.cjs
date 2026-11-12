const fs = require('fs');
const zlib = require('zlib');

function inspectImageEdges(filePath) {
  const buf = fs.readFileSync(filePath);
  const idats = [];
  let off = 8, w = 0, h = 0;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    if (type === 'IHDR') {
      w = buf.readUInt32BE(off + 8);
      h = buf.readUInt32BE(off + 12);
    } else if (type === 'IDAT') {
      idats.push(buf.subarray(off + 8, off + 8 + len));
    }
    off += 12 + len;
  }
  const dec = zlib.inflateSync(Buffer.concat(idats));
  const stride = 1 + w * 4;

  console.log(`\n=== Inspecting ${filePath} (${w}x${h}) ===`);

  // Check dark/gray pixels with non-zero alpha around the perimeter of the icon
  let darkFringePixels = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = stride * y + 1 + x * 4;
      const r = dec[idx], g = dec[idx+1], b = dec[idx+2], a = dec[idx+3];
      if (a > 0 && a < 250) {
        // Semi-transparent edge pixel
        if (r < 80 && g < 80 && b < 80) {
          darkFringePixels++;
        }
      }
    }
  }
  console.log(`Semi-transparent dark fringe pixels: ${darkFringePixels}`);
}

inspectImageEdges('src/assets/island-icon-32.png');
inspectImageEdges('src/assets/island-icon-64.png');
inspectImageEdges('assets/island-app-512.png');

