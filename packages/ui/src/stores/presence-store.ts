/**
 * @module presence-store
 * Zustand store for user online/idle/dnd/offline presence state, updated in
 * real time via the gateway WebSocket.
 */

import { create } from 'zustand';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The possible presence statuses for a user. */
export type PresenceStatus = 'online' | 'idle' | 'dnd' | 'offline';

/** State and actions for tracking user presence across all hubs. */
export interface PresenceState {
  /** User ID -> presence status */
  presence: Record<string, PresenceStatus>;

  /** User ID -> custom status text (client-side only, in-memory) */
  customStatuses: Record<string, string>;

  /** Update a single user's presence. */
  setPresence: (userId: string, status: PresenceStatus) => void;

  /** Bulk set presence for multiple users. */
  setMany: (entries: Array<{ userId: string; status: PresenceStatus }>) => void;

  /** Get a user's status, defaulting to 'offline'. */
  getStatus: (userId: string) => PresenceStatus;

  /** Set a custom status text for a user. Pass empty string to clear. */
  setCustomStatus: (userId: string, status: string) => void;

  /** Get a user's custom status text, or undefined if not set. */
  getCustomStatus: (userId: string) => string | undefined;

  /** Reset all presence data. */
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const usePresenceStore = create<PresenceState>()((set, get) => ({
  presence: {},
  customStatuses: {},

  setPresence: (userId, status) =>
    set((state) => ({
      presence: { ...state.presence, [userId]: status },
    })),

  setMany: (entries) =>
    set((state) => {
      const next = { ...state.presence };
      for (const { userId, status } of entries) {
        next[userId] = status;
      }
      return { presence: next };
    }),

  getStatus: (userId) => get().presence[userId] ?? 'offline',

  setCustomStatus: (userId, status) =>
    set((state) => {
      if (!status) {
        // Clear the status
        const next = { ...state.customStatuses };
        delete next[userId];
        return { customStatuses: next };
      }
      return { customStatuses: { ...state.customStatuses, [userId]: status } };
    }),

  getCustomStatus: (userId) => get().customStatuses[userId],

  reset: () => set({ presence: {}, customStatuses: {} }),
}));
