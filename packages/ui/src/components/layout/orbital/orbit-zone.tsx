/**
 * @module orbit-zone
 * Renders a voice channel as a pulsing ring "orbit zone" in the orbital view.
 * Two concentric rings pulse at different delays, and a label displays the
 * channel name. Double-click the invisible interaction area to join voice.
 * Supports dragging with a 5px threshold to avoid conflicting with double-click.
 */
'use client';

import { useCallback, useRef } from 'react';
import clsx from 'clsx';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OrbitZoneProps {
  /** Channel ID */
  id: string;
  /** Channel name */
  name: string;
  /** Center position as fraction of viewport (0-1) */
  cx: number;
  cy: number;
  /** Radius in pixels */
  radius: number;
  /** Orbit color hex string */
  color: string;
  /** Number of members in this orbit */
  memberCount: number;
  /** Whether this orbit was just created (show spawn animation) */
  spawning?: boolean;
  /** Whether this orbit is a temporary orbit */
  isTemporary?: boolean;
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
  color,
  memberCount,
  spawning = false,
  isTemporary = false,
  onDoubleClick,
  onDragMove,
  onContextMenu,
}: OrbitZoneProps) {
  const d1 = radius * 2;
  const d2 = radius * 2.4;

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
      // Don't capture if it's a button
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

      // Check threshold to start drag
      if (!ref.dragging) {
        if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
        ref.dragging = true;
      }

      // Convert pointer position to viewport fractions
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

      // If we were dragging, prevent the click / double-click from firing
      if (ref?.dragging) {
        e.stopPropagation();
      }
    },
    [],
  );

  return (
    <div
      className={clsx(
        'orbit-zone absolute pointer-events-none transition-opacity duration-400',
        spawning && 'spawning animate-[orbitSpawn_0.5s_cubic-bezier(0.34,1.56,0.64,1)_forwards]',
      )}
      style={{
        left: `${cx * 100}%`,
        top: `${cy * 100}%`,
        width: `${d1}px`,
        height: `${d1}px`,
        transform: 'translate(-50%, -50%)',
      }}
      data-channel-id={id}
    >
      {/* Primary ring */}
      <div
        className="oz-ring r1 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full animate-[orbitPulse_4s_ease_infinite]"
        style={{
          width: `${d1}px`,
          height: `${d1}px`,
          borderWidth: '1.5px',
          borderStyle: isTemporary ? 'dashed' : 'solid',
          borderColor: color,
        }}
      />

      {/* Secondary ring — larger, delayed, dimmer */}
      <div
        className="oz-ring r2 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full animate-[orbitPulse_4s_ease_infinite]"
        style={{
          width: `${d2}px`,
          height: `${d2}px`,
          borderWidth: '1.5px',
          borderStyle: isTemporary ? 'dashed' : 'solid',
          borderColor: color,
          opacity: 0.5,
          animationDelay: '0.6s',
        }}
      />

      {/* Channel name label */}
      <div
        className="oz-label absolute left-1/2 -translate-x-1/2 font-mono text-[10px] tracking-[0.1em] uppercase whitespace-nowrap flex items-center gap-[4px]"
        style={{
          top: '10px',
          color,
        }}
      >
        {isTemporary && (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="flex-shrink-0">
            <path d="M3 1L2 5h2L3 9l4-5H5L7 1H3z" fill="currentColor" opacity="0.7" />
          </svg>
        )}
        {name}
      </div>

      {/* Invisible interaction area — captures double-click to join, drag to reposition */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-auto cursor-grab active:cursor-grabbing"
        style={{
          width: `${d2}px`,
          height: `${d2}px`,
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onContextMenu?.(e);
        }}
        onDoubleClick={(e) => {
          // Only fire double-click if we weren't dragging
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
