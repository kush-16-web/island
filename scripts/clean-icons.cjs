const fs = require('fs');
const path = require('path');
const { nativeImage, app } = require('electron');

app.whenReady().then(() => {
  const assetsDir = path.join(__dirname, '..', 'assets');
  const masterPath = path.join(assetsDir, 'island-transparent-master.png');
  const master = nativeImage.createFromPath(masterPath);

  const sizes = [16, 24, 32, 48, 64, 128, 256, 512];
  for (const s of sizes) {
    const resized = master.resize({ width: s, height: s, quality: 'best' });
    const buf = Buffer.from(resized.toBitmap());
    // For small sizes (16, 24), clamp very low alpha (< 15) to 0 so no halo exists
    if (s <= 24) {
      for (let i = 0; i < buf.length; i += 4) {
        if (buf[i + 3] < 20) {
          buf[i] = 0;
          buf[i + 1] = 0;
          buf[i + 2] = 0;
          buf[i + 3] = 0;
        }
      }
      const cleaned = nativeImage.createFromBitmap(buf, { width: s, height: s });
      fs.writeFileSync(path.join(assetsDir, `island-${s}.png`), cleaned.toPNG());
    } else {
      fs.writeFileSync(path.join(assetsDir, `island-${s}.png`), resized.toPNG());
    }
  }

  // Also write public and src assets
  const png16 = master.resize({ width: 16, height: 16, quality: 'best' }).toPNG();
  const png32 = master.resize({ width: 32, height: 32, quality: 'best' }).toPNG();
  const png64 = master.resize({ width: 64, height: 64, quality: 'best' }).toPNG();

  fs.writeFileSync(path.join(__dirname, '..', 'public', 'island-icon-16.png'), png16);
  fs.writeFileSync(path.join(__dirname, '..', 'public', 'island-icon-32.png'), png32);
  fs.writeFileSync(path.join(__dirname, '..', 'public', 'island-icon-64.png'), png64);
  fs.writeFileSync(path.join(__dirname, '..', 'src', 'assets', 'island-icon-16.png'), png16);
  fs.writeFileSync(path.join(__dirname, '..', 'src', 'assets', 'island-icon-32.png'), png32);
  fs.writeFileSync(path.join(__dirname, '..', 'src', 'assets', 'island-icon-64.png'), png64);

  console.log('Cleaned and regenerated all icon sizes.');
  app.quit();
});

