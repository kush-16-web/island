const { nativeImage, app } = require('electron');
const path = require('node:path');

app.whenReady().then(() => {
  const p = path.join(__dirname, 'actual_screen_corner.png');
  const img = nativeImage.createFromPath(p);
  const size = img.getSize();
  console.log('Image dimensions:', size);
  const b = img.toBitmap();
  const getP = (x, y) => {
    const idx = (y * size.width + x) * 4;
    return `(${x},${y}): R=${b[idx]} G=${b[idx+1]} B=${b[idx+2]} A=${b[idx+3]}`;
  };

  for (let y = 0; y <= 30; y += 5) {
    let row = `y=${y}: `;
    for (let x = 0; x <= 30; x += 5) {
      const idx = (y * size.width + x) * 4;
      row += `[${x}: ${b[idx]},${b[idx+1]},${b[idx+2]}] `;
    }
    console.log(row);
  }

  app.quit();
});

