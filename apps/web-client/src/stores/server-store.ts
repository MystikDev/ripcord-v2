import { create } from 'zustand';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Hub {
  id: string;
  name: string;
  iconUrl?: string;
  ownerId: string;
}

export interface Channel {
  id: string;
  hubId: string;
  name: string;
  type: 'text' | 'voice';
  position: number;
}

export interface HubState {
  hubs: Hub[];
  activeHubId: string | null;
  channels: Channel[];
  activeChannelId: string | null;

  /** One-shot signal: channel ID to auto-join voice (consumed + cleared by VoicePanel). */
  pendingVoiceJoin: string | null;

  setHubs: (hubs: Hub[]) => void;
  setActiveHub: (id: string) => void;
  setChannels: (channels: Channel[]) => void;
  setActiveChannel: (id: string) => void;
  setPendingVoiceJoin: (channelId: string | null) => void;
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useHubStore = create<HubState>()((set) => ({
  hubs: [],
  activeHubId: null,
  channels: [],
  activeChannelId: null,
  pendingVoiceJoin: null,

  setHubs: (hubs) => set({ hubs }),

  setActiveHub: (id) => set({ activeHubId: id, activeChannelId: null, channels: [] }),

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
