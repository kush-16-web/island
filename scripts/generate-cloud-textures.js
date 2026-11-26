'use strict';

/**
 * generate-cloud-textures.js
 * 
 * Synthesizes 100% original, seamlessly tileable cloud textures using 4D toroidal
 * fractional Brownian motion (fBm) and periodic cellular Worley noise.
 * 
 * Textures generated:
 * 1. public/weather/cloud-cumulus.png: Dense volumetric cumulus with soft cauliflower lobes.
 * 2. public/weather/cloud-cirrus.png: Wispy high-altitude ice-crystal fibrous streaks.
 * 
 * License: MIT (Original procedural synthesis for Island Weather)
 */

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const SIZE = 512;

// Seeded pseudorandom generator for deterministic results
let seed = 42;
function random() {
  seed = (seed * 16807 + 0) % 2147483647;
  return (seed - 1) / 2147483646;
}

// 4D Simplex-style Gradient Hash Table
const perm = new Uint8Array(512);
const grad4 = [
  [0,1,1,1],[0,1,1,-1],[0,1,-1,1],[0,1,-1,-1],
  [0,-1,1,1],[0,-1,1,-1],[0,-1,-1,1],[0,-1,-1,-1],
  [1,0,1,1],[1,0,1,-1],[1,0,-1,1],[1,0,-1,-1],
  [-1,0,1,1],[-1,0,1,-1],[-1,0,-1,1],[-1,0,-1,-1],
  [1,1,0,1],[1,1,0,-1],[1,-1,0,1],[1,-1,0,-1],
  [-1,1,0,1],[-1,1,0,-1],[-1,-1,0,1],[-1,-1,0,-1],
  [1,1,1,0],[1,1,-1,0],[1,-1,1,0],[1,-1,-1,0],
  [-1,1,1,0],[-1,1,-1,0],[-1,-1,1,0],[-1,-1,-1,0]
];

for (let i = 0; i < 256; i++) perm[i] = i;
for (let i = 255; i > 0; i--) {
  const j = Math.floor(random() * (i + 1));
  const t = perm[i];
  perm[i] = perm[j];
  perm[j] = t;
}
for (let i = 0; i < 256; i++) perm[256 + i] = perm[i];

function dot4(g, x, y, z, w) {
  return g[0]*x + g[1]*y + g[2]*z + g[3]*w;
}

// 4D Simplex Noise function
const F4 = (Math.sqrt(5.0) - 1.0) / 4.0;
const G4 = (5.0 - Math.sqrt(5.0)) / 20.0;

function simplex4(x, y, z, w) {
  let n0, n1, n2, n3, n4;
  const s = (x + y + z + w) * F4;
  const i = Math.floor(x + s);
  const j = Math.floor(y + s);
  const k = Math.floor(z + s);
  const l = Math.floor(w + s);
  const t = (i + j + k + l) * G4;
  const X0 = i - t;
  const Y0 = j - t;
  const Z0 = k - t;
  const W0 = l - t;
  const x0 = x - X0;
  const y0 = y - Y0;
  const z0 = z - Z0;
  const w0 = w - W0;

  let c1 = (x0 > y0) ? 32 : 0;
  let c2 = (x0 > z0) ? 16 : 0;
  let c3 = (y0 > z0) ? 8 : 0;
  let c4 = (x0 > w0) ? 4 : 0;
  let c5 = (y0 > w0) ? 2 : 0;
  let c6 = (z0 > w0) ? 1 : 0;
  let c = c1 + c2 + c3 + c4 + c5 + c6;

  let i1, j1, k1, l1;
  let i2, j2, k2, l2;
  let i3, j3, k3, l3;

  i1 = c>=32?1:0; j1 = (c&16)?1:0; k1 = (c&8)?1:0; l1 = (c&4)?1:0;
  i2 = c>=48?1:0; j2 = (c&24)?1:0; k2 = (c&12)?1:0; l2 = (c&6)?1:0;
  i3 = c>=56?1:0; j3 = (c&28)?1:0; k3 = (c&14)?1:0; l3 = (c&7)?1:0;

  const x1 = x0 - i1 + G4;
  const y1 = y0 - j1 + G4;
  const z1 = z0 - k1 + G4;
  const w1 = w0 - l1 + G4;
  const x2 = x0 - i2 + 2.0*G4;
  const y2 = y0 - j2 + 2.0*G4;
  const z2 = z0 - k2 + 2.0*G4;
  const w2 = w0 - l2 + 2.0*G4;
  const x3 = x0 - i3 + 3.0*G4;
  const y3 = y0 - j3 + 3.0*G4;
  const z3 = z0 - k3 + 3.0*G4;
  const w3 = w0 - l3 + 3.0*G4;
  const x4 = x0 - 1.0 + 4.0*G4;
  const y4 = y0 - 1.0 + 4.0*G4;
  const z4 = z0 - 1.0 + 4.0*G4;
  const w4 = w0 - 1.0 + 4.0*G4;

  const ii = i & 255;
  const jj = j & 255;
  const kk = k & 255;
  const ll = l & 255;

  let t0 = 0.6 - x0*x0 - y0*y0 - z0*z0 - w0*w0;
  if (t0 < 0) n0 = 0.0;
  else {
    t0 *= t0;
    const gi0 = perm[ii + perm[jj + perm[kk + perm[ll]]]] % 32;
    n0 = t0 * t0 * dot4(grad4[gi0], x0, y0, z0, w0);
  }

  let t1 = 0.6 - x1*x1 - y1*y1 - z1*z1 - w1*w1;
  if (t1 < 0) n1 = 0.0;
  else {
    t1 *= t1;
    const gi1 = perm[ii + i1 + perm[jj + j1 + perm[kk + k1 + perm[ll + l1]]]] % 32;
    n1 = t1 * t1 * dot4(grad4[gi1], x1, y1, z1, w1);
  }

  let t2 = 0.6 - x2*x2 - y2*y2 - z2*z2 - w2*w2;
  if (t2 < 0) n2 = 0.0;
  else {
    t2 *= t2;
    const gi2 = perm[ii + i2 + perm[jj + j2 + perm[kk + k2 + perm[ll + l2]]]] % 32;
    n2 = t2 * t2 * dot4(grad4[gi2], x2, y2, z2, w2);
  }

  let t3 = 0.6 - x3*x3 - y3*y3 - z3*z3 - w3*w3;
  if (t3 < 0) n3 = 0.0;
  else {
    t3 *= t3;
    const gi3 = perm[ii + i3 + perm[jj + j3 + perm[kk + k3 + perm[ll + l3]]]] % 32;
    n3 = t3 * t3 * dot4(grad4[gi3], x3, y3, z3, w3);
  }

  let t4 = 0.6 - x4*x4 - y4*y4 - z4*z4 - w4*w4;
  if (t4 < 0) n4 = 0.0;
  else {
    t4 *= t4;
    const gi4 = perm[ii + 1 + perm[jj + 1 + perm[kk + 1 + perm[ll + 1]]]] % 32;
    n4 = t4 * t4 * dot4(grad4[gi4], x4, y4, z4, w4);
  }

  return 27.0 * (n0 + n1 + n2 + n3 + n4);
}

// Toroidal sampling: maps (u, v) in [0, 1] to 4D torus surface for 100% seamless wrap
function seamlessNoise(u, v, scale = 1.0) {
  const angleU = u * 2.0 * Math.PI;
  const angleV = v * 2.0 * Math.PI;
  const r = scale / (2.0 * Math.PI);
  const x = r * Math.cos(angleU);
  const y = r * Math.sin(angleU);
  const z = r * Math.cos(angleV);
  const w = r * Math.sin(angleV);
  return simplex4(x, y, z, w);
}

// Fractional Brownian Motion (multi-octave fractal sum)
function seamlessFbm(u, v, octaves = 5, lacunarity = 2.0, gain = 0.5, baseScale = 2.5) {
  let sum = 0.0;
  let amp = 1.0;
  let scale = baseScale;
  let maxAmp = 0.0;

  for (let i = 0; i < octaves; i++) {
    sum += seamlessNoise(u, v, scale) * amp;
    maxAmp += amp;
    amp *= gain;
    scale *= lacunarity;
  }
  return (sum / maxAmp) * 0.5 + 0.5; // Normalized to [0, 1]
}

// Periodic Worley Cellular Noise for organic cauliflower cloud billows
function seamlessWorley(u, v, cells = 4) {
  let minDist = 1.0;
  const gridU = u * cells;
  const gridV = v * cells;
  const cellU = Math.floor(gridU);
  const cellV = Math.floor(gridV);

  for (let di = -1; di <= 1; di++) {
    for (let dj = -1; dj <= 1; dj++) {
      const neighborU = (cellU + di + cells) % cells;
      const neighborV = (cellV + dj + cells) % cells;
      // Deterministic pseudo-random feature point inside each periodic cell
      const hash = perm[(neighborU * 37 + neighborV * 17) & 255] / 255.0;
      const hash2 = perm[(neighborU * 19 + neighborV * 43) & 255] / 255.0;
      const featureU = (cellU + di) + (0.2 + 0.6 * hash);
      const featureV = (cellV + dj) + (0.2 + 0.6 * hash2);

      const du = gridU - featureU;
      const dv = gridV - featureV;
      const dist = Math.sqrt(du * du + dv * dv);
      if (dist < minDist) minDist = dist;
    }
  }
  return 1.0 - Math.min(1.0, minDist); // Invert so cell centers are bright
}

console.log('Generating seamless cloud textures (512x512)...');

// 1. Generate Cumulus Texture
const cumulusPng = new PNG({ width: SIZE, height: SIZE });
for (let y = 0; y < SIZE; y++) {
  const v = y / SIZE;
  for (let x = 0; x < SIZE; x++) {
    const u = x / SIZE;
    const idx = (SIZE * y + x) << 2;

    // Macro billows: low-frequency fBm eroded by periodic Worley cells
    const macroFbm = seamlessFbm(u, v, 4, 2.0, 0.5, 2.0);
    const worley = seamlessWorley(u, v, 5);
    const billow = Math.max(0.0, macroFbm * 0.6 + worley * 0.5 - 0.15);

    // Mid-frequency detail
    const detail = seamlessFbm(u, v, 5, 2.2, 0.45, 6.0);

    // Micro wisps
    const micro = seamlessFbm(u, v, 4, 2.5, 0.4, 14.0);

    // Combined density with smooth organic soft-falloff curve
    let density = billow * 0.7 + detail * 0.3;
    density = Math.pow(Math.max(0.0, (density - 0.22) / 0.78), 1.4);
    density = Math.min(1.0, density * 1.3);

    cumulusPng.data[idx] = Math.round(billow * 255);       // R: Macro structure
    cumulusPng.data[idx + 1] = Math.round(detail * 255);   // G: Fluffy detail
    cumulusPng.data[idx + 2] = Math.round(micro * 255);    // B: Micro wisps
    cumulusPng.data[idx + 3] = Math.round(density * 255);  // A: Alpha mask
  }
}

// 2. Generate Cirrus Texture (High-altitude fibrous ice crystal filaments)
const cirrusPng = new PNG({ width: SIZE, height: SIZE });
for (let y = 0; y < SIZE; y++) {
  const v = y / SIZE;
  for (let x = 0; x < SIZE; x++) {
    const u = x / SIZE;
    const idx = (SIZE * y + x) << 2;

    // Anisotropic coordinate warp to simulate high-altitude jetstream wind shearing
    const warp = seamlessFbm(u, v, 3, 2.0, 0.5, 1.8) * 0.15;
    const warpU = (u + warp * 1.5) % 1.0;
    const warpV = (v + warp * 0.4) % 1.0;

    // High frequency directional filaments
    const filaments = seamlessFbm(warpU * 3.5, warpV * 1.2, 5, 2.3, 0.5, 3.0);
    const wisps = seamlessFbm(u * 5.0, v * 1.8, 4, 2.2, 0.4, 7.0);

    let density = filaments * 0.65 + wisps * 0.35;
    density = Math.pow(Math.max(0.0, (density - 0.35) / 0.65), 1.8);
    density = Math.min(1.0, density * 1.1);

    cirrusPng.data[idx] = Math.round(filaments * 255);
    cirrusPng.data[idx + 1] = Math.round(wisps * 255);
    cirrusPng.data[idx + 2] = 255;
    cirrusPng.data[idx + 3] = Math.round(density * 255);
  }
}

// Write to public/weather and assets/weather
const outDirs = [
  path.join(__dirname, '..', 'public', 'weather'),
  path.join(__dirname, '..', 'assets', 'weather'),
];

outDirs.forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const cumulusBuf = PNG.sync.write(cumulusPng);
const cirrusBuf = PNG.sync.write(cirrusPng);

outDirs.forEach(dir => {
  fs.writeFileSync(path.join(dir, 'cloud-cumulus.png'), cumulusBuf);
  fs.writeFileSync(path.join(dir, 'cloud-cirrus.png'), cirrusBuf);
});

console.log('✓ Successfully synthesized cloud textures:');
console.log('  - cloud-cumulus.png (' + (cumulusBuf.length / 1024).toFixed(1) + ' KB)');
console.log('  - cloud-cirrus.png (' + (cirrusBuf.length / 1024).toFixed(1) + ' KB)');
