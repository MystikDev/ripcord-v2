/**
 * @module orbital-canvas
 * Comprehensive canvas renderer for the solar system orbital view.
 * Replaces the simpler orbital-canvas-bg with a visually rich scene:
 * parallax starfield, nebula bloom, glowing sun with hub icon, dashed orbital
 * paths, procedural textured planets per voice channel, asteroid belt,
 * shooting stars, lens flare, motion trails, and user connection lines.
 *
 * Screen-space layers (no pan/zoom): starfield, nebula, shooting stars.
 * World-space layers (pan/zoom synced with React overlay): sun, orbits,
 * planets, asteroid belt, connection lines.
 */
'use client';

import { useRef, useEffect, useCallback } from 'react';
import { generatePlanetTexture } from './planet-texture';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OrbitInfo {
  id: string;
  /** Center X as 0-1 fraction of viewport */
  cx: number;
  /** Center Y as 0-1 fraction of viewport */
  cy: number;
  /** Radius in px */
  radius: number;
  /** CSS hex color, e.g. "#00e5ff" */
  color: string;
  /** User IDs in this orbit */
  memberIds: string[];
  /** Channel display name */
  channelName: string;
  /** Channel type — only voice channels get planet visuals */
  channelType: 'voice' | 'text';
}

export interface OrbitalCanvasProps {
  /** Orbit zones with positions, colors, members, and channel info */
  orbits: OrbitInfo[];
  /** User positions as fractions of viewport (0-1) */
  userPositions: Record<string, { x: number; y: number }>;
  /** Online user IDs — only draw connections between online users */
  onlineUserIds: Set<string>;
  /** Hub icon image URL (drawn on the sun) */
  hubIconUrl?: string;
  /** Hub display name (initials drawn on sun if no icon) */
  hubName: string;
  /** Canvas pan offset in CSS pixels */
  panOffset: { x: number; y: number };
  /** Canvas zoom level (0.3–3.0) */
  zoomLevel: number;
}

// ---------------------------------------------------------------------------
// Star type (internal)
// ---------------------------------------------------------------------------

interface Star {
  /** Position offset from screen center (px, pre-parallax) */
  x: number;
  y: number;
  /** Radius (CSS px) */
  r: number;
  /** Base brightness 0-1 */
  baseAlpha: number;
  /** HSL color components */
  hue: number;
  sat: number;
  lum: number;
  /** Twinkle animation speed */
  twSpeed: number;
  /** Twinkle phase offset */
  twPhase: number;
}

// ---------------------------------------------------------------------------
// Shooting star type
// ---------------------------------------------------------------------------

interface ShootingStar {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Total lifetime in seconds */
  life: number;
  /** Elapsed time */
  t: number;
  /** Trail gradient length (px) */
  len: number;
  /** Stroke width */
  w: number;
  /** Colour hue */
  hue: number;
}

// ---------------------------------------------------------------------------
// Asteroid particle type
// ---------------------------------------------------------------------------

interface AsteroidParticle {
  /** Orbital angle (radians) */
  angle: number;
  /** Distance from sun center (CSS px) */
  dist: number;
  /** Particle size (CSS px) */
  size: number;
  /** Orbital speed multiplier */
  speed: number;
  /** Brightness 0-1 */
  shade: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function hexToHue(hex: string): number {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h = 0;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return ((h * 60 + 360) % 360);
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// ---------------------------------------------------------------------------
// Star generation — 3 layers with colour variety
// ---------------------------------------------------------------------------

function makeStarLayer(count: number, spread: number, layer: number): Star[] {
  const stars: Star[] = [];
  for (let i = 0; i < count; i++) {
    const temp = Math.random();
    const baseHue = lerp(190, 45, Math.random());
    stars.push({
      x: (Math.random() - 0.5) * spread * 2,
      y: (Math.random() - 0.5) * spread * 2,
      r: lerp(0.5, 1.8, Math.random()) * (layer === 0 ? 0.85 : layer === 1 ? 1.0 : 1.15),
      baseAlpha: lerp(0.2, 0.8, Math.random()),
      hue: baseHue + lerp(-18, 18, Math.random()),
      sat: lerp(12, 40, temp),
      lum: lerp(70, 95, 1 - temp),
      twSpeed: lerp(0.3, 1.8, Math.random()),
      twPhase: Math.random() * Math.PI * 2,
    });
  }
  return stars;
}

// ---------------------------------------------------------------------------
// Asteroid belt generation
// ---------------------------------------------------------------------------

function makeAsteroidBelt(innerR: number, outerR: number, count: number): AsteroidParticle[] {
  const particles: AsteroidParticle[] = [];
  for (let i = 0; i < count; i++) {
    particles.push({
      angle: Math.random() * Math.PI * 2,
      dist: lerp(innerR, outerR, Math.pow(Math.random(), 0.65)),
      size: lerp(0.5, 1.8, Math.random()),
      speed: lerp(0.12, 0.35, Math.random()),
      shade: lerp(0.25, 0.75, Math.random()),
    });
  }
  return particles;
}

// ---------------------------------------------------------------------------
// Sun position & size (viewport fractions / CSS px)
// ---------------------------------------------------------------------------

const SUN_CX = 0.5;
const SUN_CY = 0.45;
const SUN_RADIUS = 42;
const MAX_SHOOTING_STARS = 5;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OrbitalCanvas({
  orbits,
  userPositions,
  onlineUserIds,
  hubIconUrl,
  hubName,
  panOffset,
  zoomLevel,
}: OrbitalCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const timeRef = useRef<number>(0);
  const lastStampRef = useRef<number>(0);

  // ── Lazy-init star layers (created once, never recreated) ──────
  const starsFarRef = useRef<Star[] | null>(null);
  const starsMidRef = useRef<Star[] | null>(null);
  const starsNearRef = useRef<Star[] | null>(null);
  if (starsFarRef.current === null) {
    starsFarRef.current = makeStarLayer(600, 3500, 0);
    starsMidRef.current = makeStarLayer(350, 2200, 1);
    starsNearRef.current = makeStarLayer(160, 1400, 2);
  }

  // ── Shooting star pool ─────────────────────────────────────────
  const shootingRef = useRef<ShootingStar[]>([]);

  // ── Asteroid belt particles ────────────────────────────────────
  const beltRef = useRef<AsteroidParticle[] | null>(null);
  if (beltRef.current === null) {
    beltRef.current = makeAsteroidBelt(190, 340, 150);
  }

  // ── Planet texture cache (channelId → offscreen canvas) ────────
  const planetTexRef = useRef<Map<string, HTMLCanvasElement>>(new Map());

  // ── Hub icon image ─────────────────────────────────────────────
  const hubIconRef = useRef<HTMLImageElement | null>(null);
  const hubIconReadyRef = useRef(false);

  // ── Props → refs (animation loop reads current data) ───────────
  const orbitsRef = useRef(orbits);
  const userPosRef = useRef(userPositions);
  const onlineRef = useRef(onlineUserIds);
  const panRef = useRef(panOffset);
  const zoomRef = useRef(zoomLevel);
  const hubNameRef = useRef(hubName);
  orbitsRef.current = orbits;
  userPosRef.current = userPositions;
  onlineRef.current = onlineUserIds;
  panRef.current = panOffset;
  zoomRef.current = zoomLevel;
  hubNameRef.current = hubName;

  // ── Load hub icon ──────────────────────────────────────────────
  useEffect(() => {
    hubIconReadyRef.current = false;
    if (!hubIconUrl) {
      hubIconRef.current = null;
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      hubIconRef.current = img;
      hubIconReadyRef.current = true;
    };
    img.onerror = () => {
      hubIconRef.current = null;
      hubIconReadyRef.current = false;
    };
    img.src = hubIconUrl;
  }, [hubIconUrl]);

  // ── Pre-generate planet textures for voice channels ────────────
  useEffect(() => {
    const cache = planetTexRef.current;
    const needed = new Set<string>();
    for (const orb of orbits) {
      if (orb.channelType !== 'voice') continue;
      needed.add(orb.id);
      if (!cache.has(orb.id)) {
        cache.set(orb.id, generatePlanetTexture(orb.id, orb.color, 64));
      }
    }
    // Evict stale textures (channels removed)
    for (const key of cache.keys()) {
      if (!needed.has(key)) cache.delete(key);
    }
  }, [orbits]);

  // ════════════════════════════════════════════════════════════════
  // Draw callback — reads current refs, no stale closures.
  // ════════════════════════════════════════════════════════════════

  const draw = useCallback((now: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // CSS-pixel dimensions (DPR transform already applied)
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.width / dpr;
    const H = canvas.height / dpr;

    // Delta time
    if (lastStampRef.current === 0) lastStampRef.current = now;
    const dt = Math.min(0.033, (now - lastStampRef.current) / 1000);
    lastStampRef.current = now;
    timeRef.current += dt;
    const T = timeRef.current;

    // Current prop values
    const curOrbits = orbitsRef.current;
    const positions = userPosRef.current;
    const online = onlineRef.current;
    const pan = panRef.current;
    const zoom = zoomRef.current;

    const starsFar = starsFarRef.current!;
    const starsMid = starsMidRef.current!;
    const starsNear = starsNearRef.current!;

    // ── 1. Clear / motion trails ─────────────────────────────────
    ctx.fillStyle = 'rgba(3,4,10,0.20)';
    ctx.fillRect(0, 0, W, H);

    // ── 2. Parallax starfield (screen-space) ─────────────────────
    const drawStarLayer = (stars: Star[], parallax: number, alphaBase: number) => {
      for (const s of stars) {
        const tw = 0.7 + 0.3 * Math.sin(T * s.twSpeed + s.twPhase);
        const sx = W / 2 + s.x - pan.x * parallax;
        const sy = H / 2 + s.y - pan.y * parallax;
        if (sx < -10 || sx > W + 10 || sy < -10 || sy > H + 10) continue;
        const rr = s.r * (0.75 + 0.25 * tw);
        ctx.globalAlpha = s.baseAlpha * alphaBase * tw;
        ctx.fillStyle = `hsla(${s.hue},${s.sat}%,${s.lum}%,1)`;
        ctx.beginPath();
        ctx.arc(sx, sy, rr, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    drawStarLayer(starsFar, 0.05, 0.60);
    drawStarLayer(starsMid, 0.10, 0.72);
    drawStarLayer(starsNear, 0.18, 0.85);
    ctx.globalAlpha = 1;

    // ── 3. Nebula bloom (screen-space) ───────────────────────────
    ctx.globalAlpha = 0.11;
    const neb = ctx.createRadialGradient(
      W / 2, H * 0.44, 0,
      W / 2, H * 0.44, Math.max(W, H) * 0.6,
    );
    neb.addColorStop(0, 'rgba(109,255,218,0.10)');
    neb.addColorStop(0.28, 'rgba(138,166,255,0.07)');
    neb.addColorStop(0.55, 'rgba(255,120,200,0.035)');
    neb.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = neb;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;

    // Vignette
    const vg = ctx.createRadialGradient(
      W / 2, H / 2, 0,
      W / 2, H / 2, Math.max(W, H) * 0.75,
    );
    vg.addColorStop(0, 'rgba(0,20,40,0.06)');
    vg.addColorStop(1, 'rgba(0,0,0,0.42)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    // ══════════════════════════════════════════════════════════════
    // 4. World-space transform
    //    Mirrors the React pannable layer's CSS:
    //    transform: translate(panX, panY) scale(zoom)
    //    transformOrigin: center center
    // ══════════════════════════════════════════════════════════════
    ctx.save();
    ctx.translate(W / 2 + pan.x, H / 2 + pan.y);
    ctx.scale(zoom, zoom);
    ctx.translate(-W / 2, -H / 2);

    const sunX = SUN_CX * W;
    const sunY = SUN_CY * H;

    // ── 4a. Orbital paths (dashed ellipses per voice channel) ────
    for (const orb of curOrbits) {
      if (orb.channelType !== 'voice') continue;
      const ox = orb.cx * W;
      const oy = orb.cy * H;
      const r = orb.radius;

      // Soft glow behind ring
      ctx.save();
      ctx.globalAlpha = 0.07;
      ctx.strokeStyle = orb.color;
      ctx.lineWidth = 5;
      ctx.shadowColor = orb.color;
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(ox, oy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // Primary dashed ring (animated dash offset)
      ctx.save();
      ctx.globalAlpha = 0.20;
      ctx.strokeStyle = orb.color;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([8, 14]);
      ctx.lineDashOffset = -T * 10;
      ctx.beginPath();
      ctx.arc(ox, oy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // Outer faint ring (counter-rotating dash)
      ctx.save();
      ctx.globalAlpha = 0.07;
      ctx.strokeStyle = orb.color;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 20]);
      ctx.lineDashOffset = T * 5;
      ctx.beginPath();
      ctx.arc(ox, oy, r * 1.2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // ── 4b. Asteroid belt (ring of micro-particles around sun) ───
    const belt = beltRef.current!;
    ctx.save();
    for (const a of belt) {
      const ang = a.angle + T * a.speed;
      const bx = sunX + Math.cos(ang) * a.dist;
      const by = sunY + Math.sin(ang) * a.dist * 0.6; // slight elliptical flatten
      ctx.globalAlpha = 0.10 + a.shade * 0.14;
      ctx.fillStyle = 'rgba(200,220,255,1)';
      ctx.beginPath();
      ctx.arc(bx, by, a.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // ── 4c. Sun (corona → core → flares → hub icon) ─────────────
    ctx.save();
    ctx.globalAlpha = 1;

    // Deep corona glow
    const corona = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, SUN_RADIUS * 3.5);
    corona.addColorStop(0, 'rgba(255,255,255,0.85)');
    corona.addColorStop(0.15, 'rgba(255,235,190,0.65)');
    corona.addColorStop(0.40, 'rgba(255,170,90,0.22)');
    corona.addColorStop(1, 'rgba(255,140,60,0)');
    ctx.fillStyle = corona;
    ctx.beginPath();
    ctx.arc(sunX, sunY, SUN_RADIUS * 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Core gradient (offset highlight for depth)
    const core = ctx.createRadialGradient(
      sunX - 7, sunY - 7, 0,
      sunX, sunY, SUN_RADIUS,
    );
    core.addColorStop(0, 'rgba(255,255,255,1)');
    core.addColorStop(0.50, 'rgba(255,225,150,1)');
    core.addColorStop(1, 'rgba(255,150,70,1)');
    ctx.shadowColor = 'rgba(255,190,110,1)';
    ctx.shadowBlur = 32;
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(sunX, sunY, SUN_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Animated flare arcs
    ctx.globalAlpha = 0.28;
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = 'rgba(255,200,120,0.70)';
    for (let i = 0; i < 8; i++) {
      const a = T * 0.45 + i * (Math.PI * 2 / 8);
      const rr = SUN_RADIUS * (1.18 + 0.10 * Math.sin(a * 1.6));
      const span = 0.28 + 0.20 * Math.sin(a * 1.2);
      ctx.beginPath();
      ctx.arc(sunX, sunY, rr, a, a + span);
      ctx.stroke();
    }

    // Hub icon or initials in sun center
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    const iconR = SUN_RADIUS * 0.52;
    if (hubIconRef.current && hubIconReadyRef.current) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(sunX, sunY, iconR, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(
        hubIconRef.current,
        sunX - iconR, sunY - iconR,
        iconR * 2, iconR * 2,
      );
      ctx.restore();
    } else {
      const initials = getInitials(hubNameRef.current);
      ctx.font = `bold ${Math.round(SUN_RADIUS * 0.48)}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.shadowColor = 'rgba(255,200,100,0.7)';
      ctx.shadowBlur = 8;
      ctx.fillText(initials, sunX, sunY);
      ctx.shadowBlur = 0;
    }

    ctx.restore(); // end sun

    // ── 4d. Planets (textured sphere per voice channel) ──────────
    for (const orb of curOrbits) {
      if (orb.channelType !== 'voice') continue;
      const tex = planetTexRef.current.get(orb.id);
      if (!tex) continue;

      const ox = orb.cx * W;
      const oy = orb.cy * H;
      // Planet visual radius — proportional to orbit zone but capped
      const pr = Math.min(22, 10 + orb.radius * 0.06);

      // Sun → planet direction for lighting
      const dx = sunX - ox;
      const dy = sunY - oy;
      const dist = Math.hypot(dx, dy) || 1;
      const nx = dx / dist;
      const ny = dy / dist;

      // ── Texture mapping (clipped circle, subtle rotation) ──
      ctx.save();
      ctx.beginPath();
      ctx.arc(ox, oy, pr, 0, Math.PI * 2);
      ctx.clip();

      const rot = T * 0.12;
      ctx.translate(ox, oy);
      ctx.rotate(rot);
      ctx.translate(-ox, -oy);

      ctx.globalAlpha = 1;
      ctx.drawImage(tex, ox - pr, oy - pr, pr * 2, pr * 2);

      // Subtle specular on sun-facing side
      ctx.globalAlpha = 0.09;
      ctx.fillStyle = 'rgba(255,255,255,1)';
      ctx.beginPath();
      ctx.ellipse(
        ox + nx * pr * 0.28,
        oy + ny * pr * 0.28,
        pr * 0.50, pr * 0.32,
        -rot * 0.3, 0, Math.PI * 2,
      );
      ctx.fill();
      ctx.restore(); // end clip

      // ── Shadow / terminator (multiply composite) ──
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      const gx = ox - nx * pr * 0.20;
      const gy = oy - ny * pr * 0.20;
      const shadow = ctx.createRadialGradient(gx, gy, pr * 0.15, ox, oy, pr * 1.1);
      shadow.addColorStop(0, 'rgba(255,255,255,1)');
      shadow.addColorStop(0.50, 'rgba(125,125,125,1)');
      shadow.addColorStop(1, 'rgba(14,14,20,1)');
      ctx.fillStyle = shadow;
      ctx.beginPath();
      ctx.arc(ox, oy, pr, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // ── Atmosphere rim glow ──
      ctx.save();
      ctx.globalAlpha = 0.26;
      const orbHue = hexToHue(orb.color);
      ctx.strokeStyle = `hsla(${orbHue}, 85%, 68%, 0.7)`;
      ctx.lineWidth = 1.4;
      ctx.shadowColor = `hsla(${orbHue}, 95%, 62%, 1)`;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(ox, oy, pr * 1.05, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // ── Channel name label beneath planet ──
      ctx.save();
      ctx.globalAlpha = 0.65;
      ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = orb.color;
      ctx.shadowColor = 'rgba(0,0,0,0.85)';
      ctx.shadowBlur = 6;
      ctx.fillText(orb.channelName.toUpperCase(), ox, oy + pr + 14);
      ctx.restore();
    }

    // ── 4e. Connection lines between online users in same orbit ──
    for (const orb of curOrbits) {
      const onlineMembers = orb.memberIds.filter((id) => online.has(id));
      if (onlineMembers.length < 2) continue;

      for (let i = 0; i < onlineMembers.length; i++) {
        for (let j = i + 1; j < onlineMembers.length; j++) {
          const ua = positions[onlineMembers[i]];
          const ub = positions[onlineMembers[j]];
          if (!ua || !ub) continue;

          const pulse = (Math.sin(T * 0.8 + i * 1.3) + 1) / 2;

          // Dashed line
          ctx.beginPath();
          ctx.moveTo(ua.x * W, ua.y * H);
          ctx.lineTo(ub.x * W, ub.y * H);
          ctx.strokeStyle =
            orb.color +
            Math.round((0.06 + pulse * 0.10) * 255)
              .toString(16)
              .padStart(2, '0');
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 9]);
          ctx.lineDashOffset = -T * 8;
          ctx.stroke();
          ctx.setLineDash([]);

          // Travelling dot with organic wobble
          const t = (T * 0.18 + i * 0.4) % 1;
          const ddx = ub.x - ua.x;
          const ddy = ub.y - ua.y;
          const segLen = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
          const perpX = -ddy / segLen;
          const perpY = ddx / segLen;
          const wobble = Math.sin(T * 1.5 + i * 2.1) * 0.025;
          const dotR = 2 + Math.sin(T * 1.0 + i * 0.7) * 0.7;

          ctx.beginPath();
          ctx.arc(
            (ua.x + ddx * t + perpX * wobble) * W,
            (ua.y + ddy * t + perpY * wobble) * H,
            dotR, 0, Math.PI * 2,
          );
          ctx.fillStyle =
            orb.color +
            Math.round((0.45 + pulse * 0.4) * 255)
              .toString(16)
              .padStart(2, '0');
          ctx.shadowColor = orb.color;
          ctx.shadowBlur = 5;
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }
    }

    // ── End world-space transform ────────────────────────────────
    ctx.restore();

    // ══════════════════════════════════════════════════════════════
    // 5. Shooting stars (screen-space)
    // ══════════════════════════════════════════════════════════════
    const shooting = shootingRef.current;

    // Spawn new shooting stars occasionally
    if (Math.random() < dt * 0.22 && shooting.length < MAX_SHOOTING_STARS) {
      const startX = lerp(W * 0.05, W * 0.95, Math.random());
      const startY = lerp(-80, H * 0.25, Math.random());
      const dir = lerp(Math.PI * 0.6, Math.PI * 0.92, Math.random());
      const speed = lerp(700, 1400, Math.random());
      shooting.push({
        x: startX, y: startY,
        vx: Math.cos(dir) * speed,
        vy: Math.sin(dir) * speed,
        life: lerp(0.45, 0.85, Math.random()),
        t: 0,
        len: lerp(120, 300, Math.random()),
        w: lerp(0.9, 2.2, Math.random()),
        hue: lerp(175, 220, Math.random()),
      });
    }

    // Draw & update
    for (let i = shooting.length - 1; i >= 0; i--) {
      const s = shooting[i];
      s.t += dt;
      const tt = s.t / s.life;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (tt >= 1) { shooting.splice(i, 1); continue; }

      const alpha = 1 - tt;
      const ex = s.x - (s.vx / 1100) * s.len;
      const ey = s.y - (s.vy / 1100) * s.len;

      ctx.save();
      ctx.globalAlpha = 0.65 * alpha;
      ctx.lineWidth = s.w;
      ctx.lineCap = 'round';
      const sg = ctx.createLinearGradient(s.x, s.y, ex, ey);
      sg.addColorStop(0, `hsla(${s.hue},95%,72%,${0.9 * alpha})`);
      sg.addColorStop(1, `hsla(${s.hue + 30},95%,72%,0)`);
      ctx.strokeStyle = sg;
      ctx.shadowColor = `hsla(${s.hue},95%,72%,1)`;
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.restore();
    }

    // ══════════════════════════════════════════════════════════════
    // 6. Lens flare from sun (screen-space overlay)
    // ══════════════════════════════════════════════════════════════
    // Compute sun's screen position with pan/zoom applied
    const sunScrX = W / 2 + pan.x + (SUN_CX * W - W / 2) * zoom;
    const sunScrY = H / 2 + pan.y + (SUN_CY * H - H / 2) * zoom;

    if (sunScrX > -180 && sunScrX < W + 180 && sunScrY > -180 && sunScrY < H + 180) {
      const fdx = sunScrX - W * 0.52;
      const fdy = sunScrY - H * 0.48;
      const fd = Math.hypot(fdx, fdy) || 1;
      const fux = fdx / fd;
      const fuy = fdy / fd;

      // Small offset circles
      ctx.save();
      for (let fi = 1; fi <= 5; fi++) {
        const k = fi / 6;
        const fx = sunScrX - fux * k * 340;
        const fy = sunScrY - fuy * k * 340;
        const fr = (1 - k) * 14 + 4;
        ctx.globalAlpha = 0.035 * (1 - k);
        ctx.fillStyle = 'rgba(138,166,255,0.5)';
        ctx.shadowColor = 'rgba(138,166,255,1)';
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.arc(fx, fy, fr, 0, Math.PI * 2);
        ctx.fill();
      }

      // Faint diffraction ring
      ctx.globalAlpha = 0.05;
      ctx.strokeStyle = 'rgba(109,255,218,0.25)';
      ctx.lineWidth = 1.1;
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(sunScrX, sunScrY, SUN_RADIUS * zoom * 2.2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // ── Next frame ───────────────────────────────────────────────
    rafRef.current = requestAnimationFrame(draw);
  }, []);

  // ════════════════════════════════════════════════════════════════
  // Lifecycle: canvas sizing + animation start/stop
  // ════════════════════════════════════════════════════════════════

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      if (w === 0 || h === 0) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    // Reset time so first frame doesn't have a huge dt
    lastStampRef.current = 0;
    timeRef.current = 0;

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      ro.disconnect();
      cancelAnimationFrame(rafRef.current);
    };
  }, [draw]);

  // ════════════════════════════════════════════════════════════════
  // Render
  // ════════════════════════════════════════════════════════════════

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 z-0"
      style={{ width: '100%', height: '100%' }}
    />
  );
}
