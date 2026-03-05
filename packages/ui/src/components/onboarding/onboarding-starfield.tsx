'use client';
import { useRef, useEffect } from 'react';

export function OnboardingStarfield() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Generate stars and dust
    const stars: Array<{ x: number; y: number; r: number; twinkleSpeed: number; twinkleOffset: number }> = [];
    const dust: Array<{ x: number; y: number; r: number; vx: number; vy: number; opacity: number }> = [];

    for (let i = 0; i < 200; i++) {
      stars.push({
        x: Math.random(),
        y: Math.random(),
        r: Math.random() * 1.2 + 0.3,
        twinkleSpeed: Math.random() * 0.02 + 0.005,
        twinkleOffset: Math.random() * Math.PI * 2,
      });
    }

    for (let i = 0; i < 30; i++) {
      dust.push({
        x: Math.random(),
        y: Math.random(),
        r: Math.random() * 1.5 + 0.5,
        vx: (Math.random() - 0.5) * 0.00005,
        vy: (Math.random() - 0.5) * 0.00005,
        opacity: Math.random() * 0.15 + 0.03,
      });
    }

    let frame = 0;
    let animId: number;
    let W = 0, H = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      W = canvas.offsetWidth;
      H = canvas.offsetHeight;
      if (W === 0 || H === 0) return;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = () => {
      frame++;
      ctx.clearRect(0, 0, W, H);

      // Vignette
      const vg = ctx.createRadialGradient(W / 2, H / 2, W * 0.15, W / 2, H / 2, W * 0.7);
      vg.addColorStop(0, 'transparent');
      vg.addColorStop(1, 'rgba(0, 0, 0, 0.6)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);

      // Stars
      for (const s of stars) {
        const twinkle = Math.sin(frame * s.twinkleSpeed + s.twinkleOffset) * 0.5 + 0.5;
        const alpha = 0.3 + twinkle * 0.5;
        ctx.beginPath();
        ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.fill();
      }

      // Dust particles
      for (const d of dust) {
        d.x += d.vx;
        d.y += d.vy;
        if (d.x < 0) d.x = 1;
        if (d.x > 1) d.x = 0;
        if (d.y < 0) d.y = 1;
        if (d.y > 1) d.y = 0;
        ctx.beginPath();
        ctx.arc(d.x * W, d.y * H, d.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0, 229, 255, ${d.opacity})`;
        ctx.fill();
      }

      animId = requestAnimationFrame(draw);
    };

    resize();
    draw();

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ background: '#050508' }}
    />
  );
}
