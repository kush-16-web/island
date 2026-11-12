const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

app.whenReady().then(async () => {
  // Window 1: transparent: false (what Phase 1A.4 had)
  const wFalse = new BrowserWindow({
    width: 400,
    height: 300,
    frame: false,
    transparent: false,
    backgroundColor: '#0e1017',
    show: true,
  });
  await wFalse.loadURL('data:text/html,<body style="background:%230e1017;color:white;margin:0;font-family:sans-serif;padding:20px;">Window transparent: false</body>');

  // Window 2: transparent: true
  const wTrue = new BrowserWindow({
    width: 400,
    height: 300,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    show: true,
  });
  await wTrue.loadURL('data:text/html,<body style="background:%230e1017;color:white;margin:0;font-family:sans-serif;border-radius:12px;padding:20px;">Window transparent: true</body>');

  await new Promise(r => setTimeout(r, 1000));

  const imgFalse = await wFalse.webContents.capturePage();
  const imgTrue = await wTrue.webContents.capturePage();

  fs.writeFileSync(path.join(__dirname, 'border_false.png'), imgFalse.toPNG());
  fs.writeFileSync(path.join(__dirname, 'border_true.png'), imgTrue.toPNG());

  console.log('Saved border_false.png and border_true.png');
  app.quit();
});

