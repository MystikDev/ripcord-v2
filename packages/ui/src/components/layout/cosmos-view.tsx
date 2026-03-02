/**
 * @module cosmos-view
 * Main cosmos landing page orchestrator. Renders all joined hubs as nebula
 * visualizations positioned across a deep-space canvas and drives the
 * zoom-in transition when a user selects a hub to enter its orbital view.
 */
'use client';

import { useState, useMemo, useCallback, useRef } from 'react';
import { CosmosCanvasBg } from './cosmos/cosmos-canvas-bg';
import { HubNebula } from './cosmos/hub-nebula';
import { useHubStore, type Hub } from '../../stores/server-store';

// ---------------------------------------------------------------------------
// Pan drag ref type
// ---------------------------------------------------------------------------
interface PanDragState {
  startX: number;
  startY: number;
  startPanX: number;
  startPanY: number;
}

// ---------------------------------------------------------------------------
// Position presets for small hub counts (x/y as 0-1 viewport fractions)
// ---------------------------------------------------------------------------

const COSMOS_PRESETS: Record<number, Array<{ x: number; y: number }>> = {
  1: [{ x: 0.5, y: 0.45 }],
  2: [
    { x: 0.38, y: 0.45 },
    { x: 0.62, y: 0.45 },
  ],
  3: [
    { x: 0.3, y: 0.42 },
    { x: 0.5, y: 0.35 },
    { x: 0.7, y: 0.48 },
  ],
};

// ---------------------------------------------------------------------------
// Grid layout with deterministic jitter for 4+ hubs
// ---------------------------------------------------------------------------

function computePositions(
  hubs: Hub[],
): Array<{ hubId: string; x: number; y: number }> {
  const count = hubs.length;
  if (count === 0) return [];

  const presets = COSMOS_PRESETS[count];
  if (presets) {
    return hubs.map((h, i) => ({
      hubId: h.id,
      x: presets[i].x,
      y: presets[i].y,
    }));
  }

  // Grid layout with organic jitter derived from hub ID
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);

  return hubs.map((h, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);

    // Center each hub within its grid cell, with outer margins
    const baseX = 0.15 + ((col + 0.5) / cols) * 0.7;
    const baseY = 0.15 + ((row + 0.5) / rows) * 0.7;

    // Deterministic jitter seeded from the hub ID string
    let hash = 0;
    for (let c = 0; c < h.id.length; c++) {
      hash = h.id.charCodeAt(c) + ((hash << 5) - hash);
    }
    const jx = ((hash & 0xff) / 255 - 0.5) * 0.06;
    const jy = (((hash >> 8) & 0xff) / 255 - 0.5) * 0.06;

    return {
      hubId: h.id,
      x: Math.max(0.1, Math.min(0.9, baseX + jx)),
      y: Math.max(0.1, Math.min(0.9, baseY + jy)),
    };
  });
}

// ---------------------------------------------------------------------------
// CosmosView component
// ---------------------------------------------------------------------------

export function CosmosView() {
  const hubs = useHubStore((s) => s.hubs);
  const setActiveHub = useHubStore((s) => s.setActiveHub);

  const positions = useMemo(() => computePositions(hubs), [hubs]);

  const [zoomTarget, setZoomTarget] = useState<{
    hubId: string;
    x: number;
    y: number;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // -- Canvas pan (local, not persisted) ------------------------------------
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const panDragRef = useRef<PanDragState | null>(null);

  const handlePanDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.target !== e.currentTarget) return;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      panDragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startPanX: panOffset.x,
        startPanY: panOffset.y,
      };
    },
    [panOffset],
  );

  const handlePanMove = useCallback(
    (e: React.PointerEvent) => {
      if (!panDragRef.current) return;
      const dx = e.clientX - panDragRef.current.startX;
      const dy = e.clientY - panDragRef.current.startY;
      setPanOffset({
        x: panDragRef.current.startPanX + dx,
        y: panDragRef.current.startPanY + dy,
      });
    },
    [],
  );

  const handlePanUp = useCallback(() => {
    panDragRef.current = null;
  }, []);

  // -----------------------------------------------------------------------
  // Hub select handler — kicks off zoom animation then transitions view
  // -----------------------------------------------------------------------

  const handleSelect = useCallback(
    (hubId: string, pos: { x: number; y: number }) => {
      if (zoomTarget) return; // already zooming

      // Compute translate offset so the clicked nebula zooms toward center
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const dx = (-(pos.x - vw / 2) / vw) * 100;
      const dy = (-(pos.y - vh / 2) / vh) * 100;

      setZoomTarget({ hubId, x: dx, y: dy });

      // After most of the animation, switch to the hub's orbital view
      setTimeout(() => {
        setActiveHub(hubId);
      }, 500);
    },
    [zoomTarget, setActiveHub],
  );

  // -----------------------------------------------------------------------
  // Empty state fallback (onboarding normally handles this)
  // -----------------------------------------------------------------------

  if (hubs.length === 0) {
    return (
      <div className="relative flex-1 overflow-hidden">
        <CosmosCanvasBg />
        <div className="absolute inset-0 z-[10] flex items-center justify-center">
          <span className="text-text-muted text-sm select-none">
            No solar systems yet
          </span>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Main render
  // -----------------------------------------------------------------------

  return (
    <div
      ref={containerRef}
      className="relative flex-1 overflow-hidden"
      style={{
        // Entrance animation (when no zoom target)
        animation: !zoomTarget
          ? 'cosmos-enter 400ms ease-out both'
          : undefined,
        // Zoom animation (when hub clicked)
        ...(zoomTarget
          ? ({
              animation:
                'cosmos-zoom-in 700ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
              '--zx': `${zoomTarget.x}%`,
              '--zy': `${zoomTarget.y}%`,
            } as React.CSSProperties)
          : {}),
      }}
    >
      {/* ── Pannable content layer ── */}
      <div
        className="absolute inset-0 z-[2] cursor-grab active:cursor-grabbing"
        style={{
          transform: `translate(${panOffset.x}px, ${panOffset.y}px)`,
        }}
        onPointerDown={handlePanDown}
        onPointerMove={handlePanMove}
        onPointerUp={handlePanUp}
      >
        {/* Canvas deep-space background */}
        <CosmosCanvasBg />

        {/* Subtle grid overlay */}
        <div
          className="absolute inset-0 z-[1] pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)',
            backgroundSize: '70px 70px',
            maskImage:
              'radial-gradient(circle at center, black 30%, transparent 70%)',
            WebkitMaskImage:
              'radial-gradient(circle at center, black 30%, transparent 70%)',
          }}
        />

        {/* Hub nebulae */}
        <div className="absolute inset-0 z-[5]">
          {positions.map((pos) => {
            const hub = hubs.find((h) => h.id === pos.hubId);
            if (!hub) return null;
            return (
              <HubNebula
                key={hub.id}
                hub={hub}
                x={pos.x}
                y={pos.y}
                onSelect={handleSelect}
              />
            );
          })}
        </div>
      </div>

      {/* ── Fixed UI overlays (not affected by pan) ── */}

      {/* Title */}
      <div className="absolute top-0 left-0 right-0 z-[10] flex justify-center pt-8 pointer-events-none">
        <h1
          className="font-display font-light tracking-[0.25em] uppercase select-none"
          style={{ fontSize: '13px', color: 'rgba(255,255,255,0.25)' }}
        >
          YOUR COSMOS
        </h1>
      </div>

      {/* Bottom hint text */}
      {!zoomTarget && (
        <div className="absolute bottom-0 left-0 right-0 z-[10] flex justify-center pb-8 pointer-events-none">
          <span
            className="font-mono text-[10px] tracking-[0.15em] uppercase select-none"
            style={{ color: 'rgba(255,255,255,0.2)' }}
          >
            Click a solar system to explore
          </span>
        </div>
      )}
    </div>
  );
}
