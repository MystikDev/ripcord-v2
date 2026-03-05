/**
 * @module orbit-zone
 * Invisible interaction overlay for a voice-channel orbit in the orbital view.
 * Visual rendering (rings, labels, planets) is handled by orbital-canvas.tsx.
 * This component provides the React interaction layer: double-click to join
 * voice, drag to reposition, right-click for context menu, and ARIA semantics.
 */
'use client';

import { useCallback, useRef } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OrbitZoneProps {
  /** Channel ID */
  id: string;
  /** Channel name (used for ARIA label) */
  name: string;
  /** Center position as fraction of viewport (0-1) */
  cx: number;
  cy: number;
  /** Radius in pixels */
  radius: number;
  /** Orbit color hex string (passed through, visuals on canvas) */
  color: string;
  /** Number of members in this orbit */
  memberCount: number;
  /** Called when user double-clicks to join voice */
  onDoubleClick?: () => void;
  /** Called during drag with new viewport-fraction position */
  onDragMove?: (channelId: string, cx: number, cy: number) => void;
  /** Called on right-click for context menu */
  onContextMenu?: (e: React.MouseEvent) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum pointer movement before drag kicks in (avoids fighting double-click) */
const DRAG_THRESHOLD = 5;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OrbitZone({
  id,
  name,
  cx,
  cy,
  radius,
  memberCount,
  onDoubleClick,
  onDragMove,
  onContextMenu,
}: OrbitZoneProps) {
  // Interaction area matches the outer ring (1.2x radius)
  const hitSize = radius * 2.4;

  // -- Drag state refs (no re-renders during drag) ---------------------------
  const dragRef = useRef<{
    startX: number;
    startY: number;
    dragging: boolean;
  } | null>(null);

  // -- Drag handlers ---------------------------------------------------------
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!onDragMove) return;
      if ((e.target as HTMLElement).closest('button')) return;

      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        dragging: false,
      };
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
      const newCx = Math.max(0.05, Math.min(0.95, e.clientX / vw));
      const newCy = Math.max(0.05, Math.min(0.95, e.clientY / vh));
      onDragMove(id, newCx, newCy);
    },
    [id, onDragMove],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      const ref = dragRef.current;
      dragRef.current = null;

      if (ref?.dragging) {
        e.stopPropagation();
      }
    },
    [],
  );

  return (
    <div
      className="orbit-zone absolute pointer-events-none"
      style={{
        left: `${cx * 100}%`,
        top: `${cy * 100}%`,
        width: `${hitSize}px`,
        height: `${hitSize}px`,
        transform: 'translate(-50%, -50%)',
      }}
      data-channel-id={id}
    >
      {/* Invisible interaction area — captures double-click, drag, context menu */}
      <div
        className="absolute inset-0 rounded-full pointer-events-auto cursor-grab active:cursor-grabbing"
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onContextMenu?.(e);
        }}
        onDoubleClick={(e) => {
          if (!dragRef.current?.dragging) {
            onDoubleClick?.();
          }
          e.stopPropagation();
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        role="button"
        tabIndex={0}
        aria-label={`${name} — voice channel, ${memberCount} member${memberCount !== 1 ? 's' : ''}. Double-click to join. Drag to reposition.`}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            onDoubleClick?.();
          }
        }}
      />
    </div>
  );
}
