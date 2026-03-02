/**
 * @module hub-nebula
 * Renders a single hub as a glowing nebula card in the cosmos landing view.
 * Each hub is positioned absolutely using viewport-fraction coordinates and
 * derives its colour palette deterministically from the hub ID.
 */
'use client';

import { useState, useCallback, useRef } from 'react';

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
// Component
// ---------------------------------------------------------------------------

const DRAG_THRESHOLD = 5;

export function HubNebula({ hub, x, y, onSelect, onDragMove }: HubNebulaProps) {
  const [hovered, setHovered] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; dragging: boolean } | null>(null);

  const { primary, secondary } = getHubColors(hub.id);

  const handleClick = useCallback(() => {
    // Suppress click after drag
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
    <div
      ref={containerRef}
      className="absolute flex flex-col items-center cursor-grab active:cursor-grabbing"
      style={{
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        transform: hovered
          ? 'translate(-50%, -50%) scale(1.08)'
          : 'translate(-50%, -50%)',
        width: '160px',
        height: '160px',
        transition: 'all 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* ── Outer glow ── */}
      <div
        className="absolute rounded-full pointer-events-none"
        style={{
          inset: '-30%',
          background: `radial-gradient(circle, ${primary} 0%, ${secondary} 40%, transparent 70%)`,
          filter: 'blur(25px)',
          opacity: hovered ? 0.9 : 0.5,
          animation: 'nebula-breathe 4s ease-in-out infinite',
          transition: 'opacity 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      />

      {/* ── Inner core ── */}
      <div
        className="relative flex items-center justify-center rounded-full"
        style={{
          width: '80px',
          height: '80px',
          margin: 'auto',
          background: `radial-gradient(circle, ${primary}, ${secondary})`,
          boxShadow: `0 0 30px ${primary}40, 0 0 60px ${primary}20`,
        }}
      >
        {hub.iconUrl ? (
          <img
            src={hub.iconUrl}
            alt={hub.name}
            className="w-10 h-10 rounded-full object-cover"
            draggable={false}
          />
        ) : (
          <span className="select-none font-display font-bold text-white text-lg">
            {getInitials(hub.name)}
          </span>
        )}
      </div>

      {/* ── Hub name label ── */}
      <div
        className={`mt-auto font-mono uppercase tracking-[0.1em] text-[11px] whitespace-nowrap ${
          hovered ? 'text-white/90' : 'text-white/60'
        }`}
        style={{
          background: 'rgba(255, 255, 255, 0.06)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          padding: '2px 10px',
          borderRadius: '9999px',
          transition: 'color 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {hub.name}
      </div>
    </div>
  );
}
