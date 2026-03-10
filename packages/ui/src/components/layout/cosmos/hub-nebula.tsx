/**
 * @module hub-nebula
 * Renders a single hub as a visually rich nebula in the cosmos landing view.
 * Features: animated orbital rings, particle field, pulsing core with
 * dynamic glow, and smooth hover interactions. Colour palette is derived
 * deterministically from the hub ID for consistency.
 */
'use client';

import { useState, useCallback, useRef, useMemo } from 'react';
import {
  Tooltip,
} from '../../ui/tooltip';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HubNebulaProps {
  hub: { id: string; name: string; iconUrl?: string };
  /** Position as viewport fractions (0-1) */
  x: number;
  y: number;
  /** Called with hub ID and DOM position for zoom targeting */
  onSelect: (hubId: string, pos: { x: number; y: number }) => void;
  /** Called during drag with new viewport-fraction coordinates */
  onDragMove?: (hubId: string, x: number, y: number) => void;
  /** Number of members currently online in this hub */
  onlineCount?: number;
  /** Whether this hub has unread messages */
  hasUnread?: boolean;
  /** Number of channels in this hub (if known) */
  channelCount?: number;
}

// ---------------------------------------------------------------------------
// Colour derivation
// ---------------------------------------------------------------------------

function hubIdToHue(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return ((hash % 360) + 360) % 360;
}

function getHubColors(id: string) {
  const hue = hubIdToHue(id);
  return {
    primary: `hsl(${hue}, 80%, 60%)`,
    secondary: `hsl(${hue + 40}, 70%, 50%)`,
    glow: `hsl(${hue}, 90%, 65%)`,
    faint: `hsl(${hue}, 60%, 40%)`,
    ring: `hsl(${hue + 20}, 70%, 55%)`,
  };
}

// ---------------------------------------------------------------------------
// Initials helper
// ---------------------------------------------------------------------------

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

// ---------------------------------------------------------------------------
// Deterministic particles from hub ID
// ---------------------------------------------------------------------------

interface Particle {
  /** Angle in degrees */
  angle: number;
  /** Distance from center as fraction of container */
  dist: number;
  /** Size in px */
  size: number;
  /** Animation delay */
  delay: number;
  /** Opacity */
  opacity: number;
}

function generateParticles(id: string, count: number): Particle[] {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }

  const particles: Particle[] = [];
  for (let i = 0; i < count; i++) {
    hash = (hash * 16807 + 12345) & 0x7fffffff;
    const angle = (hash % 360);
    hash = (hash * 16807 + 12345) & 0x7fffffff;
    const dist = 0.25 + ((hash % 100) / 100) * 0.45;
    hash = (hash * 16807 + 12345) & 0x7fffffff;
    const size = 1 + (hash % 3);
    hash = (hash * 16807 + 12345) & 0x7fffffff;
    const delay = (hash % 4000) / 1000;
    hash = (hash * 16807 + 12345) & 0x7fffffff;
    const opacity = 0.3 + ((hash % 60) / 100);

    particles.push({ angle, dist, size, delay, opacity });
  }
  return particles;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const DRAG_THRESHOLD = 5;

export function HubNebula({ hub, x, y, onSelect, onDragMove, onlineCount = 0, hasUnread = false, channelCount }: HubNebulaProps) {
  const [hovered, setHovered] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; dragging: boolean } | null>(null);

  const colors = getHubColors(hub.id);
  const particles = useMemo(() => generateParticles(hub.id, 12), [hub.id]);

  // Deterministic ring tilt from hub ID
  const ringTilt = useMemo(() => {
    let h = 0;
    for (let i = 0; i < hub.id.length; i++) h = hub.id.charCodeAt(i) + ((h << 5) - h);
    return 55 + (h % 25); // 55-80 degree tilt
  }, [hub.id]);

  // Build tooltip text
  const tooltipText = useMemo(() => {
    const parts: string[] = [hub.name];
    if (onlineCount > 0) parts.push(`${onlineCount} online`);
    if (channelCount !== undefined && channelCount > 0)
      parts.push(`${channelCount} channel${channelCount !== 1 ? 's' : ''}`);
    return parts.join(' \u2022 ');
  }, [hub.name, onlineCount, channelCount]);

  const handleClick = useCallback(() => {
    if (dragRef.current?.dragging) return;
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    onSelect(hub.id, { x: centerX, y: centerY });
  }, [hub.id, onSelect]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!onDragMove) return;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      dragRef.current = { startX: e.clientX, startY: e.clientY, dragging: false };
    },
    [onDragMove],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const ref = dragRef.current;
      if (!ref || !onDragMove) return;
      const dx = e.clientX - ref.startX;
      const dy = e.clientY - ref.startY;
      if (!ref.dragging) {
        if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
        ref.dragging = true;
      }
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const newX = Math.max(0.05, Math.min(0.95, e.clientX / vw));
      const newY = Math.max(0.05, Math.min(0.95, e.clientY / vh));
      onDragMove(hub.id, newX, newY);
    },
    [hub.id, onDragMove],
  );

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  return (
    <Tooltip content={tooltipText} side="top">
    <div
      ref={containerRef}
      className="absolute flex flex-col items-center cursor-grab active:cursor-grabbing"
      style={{
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        transform: hovered
          ? 'translate(-50%, -50%) scale(1.12)'
          : 'translate(-50%, -50%)',
        width: '200px',
        height: '200px',
        transition: 'all 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* ── Unread magenta glow ── */}
      {hasUnread && (
        <div
          className="absolute pointer-events-none"
          style={{
            inset: '-30%',
            background: 'radial-gradient(circle, rgba(255, 0, 110, 0.25) 0%, rgba(255, 0, 110, 0.08) 40%, transparent 70%)',
            filter: 'blur(20px)',
            animation: 'cosmos-core-pulse 3s ease-in-out infinite',
          }}
        />
      )}

      {/* ── Deep ambient glow ── */}
      <div
        className="absolute pointer-events-none"
        style={{
          inset: '-50%',
          background: `radial-gradient(circle, ${colors.glow}15 0%, ${colors.primary}08 40%, transparent 70%)`,
          filter: 'blur(30px)',
          opacity: hovered ? 1 : 0.6,
          transition: 'opacity 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      />

      {/* ── Outer nebula haze ── */}
      <div
        className="absolute pointer-events-none"
        style={{
          inset: '-25%',
          background: `radial-gradient(ellipse at 40% 45%, ${colors.primary}20 0%, ${colors.secondary}10 50%, transparent 80%)`,
          filter: 'blur(15px)',
          opacity: hovered ? 0.9 : 0.5,
          animation: 'nebula-breathe 4s ease-in-out infinite',
          transition: 'opacity 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      />

      {/* ── Orbital ring 1 ── */}
      <div
        className="absolute pointer-events-none"
        style={{
          width: '140px',
          height: '140px',
          left: '50%',
          top: '50%',
          transform: `translate(-50%, -50%) rotateX(${ringTilt}deg)`,
          borderRadius: '50%',
          border: `1px solid`,
          borderColor: hovered ? `${colors.ring}60` : `${colors.ring}25`,
          animation: 'cosmos-ring-spin 12s linear infinite',
          transition: 'border-color 0.5s',
        }}
      >
        {/* Orbiting dot */}
        <div
          style={{
            position: 'absolute',
            top: '-2px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '4px',
            height: '4px',
            borderRadius: '50%',
            background: colors.glow,
            boxShadow: `0 0 6px ${colors.glow}`,
          }}
        />
      </div>

      {/* ── Orbital ring 2 (counter-rotating) ── */}
      <div
        className="absolute pointer-events-none"
        style={{
          width: '170px',
          height: '170px',
          left: '50%',
          top: '50%',
          transform: `translate(-50%, -50%) rotateX(${ringTilt + 15}deg) rotateZ(45deg)`,
          borderRadius: '50%',
          border: `1px solid`,
          borderColor: hovered ? `${colors.secondary}40` : `${colors.secondary}15`,
          animation: 'cosmos-ring-spin-reverse 18s linear infinite',
          transition: 'border-color 0.5s',
        }}
      />

      {/* ── Particle field ── */}
      {particles.map((p, i) => {
        const rad = (p.angle * Math.PI) / 180;
        const px = 50 + Math.cos(rad) * p.dist * 100;
        const py = 50 + Math.sin(rad) * p.dist * 100;
        return (
          <div
            key={i}
            className="absolute rounded-full pointer-events-none"
            style={{
              left: `${px}%`,
              top: `${py}%`,
              width: `${p.size}px`,
              height: `${p.size}px`,
              background: colors.glow,
              opacity: hovered ? p.opacity : p.opacity * 0.4,
              boxShadow: `0 0 ${p.size * 2}px ${colors.glow}60`,
              animation: `cosmos-particle-pulse ${2 + p.delay}s ease-in-out infinite`,
              animationDelay: `${p.delay}s`,
              transition: 'opacity 0.5s',
            }}
          />
        );
      })}

      {/* ── Inner core ── */}
      <div
        className="relative flex items-center justify-center rounded-full"
        style={{
          width: '76px',
          height: '76px',
          margin: 'auto',
          background: `radial-gradient(circle at 35% 35%, ${colors.glow}40, ${colors.primary}90 50%, ${colors.secondary} 100%)`,
          boxShadow: hovered
            ? `0 0 20px ${colors.glow}60, 0 0 50px ${colors.primary}30, 0 0 80px ${colors.primary}15, inset 0 0 20px ${colors.glow}20`
            : `0 0 15px ${colors.primary}30, 0 0 40px ${colors.primary}15, inset 0 0 15px ${colors.glow}10`,
          animation: 'cosmos-core-pulse 3s ease-in-out infinite',
          transition: 'box-shadow 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Glass highlight on core */}
        <div
          className="absolute rounded-full pointer-events-none"
          style={{
            width: '60%',
            height: '40%',
            top: '8%',
            left: '15%',
            background: 'linear-gradient(180deg, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0) 100%)',
            borderRadius: '50%',
          }}
        />
        {hub.iconUrl ? (
          <img
            src={hub.iconUrl}
            alt={hub.name}
            className="w-10 h-10 rounded-full object-cover"
            draggable={false}
            style={{ position: 'relative', zIndex: 1 }}
          />
        ) : (
          <span
            className="select-none font-display font-bold text-lg"
            style={{
              position: 'relative',
              zIndex: 1,
              color: 'rgba(255,255,255,0.95)',
              textShadow: `0 0 10px ${colors.glow}80`,
            }}
          >
            {getInitials(hub.name)}
          </span>
        )}

        {/* ── Unread badge dot ── */}
        {hasUnread && (
          <div
            className="absolute"
            style={{
              top: '2px',
              right: '2px',
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              background: 'rgb(255, 0, 110)',
              boxShadow: '0 0 8px rgba(255, 0, 110, 0.7), 0 0 16px rgba(255, 0, 110, 0.3)',
              border: '2px solid rgba(0, 0, 0, 0.4)',
              zIndex: 2,
            }}
          />
        )}
      </div>

      {/* ── Hub name label + online count ── */}
      <div className="mt-auto flex flex-col items-center gap-0.5">
        <div
          className="font-mono uppercase tracking-[0.12em] text-[10px] whitespace-nowrap"
          style={{
            background: hovered ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.05)',
            border: `1px solid ${hovered ? `${colors.ring}40` : 'rgba(255, 255, 255, 0.06)'}`,
            padding: '3px 12px',
            borderRadius: '9999px',
            color: hovered ? 'rgba(255, 255, 255, 0.95)' : 'rgba(255, 255, 255, 0.6)',
            transition: 'all 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
            backdropFilter: 'blur(8px)',
            textShadow: hovered ? `0 0 8px ${colors.glow}40` : 'none',
          }}
        >
          {hub.name}
        </div>
        <span className="text-[10px] text-white/40 font-mono mt-0.5">
          {onlineCount > 0 ? `${onlineCount} online` : 'No activity'}
        </span>
      </div>
    </div>
    </Tooltip>
  );
}
