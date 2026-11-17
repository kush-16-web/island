import React, { useEffect, useRef } from 'react';

/**
 * Galaxy — ReactBits Inspired Cosmic Spiral Visualizer
 * Rotating logarithmic spiral arms of starlight particles that pulse and flare to audio dynamics.
 */
export default function Galaxy({
  color = '#a855f7',
  speed = 0.35,
  paused = false,
  beatPulse = 0,
  bloomPulse = 0,
}) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const beatRef = useRef(beatPulse);
  const bloomRef = useRef(bloomPulse);

  useEffect(() => {
    beatRef.current = beatPulse;
    bloomRef.current = bloomPulse;
  }, [beatPulse, bloomPulse]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = (canvas.width = canvas.offsetWidth || 400);
    let height = (canvas.height = canvas.offsetHeight || 250);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = canvas.offsetWidth || 400;
      height = canvas.height = canvas.offsetHeight || 250;
    };

    const ro = new ResizeObserver(handleResize);
    ro.observe(canvas);

    // Generate spiral galaxy particles
    const PARTICLE_COUNT = 320;
    const ARMS = 3;
    const particles = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const arm = i % ARMS;
      const armAngle = (arm * 2 * Math.PI) / ARMS;
      const dist = Math.pow(Math.random(), 0.75) * 0.45; // 0 to 0.45
      const spiralAngle = armAngle + dist * 7.5 + (Math.random() - 0.5) * 0.4;
      const size = 0.8 + Math.random() * 1.8;
      const alpha = 0.25 + Math.random() * 0.65;
      const speedOffset = 0.85 + Math.random() * 0.3;
      particles.push({ dist, spiralAngle, size, alpha, speedOffset });
    }

    let angle = 0;
    let lastTime = performance.now();

    const render = (now) => {
      const dt = Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;

      if (!paused) {
        angle += dt * speed * 0.45;
      }

      ctx.clearRect(0, 0, width, height);

      const cx = width * 0.5;
      const cy = height * 0.5;
      const maxRadius = Math.min(width, height) * 0.95;

      const beat = beatRef.current || 0;
      const bloom = bloomRef.current || 0;

      // Core glow
      const coreRadius = maxRadius * (0.12 + beat * 0.08);
      const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreRadius);
      coreGrad.addColorStop(0, color);
      coreGrad.addColorStop(0.5, `${color}44`);
      coreGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, coreRadius, 0, Math.PI * 2);
      ctx.fill();

      // Render stars
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const p = particles[i];
        const currentDist = p.dist * maxRadius * (1 + beat * 0.14);
        const currentAngle = p.spiralAngle + angle * p.speedOffset;

        const x = cx + Math.cos(currentAngle) * currentDist;
        const y = cy + Math.sin(currentAngle) * currentDist * 0.62; // Elliptical 3D tilt

        const pSize = p.size * (1 + beat * 0.25);
        const pAlpha = Math.min(1, p.alpha * (1 + bloom * 0.5));

        ctx.fillStyle = color;
        ctx.globalAlpha = pAlpha;
        ctx.beginPath();
        ctx.arc(x, y, pSize, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      animRef.current = requestAnimationFrame(render);
    };

    animRef.current = requestAnimationFrame(render);

    return () => {
      ro.disconnect();
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [color, speed, paused]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: '100%' }}
      />
    </div>
  );
}
