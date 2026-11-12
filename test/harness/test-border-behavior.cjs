const { app, BrowserWindow } = require('electron');

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 600,
    height: 400,
    frame: false,
    transparent: true,
    resizable: true,
    show: false,
  });

  console.log('Window resizable:', win.isResizable());
  win.setSize(750, 550);
  console.log('Window new size:', win.getSize());

  win.destroy();
  app.quit();
});
