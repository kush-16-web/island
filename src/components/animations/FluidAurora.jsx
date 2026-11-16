import React, { useEffect, useRef } from 'react';
import './FluidAurora.css';

/**
 * FluidAurora — Apple Music / macOS Animated Artwork Background Engine
 *
 * Silky, domain-warped liquid gradient ribbons that ripple, fold, and breathe
 * in real-time with the music envelope.
 */

const toRgb = (color) => {
  if (!color) return [0.9, 0.4, 0.2];
  const s = String(color).trim();

  if (s.startsWith('#') || /^[0-9a-f]{3,6}$/i.test(s)) {
    let hex = s.replace('#', '');
    if (hex.length === 3) hex = hex.replace(/./g, (c) => c + c);
    if (/^[0-9a-f]{6}/i.test(hex)) {
      return [0, 2, 4].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255);
    }
  }

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

  const rgbParts = s.match(/rgba?\(\s*([0-9.]+)[,\s]+([0-9.]+)[,\s]+([0-9.]+)/i);
  if (rgbParts) {
    return [
      Math.min(1, Math.max(0, parseFloat(rgbParts[1]) / 255)),
      Math.min(1, Math.max(0, parseFloat(rgbParts[2]) / 255)),
      Math.min(1, Math.max(0, parseFloat(rgbParts[3]) / 255)),
    ];
  }

  return [0.9, 0.4, 0.2];
};

const VERTEX_SHADER = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform vec2 uResolution;
uniform float uTime;
uniform vec3 uColorPrimary;
uniform vec3 uColorSecondary;
uniform float uBeat;
uniform float uBloom;

out vec4 fragColor;

// Simplex-style organic sine domain warping
vec2 waveDistort(vec2 p, float t, float beat) {
  float x = sin(p.y * 2.2 + t * 0.7) * (0.35 + beat * 0.15);
  float y = cos(p.x * 1.8 + t * 0.5) * (0.30 + beat * 0.12);
  return vec2(x, y);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  vec2 p = (uv - 0.5) * 2.0;
  p.x *= uResolution.x / uResolution.y;

  float t = uTime * 0.35;
  vec2 warp1 = waveDistort(p, t, uBeat);
  vec2 warp2 = waveDistort(p + warp1 * 1.4, t * 1.2 + 2.0, uBeat);

  vec2 q = p + warp2 * 0.6;
  float d = length(q - vec2(0.35, -0.1));

  // Multi-layered silky ribbon folds
  float wave1 = sin(q.x * 2.0 + q.y * 1.5 + t) * 0.5 + 0.5;
  float wave2 = cos(q.y * 2.5 - q.x * 1.8 - t * 0.8) * 0.5 + 0.5;
  float wave3 = sin(length(q) * 3.0 - t * 1.1) * 0.5 + 0.5;

  float blend = smoothstep(0.15, 0.85, (wave1 * 0.5 + wave2 * 0.35 + wave3 * 0.15));
  float edgeMask = smoothstep(1.8, 0.2, d);

  // Background base tone
  vec3 baseTone = vec3(0.03, 0.03, 0.045);
  vec3 col = mix(baseTone, uColorPrimary * 0.85, blend * edgeMask);
  col = mix(col, uColorSecondary * 0.75, wave2 * edgeMask * 0.6);

  // Soft warm ember bloom on heavy drops
  col += (uBloom * 0.25) * vec3(1.0, 0.85, 0.65) * edgeMask;

  float alpha = clamp((blend * 0.55 + edgeMask * 0.35) * (0.55 + uBeat * 0.2), 0.0, 0.85);

  fragColor = vec4(col, alpha);
}
`;

export default function FluidAurora({
  color = '#d97706',
  speed = 0.35,
  paused = false,
  beatPulse = 0,
  bloomPulse = 0,
  className = '',
  style = {},
}) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const stateRef = useRef({ color, speed, paused, beatPulse, bloomPulse });

  stateRef.current = { color, speed, paused, beatPulse, bloomPulse };

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    let gl;
    try {
      gl = canvas.getContext('webgl2', { antialias: true, alpha: true });
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

    const vs = compile(gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
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
      time: gl.getUniformLocation(program, 'uTime'),
      colorPrimary: gl.getUniformLocation(program, 'uColorPrimary'),
      colorSecondary: gl.getUniformLocation(program, 'uColorSecondary'),
      beat: gl.getUniformLocation(program, 'uBeat'),
      bloom: gl.getUniformLocation(program, 'uBloom'),
    };

    let clock = 0;
    let last = 0;

    const render = (now) => {
      animRef.current = requestAnimationFrame(render);
      const dt = Math.min(0.05, last ? (now - last) / 1000 : 1 / 60);
      last = now;

      const { color: curColor, speed: curSpeed, paused: isPaused, beatPulse: curBeat, bloomPulse: curBloom } = stateRef.current;
      if (!isPaused) {
        clock += dt * (curSpeed || 0.35) * 2.2;
      }

      const primary = toRgb(curColor);
      // Secondary harmonic color: warm golden/rose tint shifted slightly
      const secondary = [
        Math.min(1.0, primary[0] * 0.8 + 0.15),
        Math.min(1.0, primary[1] * 0.65 + 0.08),
        Math.max(0.0, primary[2] * 0.5 - 0.05),
      ];

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(loc.resolution, canvas.width, canvas.height);
      gl.uniform1f(loc.time, clock);
      gl.uniform3fv(loc.colorPrimary, primary);
      gl.uniform3fv(loc.colorSecondary, secondary);
      gl.uniform1f(loc.beat, curBeat || 0);
      gl.uniform1f(loc.bloom, curBloom || 0);

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const handleResize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(rect.width * dpr));
      const h = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };

    const ro = new ResizeObserver(handleResize);
    ro.observe(container);
    handleResize();

    animRef.current = requestAnimationFrame(render);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      ro.disconnect();
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={`fluid-aurora-container ${className}`.trim()}
      style={style}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="fluid-aurora-canvas" />
    </div>
  );
}
