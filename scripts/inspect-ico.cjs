const fs = require('fs');
const path = require('path');
const { nativeImage } = require('electron');
const { app } = require('electron');

app.whenReady().then(() => {
  const icoPath = path.join(__dirname, '..', 'assets', 'island-app.ico');
  const buf = fs.readFileSync(icoPath);
  
  // Parse ICO header
  const count = buf.readUInt16LE(4);
  console.log('ICO image count:', count);
  for (let i = 0; i < count; i++) {
    const offset = 6 + i * 16;
    const w = buf.readUInt8(offset) || 256;
    const h = buf.readUInt8(offset + 1) || 256;
    const bpp = buf.readUInt16LE(offset + 6);
    const bytes = buf.readUInt32LE(offset + 8);
    console.log(`  Icon #${i + 1}: ${w}x${h}, ${bpp} bpp, ${bytes} bytes`);
  }

  // Also check tray.png
  const trayPath = path.join(__dirname, '..', 'assets', 'tray.png');
  const trayImg = nativeImage.createFromPath(trayPath);
  console.log('Current tray.png dimensions:', trayImg.getSize());

  app.quit();
});

