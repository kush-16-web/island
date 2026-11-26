const { spawn } = require('child_process');
const electronPath = require('electron');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const targetScript = process.argv[2] || 'scripts/verify-weather-panel-real.js';

const child = spawn(electronPath, [targetScript], {
  env,
  stdio: 'inherit',
});

child.on('exit', (code) => {
  process.exit(code || 0);
});
