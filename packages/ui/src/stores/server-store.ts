/**
 * @module server-store
 * Zustand store for hub and channel navigation state. Tracks the list of joined
 * hubs, their channels, and the currently active hub/channel selection.
 */

import { create } from 'zustand';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A hub (server) the user has joined. */
export interface Hub {
  id: string;
  name: string;
  iconUrl?: string;
  ownerId: string;
}

/** A text or voice channel within a hub. */
export interface Channel {
  id: string;
  hubId: string;
  name: string;
  type: 'text' | 'voice';
  position: number;
}

/** State and actions for hub/channel navigation. */
export interface HubState {
  /** All hubs the user has joined. */
  hubs: Hub[];
  /** ID of the currently selected hub. */
  activeHubId: string | null;
  /** Channels belonging to the active hub. */
  channels: Channel[];
  /** ID of the currently selected channel. */
  activeChannelId: string | null;

  /** One-shot signal: channel ID to auto-join voice (consumed + cleared by VoicePanel). */
  pendingVoiceJoin: string | null;

  /** Replace the hub list. */
  setHubs: (hubs: Hub[]) => void;
  /** Switch the active hub, clearing channels and selection. */
  setActiveHub: (id: string) => void;
  /** Replace the channel list for the active hub. */
  setChannels: (channels: Channel[]) => void;
  /** Switch the active channel. */
  setActiveChannel: (id: string) => void;
  /** Set or clear the pending voice-join channel. */
  setPendingVoiceJoin: (channelId: string | null) => void;
  /** Reset all hub/channel state. */
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useHubStore = create<HubState>()((set, get) => ({
  hubs: [],
  activeHubId: null,
  channels: [],
  activeChannelId: null,
  pendingVoiceJoin: null,

  setHubs: (hubs) => set({ hubs }),

  setActiveHub: (id) => {
    // No-op when clicking the already-active hub to avoid wiping channels
    if (get().activeHubId === id) return;
    set({ activeHubId: id, activeChannelId: null, channels: [] });
  },

  setChannels: (channels) => set({ channels }),

  setActiveChannel: (id) => set({ activeChannelId: id }),

  setPendingVoiceJoin: (channelId) => set({ pendingVoiceJoin: channelId }),

  reset: () =>
    set({
      hubs: [],
      activeHubId: null,
      channels: [],
      activeChannelId: null,
      pendingVoiceJoin: null,
    }),
}));
