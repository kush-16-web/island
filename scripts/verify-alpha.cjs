const fs = require('fs');
const zlib = require('zlib');

function readPng(filePath) {
  const buf = fs.readFileSync(filePath);
  if (buf.readUInt32BE(0) !== 0x89504E47) throw new Error('Not a PNG');
  let offset = 8;
  let width = 0, height = 0, colorType = 0;
  const idatChunks = [];

  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    if (type === 'IHDR') {
      width = buf.readUInt32BE(offset + 8);
      height = buf.readUInt32BE(offset + 12);
      colorType = buf.readUInt8(offset + 17);
    } else if (type === 'IDAT') {
      idatChunks.push(buf.subarray(offset + 8, offset + 8 + len));
    }
    offset += 12 + len;
  }

  const decompressed = zlib.inflateSync(Buffer.concat(idatChunks));
  // Scanline filter: filter byte (1) + RGBA bytes (width * 4)
  const stride = 1 + width * 4;
  const topRow = decompressed.subarray(0, stride);
  const filterType = topRow[0];
  const r0 = topRow[1], g0 = topRow[2], b0 = topRow[3], a0 = topRow[4];
  return { width, height, colorType, filterType, r0, g0, b0, a0 };
}

const files = [
  'assets/island-16.png',
  'assets/island-32.png',
  'assets/island-48.png',
  'assets/island-app-512.png',
  'assets/tray.png',
  'assets/tray@2x.png',
];

for (const f of files) {
  const info = readPng(f);
  console.log(`${f}: ${info.width}x${info.height}, top-left RGBA=(${info.r0},${info.g0},${info.b0}, alpha=${info.a0})`);
}

