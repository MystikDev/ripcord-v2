/**
 * @module call-store
 * Zustand store for DM call state. Tracks incoming, outgoing, and active calls
 * with call metadata (room ID, channel, participants).
 */

import { create } from 'zustand';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CallStatus = 'idle' | 'ringing_outgoing' | 'ringing_incoming' | 'active';

export interface CallInfo {
  /** Deterministic LiveKit room name for the call. */
  roomId: string;
  /** The DM channel ID between the two users. */
  channelId: string;
  /** The other user's ID in the call. */
  remoteUserId: string;
  /** The other user's display handle. */
  remoteHandle?: string;
}

export interface CallState {
  /** Current call status. */
  status: CallStatus;
  /** Info about the current/pending call, null when idle. */
  callInfo: CallInfo | null;

  /** Start an outgoing call (ringing the other user). */
  startCall: (info: CallInfo) => void;
  /** Receive an incoming call from another user. */
  receiveCall: (info: CallInfo) => void;
  /** Transition to active call (after accept). */
  acceptCall: () => void;
  /** End or decline the current call. */
  endCall: () => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useCallStore = create<CallState>()((set) => ({
  status: 'idle',
  callInfo: null,

  startCall: (info) =>
    set({ status: 'ringing_outgoing', callInfo: info }),

  receiveCall: (info) =>
    set((state) => {
      // Don't override an active call with a new invite
      if (state.status === 'active') return state;
      return { status: 'ringing_incoming', callInfo: info };
    }),

  acceptCall: () =>
    set((state) => {
      if (!state.callInfo) return state;
      return { status: 'active' };
    }),

  endCall: () =>
    set({ status: 'idle', callInfo: null }),
}));
