const fs = require('fs');
const path = require('path');
const { nativeImage } = require('electron');
const { app } = require('electron');

app.whenReady().then(() => {
  const brandDir = 'D:\\island-brand-assets';
  if (!fs.existsSync(brandDir)) {
    fs.mkdirSync(brandDir, { recursive: true });
  }

  const downloadsDir = 'C:\\Users\\harsh\\Downloads';
  const origPng = path.join(downloadsDir, 'island-original.png');
  const appIco = path.join(downloadsDir, 'island-app.ico');

  console.log('Checking downloads sources:');
  console.log('  origPng exists:', fs.existsSync(origPng));
  console.log('  appIco exists:', fs.existsSync(appIco));

  // Copy to D:\island-brand-assets
  if (fs.existsSync(origPng)) {
    fs.copyFileSync(origPng, path.join(brandDir, 'island-original.png'));
  }
  if (fs.existsSync(appIco)) {
    fs.copyFileSync(appIco, path.join(brandDir, 'island-app.ico'));
  }

  // Generate 512x512 if not already there
  const img = nativeImage.createFromPath(path.join(brandDir, 'island-original.png'));
  console.log('Original image dimensions:', img.getSize());

  const img512 = img.resize({ width: 512, height: 512, quality: 'best' });
  fs.writeFileSync(path.join(brandDir, 'island-app-512.png'), img512.toPNG());
  console.log('Wrote D:\\island-brand-assets\\island-app-512.png');

  // Also check D:\island\assets
  const projectAssets = path.join(__dirname, '..', 'assets');
  if (!fs.existsSync(projectAssets)) {
    fs.mkdirSync(projectAssets, { recursive: true });
  }

  // Backup previous generic icon
  if (fs.existsSync(path.join(projectAssets, 'icon.png')) && !fs.existsSync(path.join(projectAssets, 'icon-legacy-pink-robot.png'))) {
    fs.copyFileSync(path.join(projectAssets, 'icon.png'), path.join(projectAssets, 'icon-legacy-pink-robot.png'));
  }

  // Write new assets
  fs.copyFileSync(path.join(brandDir, 'island-app.ico'), path.join(projectAssets, 'island-app.ico'));
  fs.copyFileSync(path.join(brandDir, 'island-app.ico'), path.join(projectAssets, 'icon.ico'));
  fs.copyFileSync(path.join(brandDir, 'island-original.png'), path.join(projectAssets, 'island-original.png'));
  fs.copyFileSync(path.join(brandDir, 'island-app-512.png'), path.join(projectAssets, 'island-app-512.png'));
  fs.copyFileSync(path.join(brandDir, 'island-app-512.png'), path.join(projectAssets, 'icon.png'));

  console.log('Assets setup completed successfully.');
  app.quit();
});

