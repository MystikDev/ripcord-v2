/**
 * @module voice-state-store
 * Zustand store for voice channel participation, speaking indicators, and
 * screen-sharing state. Combines REST-hydrated data with real-time gateway
 * events and LiveKit-bridged signals.
 */

import { create } from 'zustand';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A user present in a voice channel. */
export interface VoiceParticipant {
  userId: string;
  handle?: string;
  selfMute: boolean;
  selfDeaf: boolean;
  joinedAt: string;
}

export interface VoiceStateStore {
  /** channelId -> participants in that voice channel */
  voiceStates: Record<string, VoiceParticipant[]>;

  /** User IDs currently speaking (bridged from LiveKit context). Runtime-only. */
  speakingUserIds: string[];

  /** User IDs currently screen-sharing (bridged from LiveKit context). Runtime-only. */
  screenSharingUserIds: string[];

  /** Add a participant to a voice channel. */
  addParticipant: (channelId: string, participant: VoiceParticipant) => void;

  /** Remove a participant from a voice channel. */
  removeParticipant: (channelId: string, userId: string) => void;

  /** Update a participant's mute/deaf state. */
  updateParticipant: (channelId: string, userId: string, update: Partial<VoiceParticipant>) => void;

  /** Bulk set voice states (used for REST hydration). */
  setMany: (states: Record<string, VoiceParticipant[]>) => void;

  /** Set the list of currently speaking user IDs. */
  setSpeakingUserIds: (ids: string[]) => void;

  /** Set the list of currently screen-sharing user IDs. */
  setScreenSharingUserIds: (ids: string[]) => void;

  /** Reset all voice state data. */
  reset: () => void;
}

/**
 * Stable empty array reference to avoid infinite re-render loops
 * when selecting `voiceStates[channelId]` from components.
 */
export const EMPTY_PARTICIPANTS: VoiceParticipant[] = [];

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useVoiceStateStore = create<VoiceStateStore>()((set) => ({
  voiceStates: {},
  speakingUserIds: [],
  screenSharingUserIds: [],

  addParticipant: (channelId, participant) =>
    set((state) => {
      const existing = state.voiceStates[channelId] ?? [];
      // Avoid duplicates — replace if user already present
      const filtered = existing.filter((p) => p.userId !== participant.userId);
      return {
        voiceStates: {
          ...state.voiceStates,
          [channelId]: [...filtered, participant],
        },
      };
    }),

  removeParticipant: (channelId, userId) =>
    set((state) => {
      const existing = state.voiceStates[channelId];
      if (!existing) return state;
      const filtered = existing.filter((p) => p.userId !== userId);
      const next = { ...state.voiceStates };
      if (filtered.length === 0) {
        delete next[channelId];
      } else {
        next[channelId] = filtered;
      }
      return { voiceStates: next };
    }),

  updateParticipant: (channelId, userId, update) =>
    set((state) => {
      const existing = state.voiceStates[channelId];
      if (!existing) return state;
      return {
        voiceStates: {
          ...state.voiceStates,
          [channelId]: existing.map((p) =>
            p.userId === userId ? { ...p, ...update } : p,
          ),
        },
      };
    }),

  setMany: (states) =>
    set((prev) => ({
      voiceStates: { ...prev.voiceStates, ...states },
    })),

  setSpeakingUserIds: (ids) => set({ speakingUserIds: ids }),

  setScreenSharingUserIds: (ids) => set({ screenSharingUserIds: ids }),

  reset: () => set({ voiceStates: {}, speakingUserIds: [], screenSharingUserIds: [] }),
}));
