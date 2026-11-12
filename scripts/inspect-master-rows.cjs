const fs = require('fs');
const zlib = require('zlib');

const buf = fs.readFileSync('assets/island-transparent-master.png');
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

console.log(`Master dimensions: ${w}x${h}`);
// Check rows from bottom to top to see where content begins
for (let y = h - 1; y >= h - 100; y -= 5) {
  let count = 0;
  let sampleColor = '';
  for (let x = 0; x < w; x++) {
    const idx = stride * y + 1 + x * 4;
    const a = dec[idx + 3];
    if (a > 10) {
      count++;
      if (!sampleColor) {
        sampleColor = `R=${dec[idx]} G=${dec[idx+1]} B=${dec[idx+2]} A=${a}`;
      }
    }
  }
  console.log(`Row y=${y}: ${count} visible pixels. Sample: ${sampleColor || 'none'}`);
}

