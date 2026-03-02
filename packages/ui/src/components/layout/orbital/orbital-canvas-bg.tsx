'use client';

import { useRef, useEffect, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OrbitData {
  id: string;
  /** Center X as 0-1 fraction of viewport */
  cx: number;
  /** Center Y as 0-1 fraction of viewport */
  cy: number;
  /** Radius in px */
  radius: number;
  /** CSS hex color, e.g. "#00f0ff" */
  color: string;
  /** User IDs belonging to this orbit */
  memberIds: string[];
}

export interface OrbitalCanvasBgProps {
  /** Orbit zones with their positions, colors, and member user IDs */
  orbits: Array<OrbitData>;
  /** User positions as fractions of viewport (0-1) */
  userPositions: Record<string, { x: number; y: number }>;
  /** Online user IDs set — only draw connections between online users */
  onlineUserIds: Set<string>;
}

// ---------------------------------------------------------------------------
// Star type (internal)
// ---------------------------------------------------------------------------

interface Star {
  x: number;
  y: number;
  r: number;
  a: number;
  da: number;
}

const STAR_COUNT = 100;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OrbitalCanvasBg({
  orbits,
  userPositions,
  onlineUserIds,
}: OrbitalCanvasBgProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const frameRef = useRef<number>(0);

  // Lazy-init star field — created once, never recreated.
  const starsRef = useRef<Star[] | null>(null);
  if (starsRef.current === null) {
    starsRef.current = Array.from({ length: STAR_COUNT }, (): Star => ({
      x: Math.random(),
      y: Math.random(),
      r: Math.random() * 1.4 + 0.2,
      a: Math.random(),
      da: (Math.random() - 0.5) * 0.004,
    }));
  }

  // Keep latest props in refs so the animation loop always sees fresh data
  // without needing to restart the rAF chain.
  const orbitsRef = useRef(orbits);
  const userPosRef = useRef(userPositions);
  const onlineRef = useRef(onlineUserIds);
  orbitsRef.current = orbits;
  userPosRef.current = userPositions;
  onlineRef.current = onlineUserIds;

  // ------------------------------------------------------------------
  // Draw callback — reads current refs, no stale closures.
  // ------------------------------------------------------------------

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const frame = ++frameRef.current;
    const stars = starsRef.current!;
    const curOrbits = orbitsRef.current;
    const positions = userPosRef.current;
    const online = onlineRef.current;

    ctx.clearRect(0, 0, W, H);

    // --- Vignette -----------------------------------------------------------
    const vg = ctx.createRadialGradient(
      W / 2, H / 2, 0,
      W / 2, H / 2, Math.max(W, H) * 0.75,
    );
    vg.addColorStop(0, 'rgba(0,30,50,0.12)');
    vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    // --- Orbit connection lines ---------------------------------------------
    for (const orb of curOrbits) {
      const onlineMembers = orb.memberIds.filter((id) => online.has(id));
      if (onlineMembers.length < 2) continue;

      for (let i = 0; i < onlineMembers.length; i++) {
        for (let j = i + 1; j < onlineMembers.length; j++) {
          const ua = positions[onlineMembers[i]];
          const ub = positions[onlineMembers[j]];
          if (!ua || !ub) continue;

          const p = (Math.sin(frame * 0.02 + i * 1.3) + 1) / 2;

          // Dashed connection line
          ctx.beginPath();
          ctx.moveTo(ua.x * W, ua.y * H);
          ctx.lineTo(ub.x * W, ub.y * H);
          ctx.strokeStyle =
            orb.color +
            Math.round((0.05 + p * 0.07) * 255)
              .toString(16)
              .padStart(2, '0');
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 9]);
          ctx.lineDashOffset = -frame * 0.35;
          ctx.stroke();
          ctx.setLineDash([]);

          // Travelling dot
          const t = (frame * 0.009 + i * 0.4) % 1;
          ctx.beginPath();
          ctx.arc(
            (ua.x + (ub.x - ua.x) * t) * W,
            (ua.y + (ub.y - ua.y) * t) * H,
            2,
            0,
            Math.PI * 2,
          );
          ctx.fillStyle =
            orb.color +
            Math.round((0.4 + p * 0.4) * 255)
              .toString(16)
              .padStart(2, '0');
          ctx.fill();
        }
      }
    }

    // --- Stars --------------------------------------------------------------
    for (const s of stars) {
      s.a += s.da;
      ctx.beginPath();
      ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(180,220,255,${Math.abs(Math.sin(s.a)) * 0.35 + 0.04})`;
      ctx.fill();
    }

    rafRef.current = requestAnimationFrame(draw);
  }, []);

  // ------------------------------------------------------------------
  // Lifecycle: start/stop animation + ResizeObserver
  // ------------------------------------------------------------------

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Size the canvas to its CSS pixel dimensions (devicePixelRatio aware).
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    // Kick off the animation loop.
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      ro.disconnect();
      cancelAnimationFrame(rafRef.current);
    };
  }, [draw]);

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 z-0"
      style={{ width: '100%', height: '100%' }}
    />
  );
}
