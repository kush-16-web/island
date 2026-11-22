'use client';

import { useEffect, useMemo, useRef } from 'react';
import './GradientWaves.css';

/**
 * GradientWaves — Official ReactBits 3D WebGL2 Raymarched Wave Engine
 *
 * Raymarched satin waves rolling toward an atmospheric horizon:
 * - Direct WebGL2 raymarching with procedural surface derivatives
 * - Dynamic album color integration (body wave, luminous crest, deep horizon)
 * - Twinkling galaxy / starfield in the dark upper sky
 * - Organic music reactivity: swells and amplitudes pulse with live rhythm
 */

const ROOT = 'gradient-waves-container';
const CANVAS = 'gradient-waves-canvas';

const MAX_SWELLS = 4;
const SWELL_SECONDS = 3.2;
const SWELL_GAIN = 2.8;
const SWELL_WIDTH = 8;
const INTRO_SECONDS = 2.2;
const CAMERA_HEIGHT = 30;
const QUALITY = { low: 56, medium: 84, high: 120 };

const VERTEX = `#version 300 es
in vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const FRAGMENT = `#version 300 es
precision highp float;
uniform vec2 uResolution;
uniform float uTime;
uniform float uClock;
uniform float uAmplitude;
uniform float uWaveScale;
uniform float uWaveRatio;
uniform float uSwell;
uniform float uTurbulence;
uniform float uHeight;
uniform float uTilt;
uniform float uZoom;
uniform vec2 uLook;
uniform float uFogDepth;
uniform float uBrightness;
uniform float uOpacity;
uniform float uGrain;
uniform vec3 uHorizon;
uniform vec3 uWave;
uniform vec3 uCrest;
uniform vec3 uBackground;
uniform float uOpaque;
uniform float uLight;
uniform vec3 uSun;
uniform float uRelief;
uniform float uSheen;
uniform float uSteps;
uniform float uStride;
uniform vec3 uIntro;
uniform vec3 uSwells[${MAX_SWELLS}];
uniform float uSwellWidth;
uniform float uEnableStars;
out vec4 outColor;

const float FAR = 4000.0;

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec3 surface(vec2 xy) {
  vec2 freq = vec2(uWaveScale / 7.0, (uWaveScale * uWaveRatio) / 3.0);
  vec4 tc = vec4(uTime / 0.130, uTime / 0.810, uTime / 0.200, uTime / 0.710);
  float a = xy.x + tc.x;
  float swellPhase = (xy.y + a) / 20.0 + tc.y;
  float bend = uSwell * cos(swellPhase) / 20.0;
  float mx = a + uSwell * sin(swellPhase);
  float crossPhase = xy.x / 23.0 + tc.w;
  float my = xy.y - tc.z + uTurbulence * cos(crossPhase);
  float twist = -uTurbulence * sin(crossPhase) / 23.0;
  float cx = cos(mx * freq.x);
  float cy = cos(my * freq.y);
  float rise = 1.0;
  if (uIntro.z > 0.0) rise = mix(1.0, smoothstep(uIntro.y * 0.45, uIntro.y * 1.6, xy.x), uIntro.z);
  float amp = uAmplitude * rise;
  float h = (sin(mx * freq.x) + sin(my * freq.y)) * amp + uHeight;
  float dx = amp * (freq.x * cx * (1.0 + bend) + freq.y * cy * twist);
  float dy = amp * (freq.x * cx * bend + freq.y * cy);
  for (int k = 0; k < ${MAX_SWELLS}; k++) {
    vec3 sw = uSwells[k];
    if (sw.z <= 0.0) continue;
    float u = (xy.x - sw.x) / uSwellWidth;
    float v = (xy.y - sw.y) / (uSwellWidth * 3.5);
    float bump = sw.z * exp(-u * u - v * v);
    h += bump;
    dx += bump * (-2.0 * u / uSwellWidth);
    dy += bump * (-2.0 * v / (uSwellWidth * 3.5));
  }
  return vec3(h, dx, dy);
}

float march(vec3 origin, vec3 dir) {
  float dist = 0.0;
  for (int i = 0; i < 128; i++) {
    if (float(i) >= uSteps) break;
    float gap = origin.z + dist * dir.z - surface(origin.xy + dist * dir.xy).x;
    if (abs(gap) < 0.002 * dist + 0.01) break;
    dist += uStride * gap;
    if (!(abs(dist) < FAR)) return FAR;
  }
  return dist;
}

void main() {
  float c;
  float s;
  float vfov = (3.14159 / 2.3) / max(uZoom, 0.05);
  vec3 cam = vec3(0.0, 0.0, ${CAMERA_HEIGHT.toFixed(1)});
  vec2 uv = gl_FragCoord.xy / uResolution - 0.5;
  uv.x *= uResolution.x / uResolution.y;
  uv.y *= -1.0;

  vec3 dir = vec3(0.0, 0.0, -1.0);
  float ulen = length(uv);
  float xrot = vfov * ulen;
  c = cos(xrot);
  s = sin(xrot);
  dir = mat3(1.0, 0.0, 0.0, 0.0, c, -s, 0.0, s, c) * dir;
  vec2 nuv = ulen > 1e-5 ? uv / ulen : vec2(1.0, 0.0);
  dir = mat3(nuv.x, -nuv.y, 0.0, nuv.y, nuv.x, 0.0, 0.0, 0.0, 1.0) * dir;
  c = cos(uTilt + uLook.y);
  s = sin(uTilt + uLook.y);
  dir = mat3(c, 0.0, s, 0.0, 1.0, 0.0, -s, 0.0, c) * dir;
  c = cos(uLook.x);
  s = sin(uLook.x);
  dir = mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0) * dir;

  float dist = march(cam, dir);
  vec3 pos = cam + dist * dir;
  vec3 field = surface(pos.xy);
  vec3 view = -dir;

  float crest = clamp((field.x - uHeight) / max(2.0 * uAmplitude, 0.001) * 0.5 + 0.5, 0.0, 1.0);
  vec3 body = mix(uWave, uCrest, smoothstep(0.45, 1.0, crest) * 0.5);
  vec3 normal = normalize(vec3(-field.yz * (1.0 + 1.5 * uRelief), 1.0));
  float diffuse = clamp(dot(normal, uSun) * 0.5 + 0.5, 0.0, 1.0);
  float lightness = mix(1.0, diffuse * diffuse * (3.0 - 2.0 * diffuse), uRelief);
  float sheen = pow(clamp(dot(normal, normalize(uSun + view)), 0.0, 1.0), 14.0) * uSheen * (0.4 + 0.6 * uRelief);
  float rim = pow(1.0 - clamp(dot(normal, view), 0.0, 1.0), 3.0);

  vec3 col;
  float alpha;
  float haze = 1.0 - exp(-dist / (uFogDepth * 5.0));
  float fade = 1.0 - smoothstep(0.35, 1.0, haze);
  if (uLight < 0.5) {
    vec3 lit = mix(uHorizon * 0.18, body, lightness) + uCrest * sheen;
    lit = mix(lit, uHorizon, rim * 0.15 * uRelief);
    col = mix(lit, uHorizon, smoothstep(0.0, 1.0, haze)) * 0.85 * uBrightness;
    alpha = fade;
  } else {
    vec3 hue = mix(uHorizon, body, 0.35 + 0.65 * lightness);
    float density = mix(0.16, 0.9, 1.0 - lightness);
    density *= 1.0 - clamp(sheen, 0.0, 1.0) * 0.85;
    density *= 1.0 - 0.5 * smoothstep(0.0, 1.0, haze);
    col = hue;
    alpha = fade * clamp(density * uBrightness, 0.0, 1.0);
  }

  // Procedural twinkling celestial starfield in the upper dark sky (above the rolling waves)
  if (uEnableStars > 0.5) {
    float skyArea = clamp(1.0 - alpha, 0.0, 1.0) * smoothstep(-0.02, 0.35, -dir.y);
    if (skyArea > 0.005) {
      // 1. Soft cosmic celestial nebula glow along the wave horizon
      float horizonCosmic = pow(clamp(-dir.y * 2.4, 0.0, 1.0), 2.2) * skyArea;
      vec3 nebulaCol = mix(uHorizon * 0.5, uWave * 0.4, 0.5);
      col += nebulaCol * horizonCosmic * 0.32;

      // 2. Multi-layer procedural stars with smooth Gaussian cores and soft halos
      // Layer A: Distant delicate starry dust (fine grid, cell size 26px)
      vec2 gridA = gl_FragCoord.xy / 26.0;
      vec2 idA = floor(gridA);
      vec2 gvA = fract(gridA) - 0.5;
      float seedA = hash(idA * 1.37 + 19.4);
      if (seedA > 0.80) {
        vec2 offsetA = (vec2(hash(idA + 31.7), hash(idA + 83.1)) - 0.5) * 0.70;
        float distA = length(gvA - offsetA);
        float twinkleA = sin(uClock * (1.2 + 2.5 * hash(idA + 7.3)) + seedA * 6.28) * 0.35 + 0.65;
        // Soft Gaussian core (no square or 1px cutoffs)
        float starA = exp(-distA * distA * 42.0) * twinkleA * skyArea * 0.70;
        vec3 colA = mix(vec3(0.88, 0.93, 1.0), uCrest, 0.25);
        col += colA * starA;
        alpha = max(alpha, starA * 0.85);
      }

      // Layer B: Hero bright celestial stars with soft radiant halos and subtle diffraction cross
      vec2 gridB = gl_FragCoord.xy / 62.0;
      vec2 idB = floor(gridB);
      vec2 gvB = fract(gridB) - 0.5;
      float seedB = hash(idB * 2.71 + 53.9);
      if (seedB > 0.86) {
        vec2 offsetB = (vec2(hash(idB + 14.2), hash(idB + 67.8)) - 0.5) * 0.65;
        vec2 deltaB = gvB - offsetB;
        float distB = length(deltaB);
        float twinkleB = sin(uClock * (0.8 + 1.6 * hash(idB + 41.5)) + seedB * 6.28) * 0.4 + 0.6;
        
        // Intense bright core (Gaussian)
        float coreB = exp(-distB * distB * 55.0);
        // Soft ambient halo around star
        float haloB = exp(-distB * distB * 10.0) * 0.38;
        // Subtle 4-point cross diffraction spike
        float spikesB = max(0.0, 1.0 - abs(deltaB.x) * 20.0) * max(0.0, 1.0 - abs(deltaB.y) * 3.5)
                      + max(0.0, 1.0 - abs(deltaB.y) * 20.0) * max(0.0, 1.0 - abs(deltaB.x) * 3.5);
        spikesB = spikesB * 0.22;

        float starB = (coreB + haloB + spikesB) * twinkleB * skyArea;
        vec3 colB = mix(vec3(0.96, 0.98, 1.0), uCrest, 0.35);
        col += colB * starB * 1.35;
        alpha = max(alpha, starB * 0.95);
      }
    }
  }

  float reveal = uIntro.x;
  col = clamp(col, 0.0, 1.0);
  float grain = (hash(gl_FragCoord.xy + fract(uClock) * 64.0) - 0.5) * uGrain;
  alpha = clamp(alpha * (1.0 + grain), 0.0, 1.0) * reveal * uOpacity;
  if (uOpaque > 0.5) {
    outColor = vec4(mix(uBackground, col, alpha), 1.0);
  } else {
    outColor = vec4(col * alpha, alpha);
  }
}`;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

let probe = null;
const parseColor = (value, fallback) => {
  if (value === 'transparent') return null;
  if (typeof document === 'undefined') return fallback;
  if (!probe) probe = document.createElement('canvas').getContext('2d');
  if (!probe) return fallback;
  probe.fillStyle = '#000000';
  probe.fillStyle = value;
  const text = probe.fillStyle;
  if (text.startsWith('#')) {
    const hex = parseInt(text.slice(1), 16);
    return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
  }
  const match = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/.exec(text);
  if (!match) return fallback;
  if (match[4] !== undefined && Number(match[4]) === 0) return null;
  return [Number(match[1]) / 255, Number(match[2]) / 255, Number(match[3]) / 255];
};

const compile = (gl, type, source) => {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
};

const prefersReduced = () =>
  typeof window !== 'undefined' && (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);

export default function GradientWaves({
  color = '#5227FF',
  speed = 0.35,
  paused = false,
  beatPulse = 0,
  bloomPulse = 0,
  melodyPulse = 0,
  amplitude = 2.1,
  waveScale = 0.52,
  waveRatio = 0.88,
  swell = 26,
  turbulence = 16,
  tilt = 58,
  zoom = 1.05,
  height = 5.0,
  fogDepth = 22,
  relief = 0.92,
  lightAngle = 120,
  sheen = 0.18,
  brightness = 1.05,
  opacity = 1,
  grain = 0.05,
  quality = 'medium',
  enableStars = true,
  className = '',
  style = {}
}) {
  const containerRef = useRef(null);

  // Derive atmospheric color palette from album cover accent color
  const waveRgb = useMemo(() => parseColor(color, [0.35, 0.18, 0.85]) ?? [0.35, 0.18, 0.85], [color]);
  
  // Luminous crest: warm bright tint of the accent color
  const crestRgb = useMemo(() => {
    return [
      Math.min(1.0, waveRgb[0] * 0.75 + 0.45),
      Math.min(1.0, waveRgb[1] * 0.75 + 0.45),
      Math.min(1.0, waveRgb[2] * 0.75 + 0.45),
    ];
  }, [waveRgb]);

  // Horizon: deeper atmospheric mood
  const horizonRgb = useMemo(() => {
    return [
      waveRgb[0] * 0.35 + 0.05,
      waveRgb[1] * 0.30 + 0.04,
      waveRgb[2] * 0.45 + 0.08,
    ];
  }, [waveRgb]);

  const settings = {
    horizon: horizonRgb,
    wave: waveRgb,
    crest: crestRgb,
    paper: [0.02, 0.02, 0.025], // pitch-black stage ground
    lightMode: false,
    speed,
    amplitude,
    waveScale: Math.max(0.01, waveScale),
    waveRatio: Math.max(0.01, waveRatio),
    swell,
    turbulence,
    tilt: (clamp(tilt, 10, 85) * Math.PI) / 180,
    zoom: Math.max(0.05, zoom),
    height,
    fogDepth: Math.max(0.5, fogDepth),
    relief: clamp(relief, 0, 1),
    lightAngle: (lightAngle * Math.PI) / 180,
    sheen: Math.max(0, sheen),
    brightness: Math.max(0, brightness),
    opacity: clamp(opacity, 0, 1),
    grain: typeof grain === 'number' ? Math.max(0, grain) : 0.05,
    steps: QUALITY[quality] ?? QUALITY.medium,
    enableStars: enableStars ? 1.0 : 0.0,
    intro: true,
    mouseInteraction: true,
    parallaxStrength: 0.4,
    mouseStrength: 0.5,
    swellOnClick: true,
    paused,
    beatPulse: beatPulse || 0,
    bloomPulse: bloomPulse || 0,
    melodyPulse: melodyPulse || 0,
    dpr: 1.5,
  };

  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const wakeRef = useRef(null);

  useEffect(() => {
    wakeRef.current?.();
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const canvas = document.createElement('canvas');
    canvas.className = CANVAS;
    container.appendChild(canvas);
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      powerPreference: 'high-performance'
    });
    if (!gl) {
      canvas.remove();
      return undefined;
    }
    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
    const program = gl.createProgram();
    if (!vertex || !fragment || !program) {
      canvas.remove();
      return undefined;
    }
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.bindAttribLocation(program, 0, 'aPosition');
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      canvas.remove();
      return undefined;
    }
    const names = [
      'uResolution',
      'uTime',
      'uClock',
      'uAmplitude',
      'uWaveScale',
      'uWaveRatio',
      'uSwell',
      'uTurbulence',
      'uHeight',
      'uTilt',
      'uZoom',
      'uLook',
      'uFogDepth',
      'uBrightness',
      'uOpacity',
      'uGrain',
      'uHorizon',
      'uWave',
      'uCrest',
      'uBackground',
      'uOpaque',
      'uLight',
      'uSun',
      'uRelief',
      'uSheen',
      'uSteps',
      'uStride',
      'uIntro',
      'uSwells',
      'uSwellWidth',
      'uEnableStars'
    ];
    const u = {};
    names.forEach((name) => {
      u[name] = gl.getUniformLocation(program, name);
    });
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.useProgram(program);

    const swellData = new Float32Array(MAX_SWELLS * 3);
    const state = {
      width: 1,
      height: 1,
      cssWidth: 0,
      cssHeight: 0,
      time: 0,
      clock: 0,
      last: 0,
      raf: 0,
      visible: false,
      introAt: -1,
      pointer: [0.5, 0.5],
      inside: false,
      look: [0, 0],
      steer: [0, 0],
      swells: [],
      quiet: 0,
      seen: null,
      amp: settings.amplitude,
      swell: settings.swell,
      speed: settings.speed,
    };

    const fit = () => {
      const s = settingsRef.current;
      const ratio = Math.min(window.devicePixelRatio || 1, s.dpr);
      const width = Math.max(1, Math.round(state.cssWidth * ratio));
      const height = Math.max(1, Math.round(state.cssHeight * ratio));
      if (width === state.width && height === state.height) return;
      state.quiet = 0;
      state.width = width;
      state.height = height;
      canvas.width = width;
      canvas.height = height;
    };

    const measure = () => {
      state.cssWidth = container.clientWidth;
      state.cssHeight = container.clientHeight;
      state.quiet = 0;
      wake();
    };

    const introProgress = (s, reduced) => {
      if (!s.intro || reduced || state.introAt < 0) return 1;
      return clamp((state.clock - state.introAt) / INTRO_SECONDS, 0, 1);
    };

    const render = (reduced) => {
      const s = settingsRef.current;
      gl.viewport(0, 0, state.width, state.height);
      gl.uniform2f(u.uResolution, state.width, state.height);
      gl.uniform1f(u.uTime, state.time);
      gl.uniform1f(u.uClock, state.clock);
      gl.uniform1f(u.uAmplitude, state.amp);
      gl.uniform1f(u.uWaveScale, s.waveScale);
      gl.uniform1f(u.uWaveRatio, s.waveRatio);
      gl.uniform1f(u.uSwell, state.swell);
      gl.uniform1f(u.uTurbulence, s.turbulence);
      gl.uniform1f(u.uHeight, s.height);
      gl.uniform1f(u.uTilt, s.tilt);
      gl.uniform1f(u.uZoom, s.zoom);
      gl.uniform2f(u.uLook, state.look[0], state.look[1]);
      gl.uniform1f(u.uFogDepth, s.fogDepth);
      gl.uniform1f(u.uBrightness, s.brightness);
      gl.uniform1f(u.uOpacity, s.opacity);
      gl.uniform1f(u.uGrain, s.grain);
      gl.uniform3fv(u.uHorizon, s.horizon);
      gl.uniform3fv(u.uWave, s.wave);
      gl.uniform3fv(u.uCrest, s.crest);
      const paperColor = s.paper ?? [0.02, 0.02, 0.025];
      gl.uniform3f(u.uBackground, paperColor[0], paperColor[1], paperColor[2]);
      gl.uniform1f(u.uOpaque, 1);
      gl.uniform1f(u.uLight, s.lightMode ? 1 : 0);
      gl.uniform1f(u.uEnableStars, s.enableStars);
      const elevation = 0.52;
      const angle = s.lightAngle + state.steer[0] * s.mouseStrength * 2;
      const altitude = elevation - state.steer[1] * s.mouseStrength * 0.7;
      gl.uniform3f(
        u.uSun,
        Math.cos(altitude) * Math.cos(angle),
        Math.cos(altitude) * Math.sin(angle),
        Math.sin(altitude)
      );
      gl.uniform1f(u.uRelief, s.relief);
      gl.uniform1f(u.uSheen, s.sheen);
      gl.uniform1f(u.uSteps, s.steps);
      const slope =
        state.amp *
        ((s.waveScale / 7) * (1 + Math.abs(state.swell) / 20) +
          ((s.waveScale * s.waveRatio) / 3) * (1 + Math.abs(s.turbulence) / 23));
      const progress = introProgress(s, reduced);
      const shown = Math.min(1, progress / 0.22);
      const crest = 160 * Math.pow(3 / 160, easeInOut(Math.max(0, (progress - 0.1) / 0.9)));
      const settle = clamp((progress - 0.75) / 0.25, 0, 1);
      gl.uniform3f(u.uIntro, shown * shown * (3 - 2 * shown), crest, 1 - settle * settle * (3 - 2 * settle));
      swellData.fill(0);
      let swellPeak = 0;
      state.swells.forEach((swell, index) => {
        const age = state.clock - swell.at;
        const life = age / SWELL_SECONDS;
        const envelope = (1 - Math.exp(-age / 0.25)) * Math.pow(1 - life, 1.6);
        const lift = state.amp * SWELL_GAIN * envelope;
        swellData.set([swell.x - age * 12, swell.y, lift], index * 3);
        swellPeak = Math.max(swellPeak, lift);
      });
      gl.uniform3fv(u.uSwells, swellData);
      gl.uniform1f(u.uSwellWidth, SWELL_WIDTH);
      gl.uniform1f(u.uStride, 0.9 / Math.max(1, (slope + (swellPeak * 0.86) / SWELL_WIDTH) / 1.5));
      gl.clearColor(0.02, 0.02, 0.025, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const tick = (now) => {
      state.raf = 0;
      if (!state.visible || document.hidden) return;
      const s = settingsRef.current;
      const dt = state.last ? Math.min((now - state.last) / 1000, 0.1) : 0;
      state.last = now;
      const reduced = prefersReduced();
      state.clock += dt;
      if (state.introAt < 0) state.introAt = state.clock;

      // Smooth fluid physics inertia:
      // Music targets with gentle headroom (no jarring multipliers)
      const targetAmp = s.amplitude * (1.0 + (s.beatPulse || 0) * 0.22 + (s.bloomPulse || 0) * 0.14);
      const targetSwell = s.swell * (1.0 + (s.beatPulse || 0) * 0.18);
      const targetSpeed = s.paused ? 0 : s.speed * (1.0 + (s.melodyPulse || 0) * 0.18);

      // Smooth exponential damping: water has heavy inertia
      const ampEase = targetAmp > state.amp ? 1 - Math.exp(-dt * 3.4) : 1 - Math.exp(-dt * 1.6);
      state.amp += (targetAmp - state.amp) * ampEase;

      const swellEase = 1 - Math.exp(-dt * 2.2);
      state.swell += (targetSwell - state.swell) * swellEase;

      const speedEase = 1 - Math.exp(-dt * 1.8);
      state.speed += (targetSpeed - state.speed) * speedEase;

      if (!s.paused && !reduced) state.time += dt * state.speed;

      const steering = s.mouseInteraction && state.inside && !reduced;
      const target = steering ? state.pointer : [0.5, 0.5];
      const ease = 1 - Math.exp(-dt / 0.45);
      const goalX = (target[0] - 0.5) * s.parallaxStrength * 0.35;
      const goalY = (target[1] - 0.5) * s.parallaxStrength * 0.18;
      state.look[0] += (goalX - state.look[0]) * ease;
      state.look[1] += (goalY - state.look[1]) * ease;
      const moving = Math.abs(goalX - state.look[0]) + Math.abs(goalY - state.look[1]) > 0.0002;

      const steerEase = 1 - Math.exp(-dt / 0.6);
      const steerX = steering ? state.pointer[0] - 0.5 : 0;
      const steerY = steering ? 0.5 - state.pointer[1] : 0;
      state.steer[0] += (steerX - state.steer[0]) * steerEase;
      state.steer[1] += (steerY - state.steer[1]) * steerEase;
      const turning = Math.abs(steerX - state.steer[0]) + Math.abs(steerY - state.steer[1]) > 0.0005;
      state.swells = state.swells.filter((swell) => state.clock - swell.at < SWELL_SECONDS);

      const still = s.paused || reduced;
      const isAudioActive = (s.beatPulse > 0.005) || (s.bloomPulse > 0.005) || Math.abs(state.amp - s.amplitude) > 0.02;
      const transient = moving || turning || state.swells.length > 0 || introProgress(s, reduced) < 1 || isAudioActive;
      if (state.seen !== s || transient || !still) state.quiet = 0;
      else state.quiet += 1;
      state.seen = s;
      if (state.quiet > 3) return;

      state.raf = requestAnimationFrame(tick);
      fit();
      render(reduced);
    };

    const wake = () => {
      if (state.raf || !state.visible || document.hidden) return;
      state.last = 0;
      state.quiet = 0;
      state.raf = requestAnimationFrame(tick);
    };
    wakeRef.current = wake;

    const ro = new ResizeObserver(measure);
    ro.observe(container);

    const io = new IntersectionObserver(([entry]) => {
      state.visible = entry.isIntersecting;
      if (state.visible) {
        state.quiet = 0;
        wake();
      }
    });
    io.observe(container);

    const onPointerMove = (e) => {
      const rect = container.getBoundingClientRect();
      state.pointer = [(e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height];
      state.inside = true;
      wake();
    };

    const onPointerLeave = () => {
      state.inside = false;
      wake();
    };

    const onPointerDown = (e) => {
      const s = settingsRef.current;
      if (!s.swellOnClick || prefersReduced()) return;
      const rect = container.getBoundingClientRect();
      const pt = [(e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height];
      state.swells.push({ at: state.clock, x: pt[0] * 40 - 20, y: pt[1] * 40 - 20 });
      if (state.swells.length > MAX_SWELLS) state.swells.shift();
      wake();
    };

    container.addEventListener('pointermove', onPointerMove, { passive: true });
    container.addEventListener('pointerleave', onPointerLeave, { passive: true });
    container.addEventListener('pointerdown', onPointerDown, { passive: true });

    measure();
    fit();
    render(prefersReduced());

    return () => {
      wakeRef.current = null;
      ro.disconnect();
      io.disconnect();
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerleave', onPointerLeave);
      container.removeEventListener('pointerdown', onPointerDown);
      if (state.raf) cancelAnimationFrame(state.raf);
      gl.deleteProgram(program);
      gl.deleteBuffer(buffer);
      gl.deleteVertexArray(vao);
      canvas.remove();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={`${ROOT} ${className}`}
      style={style}
      aria-hidden="true"
    />
  );
}
