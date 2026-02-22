import { create } from 'zustand';

export interface ReadStateEntry {
  lastReadMessageId: string | null;
  mentionCount: number;
}

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
