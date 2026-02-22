import { create } from 'zustand';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PresenceStatus = 'online' | 'idle' | 'dnd' | 'offline';

export interface PresenceState {
  /** User ID -> presence status */
  presence: Record<string, PresenceStatus>;

  /** Update a single user's presence. */
  setPresence: (userId: string, status: PresenceStatus) => void;

  /** Bulk set presence for multiple users. */
  setMany: (entries: Array<{ userId: string; status: PresenceStatus }>) => void;

  /** Get a user's status, defaulting to 'offline'. */
  getStatus: (userId: string) => PresenceStatus;

  /** Reset all presence data. */
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const usePresenceStore = create<PresenceState>()((set, get) => ({
  presence: {},

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

  reset: () => set({ presence: {} }),
}));
