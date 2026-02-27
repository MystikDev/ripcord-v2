/**
 * @module voice-state-store
 * Zustand store for voice channel participation, speaking indicators, and
 * screen-sharing state. Combines REST-hydrated data with real-time gateway
 * events and LiveKit-bridged signals.
 */

import { create } from 'zustand';
import { useAuthStore } from './auth-store.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A user present in a voice channel. */
export interface VoiceParticipant {
  userId: string;
  handle?: string;
  selfMute: boolean;
  selfDeaf: boolean;
  serverMute?: boolean;
  joinedAt: string;
}

export interface VoiceStateStore {
  /** channelId -> participants in that voice channel */
  voiceStates: Record<string, VoiceParticipant[]>;

  /** User IDs currently speaking (bridged from LiveKit context). Runtime-only. */
  speakingUserIds: string[];

  /** User IDs currently screen-sharing (bridged from LiveKit context). Runtime-only. */
  screenSharingUserIds: string[];

  /** Voice channel we're currently connected to (null = not in voice). */
  connectedChannelId: string | null;

  /** Identity of the user whose screen share we're actively viewing (null = auto first). */
  activeScreenShareId: string | null;

  /** User ID whose streaming icon is being hovered (for preview popover). */
  hoveredScreenShareUserId: string | null;

  /** Anchor position for the hover preview popover. */
  hoveredScreenShareAnchor: { x: number; y: number } | null;

  /** Whether the local mic is muted (bridged from LiveKit for UserPanel). */
  localMicMuted: boolean;

  /** Callback to toggle mic (set by VoiceControls inside LiveKitRoom). */
  toggleMicFn: (() => void) | null;

  /** Add a participant to a voice channel. */
  addParticipant: (channelId: string, participant: VoiceParticipant) => void;

  /** Remove a participant from a voice channel. */
  removeParticipant: (channelId: string, userId: string) => void;

  /** Update a participant's mute/deaf state. */
  updateParticipant: (channelId: string, userId: string, update: Partial<VoiceParticipant>) => void;

  /** Replace all participants for a single channel (used for gateway sync). */
  setChannelParticipants: (channelId: string, participants: VoiceParticipant[]) => void;

  /** Bulk set voice states (used for REST hydration). */
  setMany: (states: Record<string, VoiceParticipant[]>) => void;

  /** Set the list of currently speaking user IDs. */
  setSpeakingUserIds: (ids: string[]) => void;

  /** Set the list of currently screen-sharing user IDs. */
  setScreenSharingUserIds: (ids: string[]) => void;

  setConnectedChannelId: (id: string | null) => void;
  setActiveScreenShareId: (id: string | null) => void;
  setHoveredScreenShare: (userId: string | null, anchor?: { x: number; y: number }) => void;
  setLocalMicMuted: (muted: boolean) => void;
  setToggleMicFn: (fn: (() => void) | null) => void;

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
  connectedChannelId: null,
  activeScreenShareId: null,
  hoveredScreenShareUserId: null,
  hoveredScreenShareAnchor: null,
  localMicMuted: false,
  toggleMicFn: null,

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

  setChannelParticipants: (channelId, participants) =>
    set((state) => {
      const next = { ...state.voiceStates };
      if (participants.length === 0) {
        delete next[channelId];
      } else {
        // Merge with existing participants to avoid a race condition where
        // a real-time 'join' event processed before this 'sync' would be
        // overwritten. Keep any existing participants not in the sync list.
        const existing = state.voiceStates[channelId] ?? [];
        const syncUserIds = new Set(participants.map((p) => p.userId));
        const missing = existing.filter((p) => !syncUserIds.has(p.userId));
        next[channelId] = missing.length > 0
          ? [...participants, ...missing]
          : participants;
      }
      return { voiceStates: next };
    }),

  setMany: (states) =>
    set((prev) => {
      const merged = { ...states };

      // Preserve participants from the existing store that are NOT covered by
      // the incoming REST data. This prevents a race condition where real-time
      // VOICE_STATE_UPDATE events arrive between the SUBSCRIBE and the REST
      // response — without this merge, setMany would overwrite those updates.
      for (const [channelId, existingParticipants] of Object.entries(prev.voiceStates)) {
        if (channelId in merged) {
          // Channel exists in both — merge any existing participants that the
          // REST response missed (e.g. they joined after the REST query ran)
          const incomingUserIds = new Set(merged[channelId]!.map((p) => p.userId));
          const missing = existingParticipants.filter((p) => !incomingUserIds.has(p.userId));
          if (missing.length > 0) {
            merged[channelId] = [...merged[channelId]!, ...missing];
          }
        } else {
          // Channel not in REST response but has existing participants —
          // keep them (could be from a real-time event or a different hub)
          merged[channelId] = existingParticipants;
        }
      }

      // Preserve the current user's voice entry for their connected channel
      // to avoid a visual "drop" when REST hydration races with a live join.
      const { connectedChannelId } = prev;
      if (connectedChannelId) {
        const currentUserId = useAuthStore.getState().userId;
        const existingParticipants = prev.voiceStates[connectedChannelId] ?? [];
        const currentUserEntry = currentUserId
          ? existingParticipants.find((p) => p.userId === currentUserId)
          : null;
        if (currentUserEntry) {
          const incoming = merged[connectedChannelId] ?? [];
          if (!incoming.some((p) => p.userId === currentUserId)) {
            merged[connectedChannelId] = [...incoming, currentUserEntry];
          }
        }
      }

      return { voiceStates: merged };
    }),

  setSpeakingUserIds: (ids) => set({ speakingUserIds: ids }),

  setScreenSharingUserIds: (ids) => set({ screenSharingUserIds: ids }),

  setConnectedChannelId: (id) => set({ connectedChannelId: id }),
  setActiveScreenShareId: (id) => set({ activeScreenShareId: id }),
  setHoveredScreenShare: (userId, anchor) =>
    set({
      hoveredScreenShareUserId: userId,
      hoveredScreenShareAnchor: anchor ?? null,
    }),
  setLocalMicMuted: (muted) => set({ localMicMuted: muted }),
  setToggleMicFn: (fn) => set({ toggleMicFn: fn }),

  reset: () => set({
    voiceStates: {},
    speakingUserIds: [],
    screenSharingUserIds: [],
    connectedChannelId: null,
    activeScreenShareId: null,
    hoveredScreenShareUserId: null,
    hoveredScreenShareAnchor: null,
    localMicMuted: false,
    toggleMicFn: null,
  }),
}));
