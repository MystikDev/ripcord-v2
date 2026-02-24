/**
 * @module typing-store
 * Zustand store for real-time typing indicators. Tracks which users are
 * currently typing in each channel with auto-expiring entries.
 */

import { create } from 'zustand';

/** A single typing indicator entry with an auto-expiry timestamp. */
export interface TypingUser {
  userId: string;
  handle: string;
  /** Unix timestamp (ms) after which this indicator should be discarded. */
  expiresAt: number;
}

/** State and actions for managing per-channel typing indicators. */
export interface TypingState {
  /** channelId -> array of currently typing users */
  typing: Record<string, TypingUser[]>;

  /** Add a typing indicator (auto-expires after 5 seconds). */
  addTyping: (channelId: string, userId: string, handle: string) => void;
  /** Remove a specific user's typing indicator. */
  removeTyping: (channelId: string, userId: string) => void;
  /** Clean up expired typing indicators. */
  pruneExpired: () => void;
  /** Get currently typing users for a channel (excludes expired). */
  getTyping: (channelId: string) => TypingUser[];
  reset: () => void;
}

const TYPING_TIMEOUT_MS = 5_000;

export const useTypingStore = create<TypingState>()((set, get) => ({
  typing: {},

  addTyping: (channelId, userId, handle) =>
    set((state) => {
      const existing = state.typing[channelId] ?? [];
      const now = Date.now();
      // Remove existing entry for this user (will re-add with new expiry)
      const filtered = existing.filter((t) => t.userId !== userId && t.expiresAt > now);
      return {
        typing: {
          ...state.typing,
          [channelId]: [...filtered, { userId, handle, expiresAt: now + TYPING_TIMEOUT_MS }],
        },
      };
    }),

  removeTyping: (channelId, userId) =>
    set((state) => {
      const existing = state.typing[channelId] ?? [];
      return {
        typing: {
          ...state.typing,
          [channelId]: existing.filter((t) => t.userId !== userId),
        },
      };
    }),

  pruneExpired: () =>
    set((state) => {
      const now = Date.now();
      const next: Record<string, TypingUser[]> = {};
      for (const [channelId, users] of Object.entries(state.typing)) {
        const active = users.filter((t) => t.expiresAt > now);
        if (active.length > 0) {
          next[channelId] = active;
        }
      }
      return { typing: next };
    }),

  getTyping: (channelId) => {
    const now = Date.now();
    return (get().typing[channelId] ?? []).filter((t) => t.expiresAt > now);
  },

  reset: () => set({ typing: {} }),
}));
