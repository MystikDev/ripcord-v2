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
/** Voice quality tier presets that affect the SFU codec bitrate. */
export type VoiceQualityTier = 'low' | 'medium' | 'high' | 'ultra';

/** A hub (server) the user has joined. */
export interface Hub {
  id: string;
  name: string;
  iconUrl?: string;
  bannerUrl?: string;
  ownerId: string;
  voiceQualityTier?: VoiceQualityTier;
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
  /** Hub ID the user was on before entering DM view (for "back" navigation). */
  previousHubId: string | null;

  /** Whether the full-screen solar system view is active (true = immersive, false = 3-column chat). */
  systemViewActive: boolean;

  /** Mobile-only: whether the channel sidebar drawer is open (sliding over the chat).
   *  No effect on desktop (the sidebar is always visible there). */
  mobileDrawerOpen: boolean;

  /** Cached channel lists keyed by hubId, accumulated as hubs are visited. */
  hubChannelCache: Record<string, Channel[]>;
  /** Cached member user IDs per hub, accumulated as hubs are visited. */
  hubMemberIds: Record<string, string[]>;

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

  /** Set active channel without leaving orbital view (for Comms Center). */
  setActiveChannelOrbital: (id: string) => void;

  /** Return to cosmos view (deselect hub without entering DM view). */
  clearActiveHub: () => void;

  /** Set the solar system immersive view active state. */
  setSystemViewActive: (active: boolean) => void;

  /** Open or close the mobile channel sidebar drawer. */
  setMobileDrawerOpen: (open: boolean) => void;

  /** Cache member user IDs for a hub (for cosmos view online counts). */
  setHubMemberIds: (hubId: string, userIds: string[]) => void;

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
  previousHubId: null,
  systemViewActive: true,
  mobileDrawerOpen: false,
  hubChannelCache: {},
  hubMemberIds: {},

  setHubs: (hubs) => set({ hubs }),

  setActiveHub: (id) => {
    // No-op when clicking the already-active hub to avoid wiping channels
    if (get().activeHubId === id) {
      // Still allow returning to system view if already on this hub
      set({ systemViewActive: true });
      return;
    }
    set({
      activeHubId: id,
      activeChannelId: null,
      channels: [],
      isDmView: false,
      activeDmChannelId: null,
      systemViewActive: true,
    });
  },

  setChannels: (channels) => {
    const hubId = get().activeHubId;
    set((state) => ({
      channels,
      hubChannelCache: hubId
        ? { ...state.hubChannelCache, [hubId]: channels }
        : state.hubChannelCache,
    }));
  },

  setActiveChannel: (id) => set({ activeChannelId: id, systemViewActive: false, mobileDrawerOpen: false }),

  setPendingVoiceJoin: (channelId) => set({ pendingVoiceJoin: channelId }),

  setDmChannels: (dms) => set({ dmChannels: dms }),

  setActiveDmChannel: (channelId) =>
    set({
      activeDmChannelId: channelId,
      activeChannelId: channelId,
      isDmView: true,
      activeHubId: null,
      channels: [],
      mobileDrawerOpen: false,
    }),

  enterDmView: () => {
    if (get().isDmView) return;
    set({
      isDmView: true,
      previousHubId: get().activeHubId,
      activeHubId: null,
      activeChannelId: null,
      activeDmChannelId: null,
      channels: [],
      systemViewActive: false,
    });
  },

  setActiveChannelOrbital: (id) => set({ activeChannelId: id }),

  clearActiveHub: () => set({
    activeHubId: null,
    activeChannelId: null,
    channels: [],
    systemViewActive: true,
  }),

  setSystemViewActive: (active) => set({ systemViewActive: active }),

  setMobileDrawerOpen: (open) => set({ mobileDrawerOpen: open }),

  setHubMemberIds: (hubId, userIds) =>
    set((state) => ({
      hubMemberIds: { ...state.hubMemberIds, [hubId]: userIds },
    })),

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
      previousHubId: null,
      systemViewActive: true,
      hubChannelCache: {},
      hubMemberIds: {},
    }),
}));
