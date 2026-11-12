const fs = require('fs');
const path = require('path');
const { nativeImage, app } = require('electron');

app.whenReady().then(async () => {
  const assetsDir = path.join(__dirname, '..', 'assets');
  const icoPath = path.join(assetsDir, 'island-app.ico');
  const png512Path = path.join(assetsDir, 'island-app-512.png');
  const origPngPath = path.join(assetsDir, 'island-original.png');

  console.log('Testing icon assets presence:');
  console.log('  ICO exists:', fs.existsSync(icoPath));
  console.log('  PNG 512 exists:', fs.existsSync(png512Path));
  console.log('  Original PNG exists:', fs.existsSync(origPngPath));

  const origImg = nativeImage.createFromPath(origPngPath);
  const sizes = [16, 24, 32, 48, 64, 128, 256];

  for (const s of sizes) {
    const resized = origImg.resize({ width: s, height: s, quality: 'best' });
    const outName = `island-${s}.png`;
    fs.writeFileSync(path.join(assetsDir, outName), resized.toPNG());
  }

  // Generate tray icons specifically (tray.png at 16x16 and tray@2x.png at 32x32)
  const tray16 = origImg.resize({ width: 16, height: 16, quality: 'best' });
  const tray32 = origImg.resize({ width: 32, height: 32, quality: 'best' });
  const tray24 = origImg.resize({ width: 24, height: 24, quality: 'best' });

  fs.writeFileSync(path.join(assetsDir, 'tray-tropical-16.png'), tray16.toPNG());
  fs.writeFileSync(path.join(assetsDir, 'tray-tropical-24.png'), tray24.toPNG());
  fs.writeFileSync(path.join(assetsDir, 'tray-tropical-32.png'), tray32.toPNG());

  console.log('Generated scaled PNGs in assets/');
  app.quit();
});

