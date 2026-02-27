/**
 * @module server-store
 * Zustand store for hub and channel navigation state. Tracks the list of joined
 * hubs, their channels, and the currently active hub/channel selection.
 * Also manages DM (direct message) channel state.
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
  bannerUrl?: string;
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

/** A direct message channel between two users. */
export interface DmChannel {
  channelId: string;
  createdAt: string;
  participants: DmParticipant[];
}

export interface DmParticipant {
  userId: string;
  handle: string;
  avatarUrl: string | null;
}

/** State and actions for hub/channel navigation. */
export interface HubState {
  /** All hubs the user has joined. */
  hubs: Hub[];
  /** ID of the currently selected hub. Null when viewing DMs. */
  activeHubId: string | null;
  /** Channels belonging to the active hub. */
  channels: Channel[];
  /** ID of the currently selected channel (hub or DM). */
  activeChannelId: string | null;

  /** One-shot signal: channel ID to auto-join voice (consumed + cleared by VoicePanel). */
  pendingVoiceJoin: string | null;

  /** All DM channels for the current user. */
  dmChannels: DmChannel[];
  /** ID of the currently active DM channel. */
  activeDmChannelId: string | null;
  /** Whether the user is viewing the DM list (home screen). */
  isDmView: boolean;

  /** Replace the hub list. */
  setHubs: (hubs: Hub[]) => void;
  /** Switch the active hub, clearing channels and selection. Exits DM view. */
  setActiveHub: (id: string) => void;
  /** Replace the channel list for the active hub. */
  setChannels: (channels: Channel[]) => void;
  /** Switch the active channel. */
  setActiveChannel: (id: string) => void;
  /** Set or clear the pending voice-join channel. */
  setPendingVoiceJoin: (channelId: string | null) => void;

  /** Replace DM channel list. */
  setDmChannels: (dms: DmChannel[]) => void;
  /** Switch to DM view and select a DM channel. */
  setActiveDmChannel: (channelId: string) => void;
  /** Enter DM view (home screen), clearing hub selection. */
  enterDmView: () => void;

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
  dmChannels: [],
  activeDmChannelId: null,
  isDmView: false,

  setHubs: (hubs) => set({ hubs }),

  setActiveHub: (id) => {
    // No-op when clicking the already-active hub to avoid wiping channels
    if (get().activeHubId === id) return;
    set({
      activeHubId: id,
      activeChannelId: null,
      channels: [],
      isDmView: false,
      activeDmChannelId: null,
    });
  },

  setChannels: (channels) => set({ channels }),

  setActiveChannel: (id) => set({ activeChannelId: id }),

  setPendingVoiceJoin: (channelId) => set({ pendingVoiceJoin: channelId }),

  setDmChannels: (dms) => set({ dmChannels: dms }),

  setActiveDmChannel: (channelId) =>
    set({
      activeDmChannelId: channelId,
      activeChannelId: channelId,
      isDmView: true,
      activeHubId: null,
      channels: [],
    }),

  enterDmView: () => {
    if (get().isDmView) return;
    set({
      isDmView: true,
      activeHubId: null,
      activeChannelId: null,
      activeDmChannelId: null,
      channels: [],
    });
  },

  reset: () =>
    set({
      hubs: [],
      activeHubId: null,
      channels: [],
      activeChannelId: null,
      pendingVoiceJoin: null,
      dmChannels: [],
      activeDmChannelId: null,
      isDmView: false,
    }),
}));
