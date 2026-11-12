const { app, BrowserWindow } = require('electron');

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 680,
    height: 520,
    frame: false,
    transparent: false,
    backgroundColor: '#00000000',
    backgroundMaterial: 'acrylic',
    show: false,
  });

  console.log('has setAccentColor:', typeof win.setAccentColor);
  if (typeof win.setAccentColor === 'function') {
    win.setAccentColor(false);
    console.log('setAccentColor(false) executed successfully');
  }

  const hwnd = win.getNativeWindowHandle();
  console.log('HWND buffer length:', hwnd.length, 'readInt32LE:', hwnd.readInt32LE(0));

  app.quit();
});

