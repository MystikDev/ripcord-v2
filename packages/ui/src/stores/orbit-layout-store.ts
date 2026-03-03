/**
 * @module orbit-layout-store
 * Transient layout state for the orbital view. Stores user-dragged orbit
 * position overrides (viewport fractions) and canvas pan offset. Resets on
 * hub switch — positions are not persisted across sessions.
 */

import { create } from 'zustand';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OrbitLayoutState {
  /** channelId → dragged position as viewport fractions (0-1) */
  overrides: Record<string, { cx: number; cy: number }>;
  /** Set/update a single orbit's override position */
  setOverride: (channelId: string, pos: { cx: number; cy: number }) => void;
  /** Clear all orbit overrides (e.g. on hub switch) */
  clearOverrides: () => void;

  /** Canvas pan offset in pixels */
  panOffset: { x: number; y: number };
  /** Update pan offset */
  setPanOffset: (offset: { x: number; y: number }) => void;
  /** Reset pan offset to origin */
  resetPanOffset: () => void;

  /** Canvas zoom level (0.3–3.0, default 1.0). */
  zoomLevel: number;
  /** Set zoom level directly (clamped 0.3–3.0). */
  setZoomLevel: (level: number) => void;
  /** Adjust zoom by a delta (clamped 0.3–3.0). */
  adjustZoom: (delta: number) => void;

  /** Reset all transient state (overrides + pan + zoom) */
  resetAll: () => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useOrbitLayoutStore = create<OrbitLayoutState>((set) => ({
  overrides: {},
  setOverride: (channelId, pos) =>
    set((s) => ({ overrides: { ...s.overrides, [channelId]: pos } })),
  clearOverrides: () => set({ overrides: {} }),

  panOffset: { x: 0, y: 0 },
  setPanOffset: (offset) => set({ panOffset: offset }),
  resetPanOffset: () => set({ panOffset: { x: 0, y: 0 } }),

  zoomLevel: 1.0,
  setZoomLevel: (level) => set({ zoomLevel: Math.max(0.3, Math.min(3.0, level)) }),
  adjustZoom: (delta) =>
    set((s) => ({ zoomLevel: Math.max(0.3, Math.min(3.0, s.zoomLevel + delta)) })),

  resetAll: () => set({ overrides: {}, panOffset: { x: 0, y: 0 }, zoomLevel: 1.0 }),
}));
