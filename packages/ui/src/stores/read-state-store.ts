/**
 * @module read-state-store
 * Zustand store for per-channel read state, tracking the last read message and
 * unread mention count to power unread badges in the channel list.
 */

import { create } from 'zustand';

/** Read-state data for a single channel. */
export interface ReadStateEntry {
  lastReadMessageId: string | null;
  mentionCount: number;
}

/** State and actions for channel read-state tracking. */
export interface ReadStateState {
  /** channelId -> read state */
  readStates: Record<string, ReadStateEntry>;

  /** Set the read state for a channel. */
  setReadState: (channelId: string, lastReadMessageId: string | null, mentionCount?: number) => void;
  /** Set multiple read states at once (bulk load). */
  setMany: (states: Array<{ channelId: string; lastReadMessageId: string | null; mentionCount: number }>) => void;
  /** Get the last read message ID for a channel. */
  getLastRead: (channelId: string) => string | null;
  reset: () => void;
}

export const useReadStateStore = create<ReadStateState>()((set, get) => ({
  readStates: {},

  setReadState: (channelId, lastReadMessageId, mentionCount = 0) =>
    set((state) => ({
      readStates: {
        ...state.readStates,
        [channelId]: { lastReadMessageId, mentionCount },
      },
    })),

  setMany: (states) =>
    set((state) => {
      const next = { ...state.readStates };
      for (const s of states) {
        next[s.channelId] = { lastReadMessageId: s.lastReadMessageId, mentionCount: s.mentionCount };
      }
      return { readStates: next };
    }),

  getLastRead: (channelId) => {
    return get().readStates[channelId]?.lastReadMessageId ?? null;
  },

  reset: () => set({ readStates: {} }),
}));
