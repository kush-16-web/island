import React, { useEffect, useRef } from 'react';

/**
 * LightRays — ReactBits Inspired Volumetric God Rays
 * Radiant atmospheric light shafts with shimmering floating ember particles.
 */
export default function LightRays({
  color = '#38bdf8',
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

    const RAY_COUNT = 9;
    const rays = [];
    for (let i = 0; i < RAY_COUNT; i++) {
      rays.push({
        angleOffset: -0.65 + (i / (RAY_COUNT - 1)) * 1.3,
        spread: 0.12 + Math.random() * 0.08,
        speedOffset: 0.8 + Math.random() * 0.4,
        alpha: 0.14 + Math.random() * 0.22,
      });
    }

    const PARTICLES = 35;
    const dust = [];
    for (let i = 0; i < PARTICLES; i++) {
      dust.push({
        x: Math.random(),
        y: Math.random(),
        size: 0.8 + Math.random() * 1.6,
        vy: -0.02 - Math.random() * 0.04,
        alpha: 0.2 + Math.random() * 0.5,
      });
    }

    let time = 0;
    let lastTime = performance.now();

    const render = (now) => {
      const dt = Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;

      if (!paused) {
        time += dt * speed * 1.2;
      }

      ctx.clearRect(0, 0, width, height);

      const beat = beatRef.current || 0;
      const bloom = bloomRef.current || 0;

      const originX = width * 0.5;
      const originY = -20;
      const length = height * 1.6;

      // Draw light shafts
      for (let i = 0; i < RAY_COUNT; i++) {
        const r = rays[i];
        const currentAngle = r.angleOffset + Math.sin(time * r.speedOffset + i) * 0.08;
        const halfSpread = (r.spread * (1 + beat * 0.35)) / 2;

        const leftAngle = currentAngle - halfSpread;
        const rightAngle = currentAngle + halfSpread;

        const x1 = originX + Math.sin(leftAngle) * length;
        const y1 = originY + Math.cos(leftAngle) * length;
        const x2 = originX + Math.sin(rightAngle) * length;
        const y2 = originY + Math.cos(rightAngle) * length;

        const grad = ctx.createRadialGradient(originX, originY, 10, originX, originY, length);
        const rayAlpha = Math.min(1, r.alpha * (1 + beat * 0.5 + bloom * 0.4));
        grad.addColorStop(0, color);
        grad.addColorStop(0.5, `${color}44`);
        grad.addColorStop(1, 'transparent');

        ctx.fillStyle = grad;
        ctx.globalAlpha = rayAlpha;
        ctx.beginPath();
        ctx.moveTo(originX, originY);
        ctx.lineTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.closePath();
        ctx.fill();
      }

      // Draw floating dust motes
      for (let i = 0; i < PARTICLES; i++) {
        const d = dust[i];
        if (!paused) {
          d.y += d.vy * dt * (1 + beat * 0.5);
          if (d.y < 0) {
            d.y = 1;
            d.x = Math.random();
          }
        }
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = d.alpha * (1 + bloom * 0.5);
        ctx.beginPath();
        ctx.arc(d.x * width, d.y * height, d.size, 0, Math.PI * 2);
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
