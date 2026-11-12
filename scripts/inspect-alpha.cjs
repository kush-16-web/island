const path = require('path');
const { nativeImage, app } = require('electron');

app.whenReady().then(() => {
  const origPath = path.join(__dirname, '..', 'assets', 'island-original.png');
  const img = nativeImage.createFromPath(origPath);
  const size = img.getSize();
  const bitmap = img.toBitmap();

  // Top-left pixel RGBA
  const r0 = bitmap[0];
  const g0 = bitmap[1];
  const b0 = bitmap[2];
  const a0 = bitmap[3];

  console.log(`Dimensions: ${size.width}x${size.height}`);
  console.log(`Top-left pixel: R=${r0}, G=${g0}, B=${b0}, A=${a0}`);

  // Sample points around outer edges
  const sample = (x, y) => {
    const idx = (y * size.width + x) * 4;
    return `(${x},${y}): R=${bitmap[idx]} G=${bitmap[idx+1]} B=${bitmap[idx+2]} A=${bitmap[idx+3]}`;
  };

  console.log('Sample edge pixels:');
  console.log('  Top-left (10, 10):', sample(10, 10));
  console.log('  Top-right (w-10, 10):', sample(size.width - 10, 10));
  console.log('  Bottom-left (10, h-10):', sample(10, size.height - 10));
  console.log('  Bottom-right (w-10, h-10):', sample(size.width - 10, size.height - 10));

  // Also check island-app.ico layers
  const icoPath = path.join(__dirname, '..', 'assets', 'island-app.ico');
  const icoImg = nativeImage.createFromPath(icoPath);
  const icoBitmap = icoImg.toBitmap();
  console.log('ICO top-left pixel:', `R=${icoBitmap[0]} G=${icoBitmap[1]} B=${icoBitmap[2]} A=${icoBitmap[3]}`);

  app.quit();
});

