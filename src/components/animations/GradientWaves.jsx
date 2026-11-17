import React, { useEffect, useRef } from 'react';

/**
 * GradientWaves — ReactBits Inspired Liquid Chromatic Undulation
 * Velvety sweeping contours that pulse dynamically with rhythm and bass drops.
 */
export default function GradientWaves({
  color = '#ec4899',
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

    let time = 0;
    let lastTime = performance.now();

    const render = (now) => {
      const dt = Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;

      if (!paused) {
        time += dt * speed * 1.5;
      }

      ctx.clearRect(0, 0, width, height);

      const beat = beatRef.current || 0;
      const bloom = bloomRef.current || 0;

      const LAYERS = 4;
      for (let layer = 0; layer < LAYERS; layer++) {
        const layerRatio = (layer + 1) / (LAYERS + 1);
        const baseY = height * (0.35 + layerRatio * 0.45);
        const amp = (18 + layer * 10) * (1 + beat * 0.55);
        const freq = 0.0035 / (1 + layer * 0.2);
        const phase = time * (0.7 + layer * 0.25) + layer * 1.3;

        ctx.beginPath();
        ctx.moveTo(0, height);

        for (let x = 0; x <= width + 8; x += 8) {
          const y = baseY + Math.sin(x * freq + phase) * amp + Math.cos(x * freq * 0.6 - phase * 0.8) * (amp * 0.4);
          ctx.lineTo(x, y);
        }
        ctx.lineTo(width, height);
        ctx.closePath();

        const grad = ctx.createLinearGradient(0, baseY - amp, 0, height);
        const alpha = Math.min(1, (0.12 + layer * 0.09) * (1 + bloom * 0.4));
        grad.addColorStop(0, color);
        grad.addColorStop(1, 'transparent');

        ctx.fillStyle = grad;
        ctx.globalAlpha = alpha;
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
