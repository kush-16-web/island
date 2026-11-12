const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

app.whenReady().then(async () => {
  console.log('[TITLEBAR STYLE TEST] Testing titleBarStyle: hidden vs frame: false...');

  // Option 1: titleBarStyle: 'hidden', backgroundMaterial: 'acrylic', transparent: false
  try {
    const w1 = new BrowserWindow({
      width: 400, height: 300,
      titleBarStyle: 'hidden',
      backgroundMaterial: 'acrylic',
      backgroundColor: '#00000000',
      show: false,
    });
    console.log('w1 created successfully');
    w1.destroy();
  } catch (e) {
    console.log('w1 error:', e.message);
  }

  // Option 2: titleBarStyle: 'hidden', backgroundMaterial: 'acrylic', transparent: true
  try {
    const w2 = new BrowserWindow({
      width: 400, height: 300,
      titleBarStyle: 'hidden',
      transparent: true,
      backgroundMaterial: 'acrylic',
      backgroundColor: '#00000000',
      show: false,
    });
    console.log('w2 created successfully');
    w2.destroy();
  } catch (e) {
    console.log('w2 error:', e.message);
  }

  app.quit();
});

