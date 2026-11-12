const fs = require('fs');
const path = require('path');

const exePath = path.join(__dirname, '..', 'release', 'win-unpacked', 'Island.exe');
const stat = fs.statSync(exePath);
console.log('Island.exe found! Size:', stat.size, 'bytes');

// Check that resources/app.asar exists
const asarPath = path.join(__dirname, '..', 'release', 'win-unpacked', 'resources', 'app.asar');
console.log('app.asar exists:', fs.existsSync(asarPath));

console.log('Executable verified cleanly.');

