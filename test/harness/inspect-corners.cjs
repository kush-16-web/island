const fs = require('fs');
const path = require('path');
const { nativeImage, app } = require('electron');

app.whenReady().then(() => {
  const p1 = path.join(__dirname, 'corner_pure_css.png');
  const p2 = path.join(__dirname, 'corner_acrylic.png');

  const img1 = nativeImage.createFromPath(p1);
  const img2 = nativeImage.createFromPath(p2);

  const b1 = img1.toBitmap();
  const b2 = img2.toBitmap();

  const getPixel = (b, x, y, w) => {
    const idx = (y * w + x) * 4;
    return `R=${b[idx]} G=${b[idx+1]} B=${b[idx+2]} A=${b[idx+3]}`;
  };

  console.log('Pure CSS corner:');
  console.log('  (0,0):', getPixel(b1, 0, 0, 480));
  console.log('  (2,2):', getPixel(b1, 2, 2, 480));
  console.log('  (6,6):', getPixel(b1, 6, 6, 480));
  console.log('  (20,20):', getPixel(b1, 20, 20, 480));

  console.log('Acrylic corner:');
  console.log('  (0,0):', getPixel(b2, 0, 0, 480));
  console.log('  (2,2):', getPixel(b2, 2, 2, 480));
  console.log('  (6,6):', getPixel(b2, 6, 6, 480));
  console.log('  (20,20):', getPixel(b2, 20, 20, 480));

  app.quit();
});

