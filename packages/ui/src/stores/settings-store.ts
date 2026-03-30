/**
 * @module settings-store
 * Zustand store for user-configurable settings such as push-to-talk key,
 * noise suppression, device selection, and per-user volume overrides.
 * Persisted to localStorage under the `ripcord-settings` key.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DEFAULT_PTT_KEY = ' ';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** State and actions for all user-configurable application settings. */
export interface SettingsState {
  /** PTT bind: keyboard key (KeyboardEvent.key) or mouse button ("Mouse{n}"). Default: ' ' (Space) */
  pttKey: string;

  /** Whether the right-side member list panel is visible. */
  memberListVisible: boolean;

  /** Whether the hub sidebar is pinned open. When false, auto-collapses. */
  hubSidebarPinned: boolean;
  /** Toggle the hub sidebar pin state. */
  toggleHubSidebarPin: () => void;

  /** Whether the noise-gate processor is active on the microphone. */
  noiseSuppressionEnabled: boolean;

  /** Noise-gate strength: 0 (gate always open) → 100 (aggressive gating). Default: 50 */
  noiseSuppressionStrength: number;

  /** Saved microphone deviceId (null = use browser/OS default). */
  selectedMicDeviceId: string | null;

  /** Saved speaker deviceId (null = use browser/OS default). */
  selectedSpeakerDeviceId: string | null;

  /** Whether to play chime sounds when users join/leave voice channels. Default: true */
  voiceNotificationSounds: boolean;

  /** Per-user voice volume overrides. Key = userId, value = float 0.0–2.0 (1.0 = 100%). */
  userVolumes: Record<string, number>;

  /** Whether the user has self-deafened (muted all incoming audio). */
  isDeafened: boolean;

  /** Whether the global audio equalizer is enabled. */
  eqEnabled: boolean;
  /** Bass EQ band gain in dB (-12 to +12). ~300 Hz lowshelf filter. */
  eqBass: number;
  /** Mid EQ band gain in dB (-12 to +12). ~1 kHz peaking filter. */
  eqMid: number;
  /** Treble EQ band gain in dB (-12 to +12). ~3 kHz highshelf filter. */
  eqTreble: number;

  /** Enable or disable the global audio EQ. */
  setEqEnabled: (enabled: boolean) => void;
  /** Set bass EQ gain (-12 to +12 dB). */
  setEqBass: (gain: number) => void;
  /** Set mid EQ gain (-12 to +12 dB). */
  setEqMid: (gain: number) => void;
  /** Set treble EQ gain (-12 to +12 dB). */
  setEqTreble: (gain: number) => void;
  /** Reset all EQ bands to 0 dB (flat). */
  resetEq: () => void;

  /** Update the push-to-talk key binding. */
  setPttKey: (key: string) => void;
  /** Reset the push-to-talk key to the default (Space). */
  resetPttKey: () => void;
  /** Toggle visibility of the member list panel. */
  toggleMemberList: () => void;
  /** Enable or disable the noise-gate processor. */
  setNoiseSuppressionEnabled: (enabled: boolean) => void;
  /** Set the noise-gate strength (0 -- 100). */
  setNoiseSuppressionStrength: (strength: number) => void;
  /** Set the preferred microphone device ID. */
  setSelectedMicDeviceId: (id: string | null) => void;
  /** Set the preferred speaker device ID. */
  setSelectedSpeakerDeviceId: (id: string | null) => void;
  /** Enable or disable voice join/leave notification sounds. */
  setVoiceNotificationSounds: (enabled: boolean) => void;
  /** Set a per-user volume override (0.0 -- 2.0). */
  setUserVolume: (userId: string, volume: number) => void;
  /** Remove a per-user volume override, returning to the default. */
  resetUserVolume: (userId: string) => void;
  /** Toggle self-deafen (mute all incoming audio). */
  toggleDeafen: () => void;

  /** Whether the user has permanently opted out of the What's New dialog. */
  hideWhatsNew: boolean;
  /** The last app version for which the user dismissed the What's New dialog. */
  lastSeenVersion: string | null;
  /** Permanently hide the What's New dialog for all future versions. */
  setHideWhatsNew: (hide: boolean) => void;
  /** Record that the user has seen the What's New dialog for a given version. */
  setLastSeenVersion: (version: string) => void;

  /** Whether the user has completed the onboarding quick tour. */
  tutorialCompleted: boolean;
  /** Set the tutorial completed state. */
  setTutorialCompleted: (completed: boolean) => void;

  /** Whether the standalone quick tour overlay should be shown (e.g. replay from settings). */
  showTour: boolean;
  /** Trigger the quick tour overlay to open (used by Replay Tour). */
  triggerTour: () => void;
  /** Dismiss the standalone quick tour overlay. */
  dismissTour: () => void;

  /** Base font size in pixels (12-20). Default: 14 */
  fontSize: number;
  /** Custom text color override (hex string) or null for default. */
  fontColor: string | null;
  /** Base icon/avatar size in pixels (24-64). Default: 32 */
  iconSize: number;
  /** Custom username color override (hex string) or null for default. */
  usernameColor: string | null;
  /** Custom chat message text color (hex string) or null for default. Independent of fontColor. */
  chatTextColor: string | null;
  /** Whether compact mode is enabled (no avatars, single-line layout). Default: false */
  compactMode: boolean;

  /** Layout mode: 'universe' (spatial cosmos/orbital views) or 'classic' (always 3-column). Default: 'universe' */
  layoutMode: 'universe' | 'classic';
  /** Set the layout mode. */
  setLayoutMode: (mode: 'universe' | 'classic') => void;

  /** Screen share resolution preset. Default: '1080p' */
  screenShareResolution: '720p' | '1080p' | '1440p' | 'source';
  /** Screen share frame rate. Default: 30 */
  screenShareFrameRate: 15 | 30 | 60;
  /** Audio source for screen sharing. 'system' = desktop audio, 'none' = no audio. Default: 'system' */
  screenShareAudioSource: 'none' | 'system';
  /** Screen share content hint for encoding optimisation. Default: 'detail' */
  screenShareContentHint: 'detail' | 'motion';
  /** Preferred quality when viewing someone else's screen share. Default: 'Source' */
  screenShareViewerQuality: 'Source' | '1080p' | '720p';
  /** Preferred FPS when viewing someone else's screen share. Default: 60 */
  screenShareViewerFps: 15 | 30 | 60;

  /** Set the base font size. */
  setFontSize: (size: number) => void;
  /** Set a custom font color or null to reset. */
  setFontColor: (color: string | null) => void;
  /** Set the base icon/avatar size. */
  setIconSize: (size: number) => void;
  /** Set a custom username color or null to reset. */
  setUsernameColor: (color: string | null) => void;
  /** Set a custom chat text color or null to reset. */
  setChatTextColor: (color: string | null) => void;
  /** Toggle compact mode on/off. */
  setCompactMode: (enabled: boolean) => void;

  /** Set the screen share resolution preset. */
  setScreenShareResolution: (v: '720p' | '1080p' | '1440p' | 'source') => void;
  /** Set the screen share frame rate. */
  setScreenShareFrameRate: (v: 15 | 30 | 60) => void;
  /** Set the screen share audio source. */
  setScreenShareAudioSource: (v: 'none' | 'system') => void;
  /** Set the screen share content hint. */
  setScreenShareContentHint: (v: 'detail' | 'motion') => void;
  /** Set the preferred viewer quality for incoming screen shares. */
  setScreenShareViewerQuality: (v: 'Source' | '1080p' | '720p') => void;
  /** Set the preferred viewer FPS for incoming screen shares. */
  setScreenShareViewerFps: (v: 15 | 30 | 60) => void;

  /** Channel sidebar width in pixels. Default: 240 (w-60). */
  channelSidebarWidth: number;
  /** Set the channel sidebar width (clamped 200–480). */
  setChannelSidebarWidth: (width: number) => void;

  /** Active tab in the Comms Center ('chat' or 'voice'). Default: 'chat' */
  commsCenterActiveTab: 'chat' | 'voice';
  /** Set the active Comms Center tab. */
  setCommsCenterActiveTab: (tab: 'chat' | 'voice') => void;

  /** Whether push-to-talk mode is enabled (persisted). Default: false */
  pttEnabled: boolean;
  /** Toggle push-to-talk on/off. */
  togglePtt: () => void;
  /** Directly set push-to-talk enabled state. */
  setPttEnabled: (enabled: boolean) => void;

  /** Sun brightness in the orbital view (0.0–1.0). Default: 1.0 */
  sunIntensity: number;
  /** Set the sun brightness (clamped 0.0–1.0). */
  setSunIntensity: (intensity: number) => void;

  /** Whether the Comms Center floating chat panel is open. */
  commsCenterOpen: boolean;
  /** Toggle the Comms Center open/closed. */
  toggleCommsCenter: () => void;
  /** Whether the Comms Center position is pinned (persists across toggle). */
  commsCenterPinned: boolean;
  /** Toggle the Comms Center pin state. */
  toggleCommsCenterPin: () => void;
  /** Saved Comms Center position, null = default. */
  commsCenterPosition: { x: number; y: number } | null;
  /** Set the Comms Center position. */
  setCommsCenterPosition: (pos: { x: number; y: number }) => void;
  /** Comms Center size in pixels. Default: 420×550. */
  commsCenterSize: { width: number; height: number };
  /** Set the Comms Center size. */
  setCommsCenterSize: (size: { width: number; height: number }) => void;

  /** Whether the full settings view is open. */
  settingsOpen: boolean;
  /** The active tab in the settings view. */
  settingsTab: string;
  /** Open the settings view, optionally jumping to a specific tab. */
  openSettings: (tab?: string) => void;
  /** Close the settings view. */
  closeSettings: () => void;

  /** Whether the full admin console view is open. */
  adminOpen: boolean;
  /** The active tab in the admin console view. */
  adminTab: string;
  /** Hub ID for the admin console (set when opened). */
  adminHubId: string | null;
  /** Hub name for the admin console (set when opened). */
  adminHubName: string | null;
  /** Open the admin console, optionally jumping to a specific tab. */
  openAdmin: (hubId: string, hubName: string, tab?: string) => void;
  /** Close the admin console. */
  closeAdmin: () => void;
  /** Switch the active admin tab. */
  setAdminTab: (tab: string) => void;

  /** Whether the floating Friends panel is open in the orbital view. */
  friendsPanelOpen: boolean;
  /** Toggle the Friends panel open/closed. */
  toggleFriendsPanel: () => void;
  /** Whether the Friends panel position is pinned (persists across toggle). */
  friendsPanelPinned: boolean;
  /** Toggle the Friends panel pin state. */
  toggleFriendsPanelPin: () => void;
  /** Saved Friends panel position, null = default. */
  friendsPanelPosition: { x: number; y: number } | null;
  /** Set the Friends panel position. */
  setFriendsPanelPosition: (pos: { x: number; y: number }) => void;
  /** Friends panel size in pixels. Default: 420×550. */
  friendsPanelSize: { width: number; height: number };
  /** Set the Friends panel size. */
  setFriendsPanelSize: (size: { width: number; height: number }) => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      pttKey: DEFAULT_PTT_KEY,
      memberListVisible: true,
      noiseSuppressionEnabled: false,
      noiseSuppressionStrength: 50,
      selectedMicDeviceId: null,
      selectedSpeakerDeviceId: null,
      voiceNotificationSounds: true,
      userVolumes: {},
      isDeafened: false,

      eqEnabled: false,
      eqBass: 0,
      eqMid: 0,
      eqTreble: 0,

      setEqEnabled: (enabled) => set({ eqEnabled: enabled }),
      setEqBass: (gain) => set({ eqBass: Math.max(-12, Math.min(12, gain)) }),
      setEqMid: (gain) => set({ eqMid: Math.max(-12, Math.min(12, gain)) }),
      setEqTreble: (gain) => set({ eqTreble: Math.max(-12, Math.min(12, gain)) }),
      resetEq: () => set({ eqBass: 0, eqMid: 0, eqTreble: 0 }),

      setPttKey: (key) => set({ pttKey: key }),

      resetPttKey: () => set({ pttKey: DEFAULT_PTT_KEY }),

      hubSidebarPinned: true,
      toggleHubSidebarPin: () => set((s) => ({ hubSidebarPinned: !s.hubSidebarPinned })),

      toggleMemberList: () =>
        set((s) => ({ memberListVisible: !s.memberListVisible })),

      setNoiseSuppressionEnabled: (enabled) => set({ noiseSuppressionEnabled: enabled }),

      setNoiseSuppressionStrength: (strength) => set({ noiseSuppressionStrength: strength }),

      setSelectedMicDeviceId: (id) => set({ selectedMicDeviceId: id }),

      setSelectedSpeakerDeviceId: (id) => set({ selectedSpeakerDeviceId: id }),

      setVoiceNotificationSounds: (enabled) => set({ voiceNotificationSounds: enabled }),

      setUserVolume: (userId, volume) =>
        set((s) => ({ userVolumes: { ...s.userVolumes, [userId]: volume } })),

      resetUserVolume: (userId) =>
        set((s) => {
          const { [userId]: _, ...rest } = s.userVolumes;
          return { userVolumes: rest };
        }),

      toggleDeafen: () => set((s) => ({ isDeafened: !s.isDeafened })),

      hideWhatsNew: false,
      lastSeenVersion: null,
      setHideWhatsNew: (hide) => set({ hideWhatsNew: hide }),
      setLastSeenVersion: (version) => set({ lastSeenVersion: version }),

      tutorialCompleted: false,
      setTutorialCompleted: (completed) => set({ tutorialCompleted: completed }),

      showTour: false,
      triggerTour: () => set({ showTour: true, settingsOpen: false }),
      dismissTour: () => set({ showTour: false, tutorialCompleted: true }),

      fontSize: 14,
      fontColor: null,
      iconSize: 32,
      usernameColor: null,
      chatTextColor: null,
      compactMode: false,

      layoutMode: 'universe' as const,
      setLayoutMode: (mode) => set({ layoutMode: mode }),

      screenShareResolution: '1080p',
      screenShareFrameRate: 30,
      screenShareAudioSource: 'system',
      screenShareContentHint: 'detail',
      screenShareViewerQuality: 'Source',
      screenShareViewerFps: 60,

      setFontSize: (size) => set({ fontSize: Math.max(12, Math.min(20, size)) }),
      setFontColor: (color) => set({ fontColor: color }),
      setIconSize: (size) => set({ iconSize: Math.max(24, Math.min(64, size)) }),
      setUsernameColor: (color) => set({ usernameColor: color }),
      setChatTextColor: (color) => set({ chatTextColor: color }),
      setCompactMode: (enabled) => set({ compactMode: enabled }),

      setScreenShareResolution: (v) => set({ screenShareResolution: v }),
      setScreenShareFrameRate: (v) => set({ screenShareFrameRate: v }),
      setScreenShareAudioSource: (v) => set({ screenShareAudioSource: v }),
      setScreenShareContentHint: (v) => set({ screenShareContentHint: v }),
      setScreenShareViewerQuality: (v) => set({ screenShareViewerQuality: v }),
      setScreenShareViewerFps: (v) => set({ screenShareViewerFps: v }),

      channelSidebarWidth: 240,
      setChannelSidebarWidth: (width) => set({ channelSidebarWidth: Math.max(200, Math.min(480, width)) }),

      commsCenterActiveTab: 'chat' as const,
      setCommsCenterActiveTab: (tab) => set({ commsCenterActiveTab: tab }),

      pttEnabled: false,
      togglePtt: () => set((s) => ({ pttEnabled: !s.pttEnabled })),
      setPttEnabled: (enabled) => set({ pttEnabled: enabled }),

      sunIntensity: 1.0,
      setSunIntensity: (intensity) => set({ sunIntensity: Math.max(0.0, Math.min(1.0, intensity)) }),

      commsCenterOpen: false,
      toggleCommsCenter: () => set((s) => ({ commsCenterOpen: !s.commsCenterOpen })),
      commsCenterPinned: false,
      toggleCommsCenterPin: () => set((s) => ({ commsCenterPinned: !s.commsCenterPinned })),
      commsCenterPosition: null,
      setCommsCenterPosition: (pos) => set({ commsCenterPosition: pos }),
      commsCenterSize: { width: 420, height: 550 },
      setCommsCenterSize: (size) => set({ commsCenterSize: size }),

      settingsOpen: false,
      settingsTab: 'account',
      openSettings: (tab) => set({ settingsOpen: true, settingsTab: tab ?? 'account' }),
      closeSettings: () => set({ settingsOpen: false }),

      adminOpen: false,
      adminTab: 'overview',
      adminHubId: null,
      adminHubName: null,
      openAdmin: (hubId, hubName, tab) => set({ adminOpen: true, adminHubId: hubId, adminHubName: hubName, adminTab: tab ?? 'overview', settingsOpen: false }),
      closeAdmin: () => set({ adminOpen: false }),
      setAdminTab: (tab) => set({ adminTab: tab }),

      friendsPanelOpen: false,
      toggleFriendsPanel: () => set((s) => ({ friendsPanelOpen: !s.friendsPanelOpen })),
      friendsPanelPinned: false,
      toggleFriendsPanelPin: () => set((s) => ({ friendsPanelPinned: !s.friendsPanelPinned })),
      friendsPanelPosition: null,
      setFriendsPanelPosition: (pos) => set({ friendsPanelPosition: pos }),
      friendsPanelSize: { width: 420, height: 550 },
      setFriendsPanelSize: (size) => set({ friendsPanelSize: size }),
    }),
    {
      name: 'ripcord-settings',
      partialize: (state) => ({
        pttKey: state.pttKey,
        memberListVisible: state.memberListVisible,
        hubSidebarPinned: state.hubSidebarPinned,
        noiseSuppressionEnabled: state.noiseSuppressionEnabled,
        noiseSuppressionStrength: state.noiseSuppressionStrength,
        selectedMicDeviceId: state.selectedMicDeviceId,
        selectedSpeakerDeviceId: state.selectedSpeakerDeviceId,
        voiceNotificationSounds: state.voiceNotificationSounds,
        userVolumes: state.userVolumes,
        isDeafened: state.isDeafened,
        eqEnabled: state.eqEnabled,
        eqBass: state.eqBass,
        eqMid: state.eqMid,
        eqTreble: state.eqTreble,
        hideWhatsNew: state.hideWhatsNew,
        lastSeenVersion: state.lastSeenVersion,
        tutorialCompleted: state.tutorialCompleted,
        fontSize: state.fontSize,
        fontColor: state.fontColor,
        iconSize: state.iconSize,
        usernameColor: state.usernameColor,
        chatTextColor: state.chatTextColor,
        compactMode: state.compactMode,
        layoutMode: state.layoutMode,
        screenShareResolution: state.screenShareResolution,
        screenShareFrameRate: state.screenShareFrameRate,
        screenShareAudioSource: state.screenShareAudioSource,
        screenShareContentHint: state.screenShareContentHint,
        screenShareViewerQuality: state.screenShareViewerQuality,
        screenShareViewerFps: state.screenShareViewerFps,
        channelSidebarWidth: state.channelSidebarWidth,
        commsCenterActiveTab: state.commsCenterActiveTab,
        pttEnabled: state.pttEnabled,
        commsCenterPinned: state.commsCenterPinned,
        commsCenterPosition: state.commsCenterPosition,
        commsCenterSize: state.commsCenterSize,
        sunIntensity: state.sunIntensity,
        friendsPanelPinned: state.friendsPanelPinned,
        friendsPanelPosition: state.friendsPanelPosition,
        friendsPanelSize: state.friendsPanelSize,
      }),
    },
  ),
);
