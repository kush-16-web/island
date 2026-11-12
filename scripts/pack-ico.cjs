const fs = require('fs');
const path = require('path');

function createIco(pngBuffers) {
  // pngBuffers: array of { width, height, buffer }
  const count = pngBuffers.length;
  const headerSize = 6 + count * 16;

  let currentOffset = headerSize;
  const entries = [];

  for (const item of pngBuffers) {
    const w = item.width >= 256 ? 0 : item.width;
    const h = item.height >= 256 ? 0 : item.height;
    const size = item.buffer.length;

    const entry = Buffer.alloc(16);
    entry.writeUInt8(w, 0);
    entry.writeUInt8(h, 1);
    entry.writeUInt8(0, 2); // colorCount
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // planes
    entry.writeUInt16LE(32, 6); // bpp
    entry.writeUInt32LE(size, 8); // bytesInRes
    entry.writeUInt32LE(currentOffset, 12); // imageOffset

    entries.push(entry);
    currentOffset += size;
  }

  const iconDir = Buffer.alloc(6);
  iconDir.writeUInt16LE(0, 0); // reserved
  iconDir.writeUInt16LE(1, 2); // 1 = ICO
  iconDir.writeUInt16LE(count, 4); // count

  return Buffer.concat([iconDir, ...entries, ...pngBuffers.map((b) => b.buffer)]);
}

const assetsDir = path.join(__dirname, '..', 'assets');
const brandDir = 'D:\\island-brand-assets';

const sizes = [16, 24, 32, 48, 64, 128, 256];
const pngLayers = sizes.map((s) => ({
  width: s,
  height: s,
  buffer: fs.readFileSync(path.join(assetsDir, `island-${s}.png`)),
}));

const icoBuffer = createIco(pngLayers);
console.log(`Generated transparent ICO buffer: ${icoBuffer.length} bytes`);

fs.writeFileSync(path.join(assetsDir, 'island-app.ico'), icoBuffer);
fs.writeFileSync(path.join(assetsDir, 'icon.ico'), icoBuffer);
if (fs.existsSync(brandDir)) {
  fs.writeFileSync(path.join(brandDir, 'island-app.ico'), icoBuffer);
}

// Update tray icons with clean transparent assets
fs.copyFileSync(path.join(assetsDir, 'island-16.png'), path.join(assetsDir, 'tray.png'));
fs.copyFileSync(path.join(assetsDir, 'island-32.png'), path.join(assetsDir, 'tray@2x.png'));

console.log('Successfully written transparent ICO and tray icons!');

