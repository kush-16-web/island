import React, { useEffect, useRef } from 'react';
import './MetaBalls.css';

/**
 * MetaBalls — Official ReactBits WebGL2 Component
 * Liquid metaballs that merge, stretch and pinch apart using an analytical GLSL fragment shader.
 * Source: https://reactbits.dev/animations/meta-balls
 */

const MAX_BALLS = 50;
const SLOTS = MAX_BALLS + 1;
const VARIANTS = { solid: 0, outline: 1, contour: 2 };

const fract = (x) => x - Math.floor(x);

const hash31 = (p) => {
  const r = [p * 0.1031, p * 0.103, p * 0.0973].map(fract);
  const dot = r[0] * (r[1] + 33.33) + r[1] * (r[2] + 33.33) + r[2] * (r[0] + 33.33);
  return r.map((value) => fract(value + dot));
};

const hash33 = (v) => {
  const p = [v[0] * 0.1031, v[1] * 0.103, v[2] * 0.0973].map(fract);
  const dot = p[0] * (p[1] + 33.33) + p[1] * (p[0] + 33.33) + p[2] * (p[2] + 33.33);
  const q = p.map((value) => fract(value + dot));
  return [fract((q[0] + q[1]) * q[2]), fract((q[0] + q[0]) * q[1]), fract((q[1] + q[0]) * q[0])];
};

const toRgb = (color) => {
  if (!color) return [1, 1, 1];
  const s = String(color).trim();

  // 1. Hex: #rgb or #rrggbb
  if (s.startsWith('#') || /^[0-9a-f]{3,6}$/i.test(s)) {
    let hex = s.replace('#', '');
    if (hex.length === 3) hex = hex.replace(/./g, (c) => c + c);
    if (/^[0-9a-f]{6}/i.test(hex)) {
      return [0, 2, 4].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255);
    }
  }

  // 2. Browser DOM canvas resolution (handles ANY valid CSS color: modern hsl space-separated, oklab, named colors, etc.)
  if (typeof document !== 'undefined') {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        ctx.fillStyle = s;
        ctx.fillRect(0, 0, 1, 1);
        const data = ctx.getImageData(0, 0, 1, 1).data;
        if (data && data.length >= 3) {
          return [data[0] / 255, data[1] / 255, data[2] / 255];
        }
      }
    } catch {}
  }

  // 3. Regex fallback for rgba / rgb
  const rgbParts = s.match(/rgba?\(\s*([0-9.]+)[,\s]+([0-9.]+)[,\s]+([0-9.]+)/i);
  if (rgbParts) {
    return [
      Math.min(1, Math.max(0, parseFloat(rgbParts[1]) / 255)),
      Math.min(1, Math.max(0, parseFloat(rgbParts[2]) / 255)),
      Math.min(1, Math.max(0, parseFloat(rgbParts[3]) / 255)),
    ];
  }

  return [1, 1, 1];
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

const VERTEX = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const FRAGMENT = `#version 300 es
precision highp float;

uniform vec2 uResolution;
uniform vec2 uOrigin;
uniform float uScale;
uniform vec4 uBalls[${SLOTS}];
uniform vec4 uShapes[${SLOTS}];
uniform int uCount;
uniform float uGamma;
uniform float uThreshold;
uniform vec3 uColor;
uniform vec3 uCursorColor;
uniform int uVariant;
uniform float uLine;
uniform float uSpacing;
uniform float uRings;
uniform float uOpaque;

out vec4 outColor;

void main() {
  vec2 p = (gl_FragCoord.xy - uOrigin * uResolution) * uScale;
  float field = 0.0;
  float tint = 0.0;
  float mass = 0.0;
  vec2 grad = vec2(0.0);
  bool classic = abs(uGamma - 1.0) < 0.001;
  for (int i = 0; i < ${SLOTS}; i++) {
    if (i >= uCount) break;
    vec4 ball = uBalls[i];
    vec4 shape = uShapes[i];
    vec2 d = p - ball.xy;
    vec2 q = vec2(shape.x * d.x + shape.y * d.y, shape.y * d.x + shape.z * d.y);
    float qq = max(dot(q, q), ball.z * 1e-4 + 1e-12);
    float v = ball.z / qq;
    float w = classic ? v : pow(v, uGamma);
    field += w;
    float weight = w / (1.0 + w / uThreshold);
    mass += weight;
    tint += weight * ball.w;
    grad -= 2.0 * uGamma * w / qq * vec2(shape.x * q.x + shape.y * q.y, shape.y * q.x + shape.z * q.y);
  }
  float slope = max(length(grad) * uScale, 1e-8);
  vec3 color = mix(uColor, uCursorColor, mass > 0.0 ? clamp(tint / mass, 0.0, 1.0) : 0.0);
  float alpha;
  if (uVariant == 0) {
    alpha = field > 3.0 * uThreshold ? 1.0 : clamp((field - uThreshold) / slope + 0.5, 0.0, 1.0);
  } else if (uVariant == 1) {
    alpha = field > 3.0 * uThreshold ? 0.0 : clamp(0.5 * uLine + 0.5 - abs((field - uThreshold) / slope), 0.0, 1.0);
  } else {
    float rho = pow(max(field / uThreshold, 1e-6), -0.5 / uGamma);
    float rate = rho * slope / (2.0 * uGamma * max(field, 1e-8));
    float u = (rho - 1.0) / uSpacing;
    float ring = floor(u + 0.5);
    float gap = (u - ring) * uSpacing / max(rate, 1e-8);
    alpha = clamp(0.5 * uLine + 0.5 - abs(gap), 0.0, 1.0);
    alpha *= ring < -0.5 || ring > uRings + 0.5 ? 0.0 : 1.0 - ring / (uRings + 1.0);
    if (ring > 0.5) alpha *= smoothstep(uLine * 6.0, uLine * 12.0, uSpacing);
  }
  alpha = clamp(alpha, 0.0, 1.0);
  if (uOpaque > 0.5) {
    outColor = vec4(mix(vec3(0.0), color, alpha), 1.0);
  } else {
    outColor = vec4(color, alpha);
  }
}
`;

export default function MetaBalls({
  color = '#ffffff',
  cursorBallColor = '#ffffff',
  speed = 0.3,
  animationSize = 30,
  ballCount = 15,
  clumpFactor = 1,
  cursorBallSize = 2.5,
  hoverSmoothness = 0.05,
  variant = 'solid',
  lineWidth = 1.5,
  rings = 4,
  gooeyness = 0.5,
  wobble = 0.5,
  stretch = 0.5,
  stickiness = 0.5,
  originX = 0.72,
  originY = 0.50,
  enableMouseInteraction = false,
  enableTransparency = true,
  paused = false,
  beatPulse = 0,
  bloomPulse = 0,
  className = '',
  style = {},
}) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const settingsRef = useRef({
    color,
    cursorBallColor,
    speed,
    animationSize,
    ballCount,
    clumpFactor,
    cursorBallSize,
    hoverSmoothness,
    variant,
    lineWidth,
    rings,
    gooeyness,
    wobble,
    stretch,
    stickiness,
    originX,
    originY,
    enableMouseInteraction,
    enableTransparency,
    paused,
  });

  settingsRef.current = {
    color,
    cursorBallColor,
    speed,
    animationSize,
    ballCount,
    clumpFactor,
    cursorBallSize,
    hoverSmoothness,
    variant,
    lineWidth,
    rings,
    gooeyness,
    wobble,
    stretch,
    stickiness,
    originX,
    originY,
    enableMouseInteraction,
    enableTransparency,
    paused,
  };

  const beatPulseRef = useRef(beatPulse);
  beatPulseRef.current = beatPulse;

  const bloomPulseRef = useRef(bloomPulse);
  bloomPulseRef.current = bloomPulse;

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    let gl;
    try {
      gl = canvas.getContext('webgl2', {
        antialias: true,
        alpha: true,
        premultipliedAlpha: false,
      });
    } catch {
      return;
    }
    if (!gl) return;

    const compile = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      return shader;
    };

    const vs = compile(gl.VERTEX_SHADER, VERTEX);
    const fs = compile(gl.FRAGMENT_SHADER, FRAGMENT);
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

    const pos = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
    gl.useProgram(program);

    const loc = {
      resolution: gl.getUniformLocation(program, 'uResolution'),
      origin: gl.getUniformLocation(program, 'uOrigin'),
      scale: gl.getUniformLocation(program, 'uScale'),
      balls: gl.getUniformLocation(program, 'uBalls'),
      shapes: gl.getUniformLocation(program, 'uShapes'),
      count: gl.getUniformLocation(program, 'uCount'),
      gamma: gl.getUniformLocation(program, 'uGamma'),
      threshold: gl.getUniformLocation(program, 'uThreshold'),
      color: gl.getUniformLocation(program, 'uColor'),
      cursorColor: gl.getUniformLocation(program, 'uCursorColor'),
      variant: gl.getUniformLocation(program, 'uVariant'),
      line: gl.getUniformLocation(program, 'uLine'),
      spacing: gl.getUniformLocation(program, 'uSpacing'),
      rings: gl.getUniformLocation(program, 'uRings'),
      opaque: gl.getUniformLocation(program, 'uOpaque'),
    };

    const ballData = new Float32Array(SLOTS * 4);
    const shapeData = new Float32Array(SLOTS * 4);

    const balls = [];
    for (let i = 0; i < MAX_BALLS; i++) {
      const h1 = hash31(i + 1);
      const h2 = hash33([i + 1, (i + 1) * 2, (i + 1) * 3]);
      const isSatellite = i >= 8;
      balls.push({
        x: (h1[0] - 0.5) * 16,
        y: (h1[1] - 0.5) * 16,
        vx: 0,
        vy: 0,
        radius: 0.9 + h1[2] * 0.9,
        phase: h2[0] * Math.PI * 2,
        freq: 0.8 + h2[1] * 1.4,
        q11: 1,
        q12: 0,
        q22: 1,
        qw: 0,
        cluster: i % 3,
        isSatellite,
        satelliteProgress: isSatellite ? ((i - 8) / 6) : 0,
        satelliteAngle: (h2[2] - 0.5) * Math.PI * 0.85,
        satelliteSpeed: 0.25 + h1[1] * 0.35,
      });
    }

    let raf = 0;
    let last = 0;
    let clock = 0;

    const rgbCache = {};
    const rgb = (c) => {
      if (!rgbCache[c]) rgbCache[c] = toRgb(c);
      return rgbCache[c];
    };

    const shapeOf = (b, out, offset) => {
      out[offset] = b.q11 || 1;
      out[offset + 1] = b.q12 || 0;
      out[offset + 2] = b.q22 || 1;
      out[offset + 3] = b.qw || 0;
    };

    const draw = () => {
      const s = settingsRef.current;
      const count = clamp(Math.round(s.ballCount), 0, MAX_BALLS);
      const gamma = 1.0;
      const threshold = 1.0;

      const beat = beatPulseRef.current || 0;

      for (let i = 0; i < count; i++) {
        const b = balls[i];
        let r;
        if (b.isSatellite) {
          // Satellite calving droplet: bridges, pinches off, and evaporates as it drifts into the void
          const fade = Math.max(0, 1.0 - Math.pow(b.satelliteProgress, 1.4));
          r = b.radius * 0.72 * fade * (1 + beat * 0.18);
        } else {
          // Mother core swells smoothly on beat
          r = b.radius * (1 + beat * 0.18);
        }
        ballData[i * 4] = b.x;
        ballData[i * 4 + 1] = b.y;
        ballData[i * 4 + 2] = r * r;
        ballData[i * 4 + 3] = 0;
        shapeOf(b, shapeData, i * 4);
      }

      // Buoyant living aquatic float (gently wanders ±2% X and ±3.5% Y to feel alive and floating)
      const driftX = Math.sin(clock * 0.32) * 0.02;
      const driftY = Math.cos(clock * 0.24) * 0.035;
      const originX = (s.originX ?? 0.52) + driftX;
      const originY = (s.originY ?? 0.58) + driftY;

      // Soft, warm ambient luminescence: only fires on heavy musical accents, easy on the eyes
      const baseRgb = rgb(s.color);
      const bloom = clamp(bloomPulseRef.current || 0, 0, 1);
      // Soft, warm golden ember lift: never harsh white strobe
      const bloomedColor = [
        Math.min(1.0, baseRgb[0] * (1 + bloom * 0.18) + bloom * 0.07),
        Math.min(1.0, baseRgb[1] * (1 + bloom * 0.14) + bloom * 0.04),
        Math.min(1.0, baseRgb[2] * (1 + bloom * 0.08) + bloom * 0.015),
      ];

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(loc.resolution, canvas.width, canvas.height);
      gl.uniform2f(loc.origin, originX, originY);
      gl.uniform1f(loc.scale, s.animationSize / Math.max(1, canvas.height));
      gl.uniform4fv(loc.balls, ballData);
      gl.uniform4fv(loc.shapes, shapeData);
      gl.uniform1i(loc.count, count);
      gl.uniform1f(loc.gamma, gamma);
      gl.uniform1f(loc.threshold, threshold);
      gl.uniform3fv(loc.color, bloomedColor);
      gl.uniform3fv(loc.cursorColor, rgb(s.cursorBallColor));
      gl.uniform1i(loc.variant, VARIANTS[s.variant] ?? 0);
      gl.uniform1f(loc.line, Math.max(0.25, s.lineWidth));
      gl.uniform1f(loc.spacing, 0.28);
      gl.uniform1f(loc.rings, clamp(Math.round(s.rings), 0, 12));
      gl.uniform1f(loc.opaque, s.enableTransparency ? 0 : 1);

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const step = (dt, s, count) => {
      const beat = beatPulseRef.current || 0;
      const spd = s.speed * 8 * (1 + beat * 0.20);
      const clump = s.clumpFactor * 0.12;

      for (let i = 0; i < count; i++) {
        const b = balls[i];

        if (b.isSatellite) {
          // Satellite calving droplet: pinches off from mother core, drifts away, shrinks & dissolves
          b.satelliteProgress += dt * b.satelliteSpeed * spd * 0.22 * (1 + beat * 0.4);
          if (b.satelliteProgress >= 1.0) {
            b.satelliteProgress = 0;
            // Float outward into the spacious right and upper/lower right void (-75deg to +75deg), keeping lyrics clear
            b.satelliteAngle = (Math.random() - 0.5) * Math.PI * 0.85;
            b.satelliteSpeed = 0.25 + Math.random() * 0.35;
          }

          // Gentle outward curved floating trajectory
          const dist = b.satelliteProgress * 14;
          b.x = Math.cos(b.satelliteAngle) * dist + Math.sin(clock * 0.8 + i) * 1.5;
          b.y = Math.sin(b.satelliteAngle) * dist + Math.cos(clock * 0.6 + i) * 1.5;

          // Droplet surface tension stretch along trajectory
          const angle = b.satelliteAngle;
          const stretchAmount = clamp(0.15 + beat * 0.2, 0, 0.4);
          b.q11 = 1 + stretchAmount * Math.cos(angle) * Math.cos(angle);
          b.q12 = stretchAmount * Math.cos(angle) * Math.sin(angle);
          b.q22 = 1 + stretchAmount * Math.sin(angle) * Math.sin(angle);
        } else {
          // Mother core: organic orbital wandering around center
          b.phase += dt * b.freq * spd * 0.5;
          const targetX = Math.cos(b.phase + b.cluster * 2.1) * (6 + b.cluster * 2.5);
          const targetY = Math.sin(b.phase * 1.2 + b.cluster) * (4.5 + b.cluster * 2);

          b.vx += (targetX - b.x) * clump * dt * 8;
          b.vy += (targetY - b.y) * clump * dt * 8;

          b.vx *= 0.94;
          b.vy *= 0.94;

          b.x += b.vx * dt * spd;
          b.y += b.vy * dt * spd;

          // Fluid liquid deform / stretch
          const vLen = Math.hypot(b.vx, b.vy);
          const stretchAmount = clamp(vLen * s.stretch * 0.2 + beat * 0.25, 0, 0.55);
          const angle = Math.atan2(b.vy, b.vx);
          const cos = Math.cos(angle);
          const sin = Math.sin(angle);

          b.q11 = 1 + stretchAmount * cos * cos;
          b.q12 = stretchAmount * cos * sin;
          b.q22 = 1 + stretchAmount * sin * sin;
        }
      }
    };

    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, last ? (now - last) / 1000 : 1 / 60);
      last = now;

      const s = settingsRef.current;
      if (!s.paused && dt > 1e-4) {
        clock += dt;
        const count = clamp(Math.round(s.ballCount), 0, MAX_BALLS);
        step(dt, s, count);
        draw();
      }
    };

    const handleResize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.round(rect.width * dpr));
      const h = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      draw();
    };

    const ro = new ResizeObserver(handleResize);
    ro.observe(container);
    handleResize();

    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={`metaballs-container ${className}`.trim()}
      style={style}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="metaballs-canvas" />
    </div>
  );
}
