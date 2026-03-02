'use client';

import { useRef, useEffect, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Types (internal)
// ---------------------------------------------------------------------------

interface Star {
  /** X position as 0-1 fraction of canvas width */
  x: number;
  /** Y position as 0-1 fraction of canvas height */
  y: number;
  /** Radius in px */
  r: number;
  /** Current angle for twinkling oscillation */
  a: number;
  /** Delta-angle per frame */
  da: number;
}

interface NebulaCircle {
  /** Offset from cloud center, in px */
  ox: number;
  oy: number;
  /** Radius of this sub-circle */
  r: number;
  /** Opacity for this sub-circle (0.015 - 0.03) */
  opacity: number;
}

interface NebulaCloud {
  /** Center position as 0-1 fractions */
  cx: number;
  cy: number;
  /** Base radius of the cloud spread */
  baseRadius: number;
  /** Hex color for this cloud */
  color: string;
  /** Per-cloud phase offsets for sine drift */
  phaseX: number;
  phaseY: number;
  /** Drift amplitude in px */
  driftAmp: number;
  /** Collection of overlapping circles forming the cloud */
  circles: NebulaCircle[];
}

interface DustParticle {
  /** Position as 0-1 fractions */
  x: number;
  y: number;
  /** Radius in px */
  r: number;
  /** Velocity per frame as 0-1 fractions */
  vx: number;
  vy: number;
  /** Opacity */
  opacity: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STAR_COUNT = 300;
const NEBULA_COUNT = 6;
const DUST_COUNT = 40;

const NEBULA_COLORS = [
  '#00e5ff',
  '#ff006e',
  '#8338ec',
  '#00ff9d',
  '#ffbe0b',
  '#ff4060',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse a hex color string to {r, g, b}. */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** Random float in [min, max). */
function rand(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

/** Random integer in [min, max]. */
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ---------------------------------------------------------------------------
// Field generators (called once via lazy-init refs)
// ---------------------------------------------------------------------------

function createStars(): Star[] {
  return Array.from({ length: STAR_COUNT }, (): Star => ({
    x: Math.random(),
    y: Math.random(),
    r: rand(0.3, 2.2),
    a: Math.random() * Math.PI * 2,
    da: rand(0.003, 0.012),
  }));
}

function createNebulae(): NebulaCloud[] {
  return Array.from({ length: NEBULA_COUNT }, (_, i): NebulaCloud => {
    const circleCount = randInt(8, 12);
    const baseRadius = rand(150, 350);

    return {
      cx: rand(0.1, 0.9),
      cy: rand(0.1, 0.9),
      baseRadius,
      color: NEBULA_COLORS[i % NEBULA_COLORS.length],
      phaseX: Math.random() * Math.PI * 2,
      phaseY: Math.random() * Math.PI * 2,
      driftAmp: rand(15, 40),
      circles: Array.from({ length: circleCount }, (): NebulaCircle => ({
        // Offset from cloud center — spread within the base radius
        ox: rand(-baseRadius * 0.6, baseRadius * 0.6),
        oy: rand(-baseRadius * 0.6, baseRadius * 0.6),
        r: rand(baseRadius * 0.4, baseRadius * 1.0),
        opacity: rand(0.015, 0.03),
      })),
    };
  });
}

function createDust(): DustParticle[] {
  return Array.from({ length: DUST_COUNT }, (): DustParticle => ({
    x: Math.random(),
    y: Math.random(),
    r: rand(1, 2),
    vx: rand(0.00002, 0.00008) * (Math.random() > 0.5 ? 1 : -1),
    vy: rand(0.00002, 0.00008) * (Math.random() > 0.5 ? 1 : -1),
    opacity: rand(0.15, 0.35),
  }));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CosmosCanvasBg() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const frameRef = useRef<number>(0);

  // Lazy-init fields — created once on first render, never recreated.
  const starsRef = useRef<Star[] | null>(null);
  if (starsRef.current === null) {
    starsRef.current = createStars();
  }

  const nebulaeRef = useRef<NebulaCloud[] | null>(null);
  if (nebulaeRef.current === null) {
    nebulaeRef.current = createNebulae();
  }

  const dustRef = useRef<DustParticle[] | null>(null);
  if (dustRef.current === null) {
    dustRef.current = createDust();
  }

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
    const nebulae = nebulaeRef.current!;
    const dust = dustRef.current!;

    // --- Clear --------------------------------------------------------
    ctx.clearRect(0, 0, W, H);

    // --- Vignette -----------------------------------------------------
    // Radial gradient: transparent center fading to black at edges.
    const vg = ctx.createRadialGradient(
      W / 2, H / 2, 0,
      W / 2, H / 2, Math.max(W, H) * 0.75,
    );
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    // --- Nebula clouds ------------------------------------------------
    // Each cloud is a collection of overlapping low-opacity radial-gradient
    // circles that drift slowly via sine-modulated offsets.
    for (const cloud of nebulae) {
      const { r, g, b } = hexToRgb(cloud.color);

      // Slow sine-based drift so clouds gently float
      const driftX = Math.sin(frame * 0.0008 + cloud.phaseX) * cloud.driftAmp;
      const driftY = Math.cos(frame * 0.0006 + cloud.phaseY) * cloud.driftAmp;

      const centerX = cloud.cx * W + driftX;
      const centerY = cloud.cy * H + driftY;

      for (const circle of cloud.circles) {
        const cx = centerX + circle.ox;
        const cy = centerY + circle.oy;
        const cr = circle.r;

        // Radial gradient from colored center to transparent edge
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, cr);
        grad.addColorStop(0, `rgba(${r},${g},${b},${circle.opacity})`);
        grad.addColorStop(1, `rgba(${r},${g},${b},0)`);

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, cr, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // --- Stars --------------------------------------------------------
    // Twinkling via sine oscillation on the angle parameter.
    for (const s of stars) {
      s.a += s.da;
      const opacity = Math.abs(Math.sin(s.a)) * 0.5 + 0.05;

      ctx.beginPath();
      ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(180,210,255,${opacity})`;
      ctx.fill();
    }

    // --- Dust particles -----------------------------------------------
    // Tiny floating dots with very slow drift; wrap at edges.
    for (const d of dust) {
      d.x += d.vx;
      d.y += d.vy;

      // Wrap around edges
      if (d.x < 0) d.x += 1;
      if (d.x > 1) d.x -= 1;
      if (d.y < 0) d.y += 1;
      if (d.y > 1) d.y -= 1;

      ctx.beginPath();
      ctx.arc(d.x * W, d.y * H, d.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${d.opacity})`;
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

    // Size the canvas to its CSS pixel dimensions (devicePixelRatio-aware).
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
