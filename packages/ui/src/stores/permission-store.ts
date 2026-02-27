/**
 * @module permission-store
 * Caches the current user's computed permission bitfield per hub.
 * Populated on hub switch via GET /v1/voice/permissions/:hubId.
 */

import { create } from 'zustand';

export interface PermissionState {
  /** Hub ID → computed permission bitfield. */
  permissions: Record<string, number>;
  /** Store (or replace) the permission bitfield for a hub. */
  setPermissions: (hubId: string, perms: number) => void;
  /** Clear all cached permissions (e.g. on logout). */
  clear: () => void;
}

export const usePermissionStore = create<PermissionState>()((set) => ({
  permissions: {},

  setPermissions: (hubId, perms) =>
    set((state) => ({
      permissions: { ...state.permissions, [hubId]: perms },
    })),

  clear: () => set({ permissions: {} }),
}));
