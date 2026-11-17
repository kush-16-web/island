import React, { useEffect, useRef } from 'react';

/**
 * GhostFibers — ReactBits Inspired Waving Fiber Ribbons
 * Undulating neon ribbons that ripple organically and pulse with acoustic energy.
 */
export default function GhostFibers({
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

    const FIBER_COUNT = 18;
    const fibers = [];
    for (let i = 0; i < FIBER_COUNT; i++) {
      fibers.push({
        yRatio: 0.15 + (i / FIBER_COUNT) * 0.70,
        freq: 0.003 + (i % 4) * 0.0015,
        amp: 18 + (i % 5) * 8,
        speedOffset: 0.7 + (i % 6) * 0.15,
        alpha: 0.18 + (i / FIBER_COUNT) * 0.35,
        lineWidth: 1.2 + (i % 3) * 0.6,
      });
    }

    let time = 0;
    let lastTime = performance.now();

    const render = (now) => {
      const dt = Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;

      if (!paused) {
        time += dt * speed * 2.2;
      }

      ctx.clearRect(0, 0, width, height);

      const beat = beatRef.current || 0;
      const bloom = bloomRef.current || 0;

      for (let i = 0; i < FIBER_COUNT; i++) {
        const f = fibers[i];
        const baseY = height * f.yRatio;
        const currentAmp = f.amp * (1 + beat * 0.7);
        const currentAlpha = Math.min(1, f.alpha * (1 + bloom * 0.6));

        ctx.strokeStyle = color;
        ctx.lineWidth = f.lineWidth * (1 + beat * 0.25);
        ctx.globalAlpha = currentAlpha;
        ctx.beginPath();

        const step = 8;
        for (let x = 0; x <= width + step; x += step) {
          const wave1 = Math.sin(x * f.freq + time * f.speedOffset);
          const wave2 = Math.cos(x * f.freq * 1.8 - time * f.speedOffset * 0.7) * 0.45;
          const y = baseY + (wave1 + wave2) * currentAmp;
          if (x === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
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
