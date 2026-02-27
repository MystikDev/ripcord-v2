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

      setPttKey: (key) => set({ pttKey: key }),

      resetPttKey: () => set({ pttKey: DEFAULT_PTT_KEY }),

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

      fontSize: 14,
      fontColor: null,
      iconSize: 32,
      usernameColor: null,
      chatTextColor: null,
      compactMode: false,
      setFontSize: (size) => set({ fontSize: Math.max(12, Math.min(20, size)) }),
      setFontColor: (color) => set({ fontColor: color }),
      setIconSize: (size) => set({ iconSize: Math.max(24, Math.min(64, size)) }),
      setUsernameColor: (color) => set({ usernameColor: color }),
      setChatTextColor: (color) => set({ chatTextColor: color }),
      setCompactMode: (enabled) => set({ compactMode: enabled }),
    }),
    {
      name: 'ripcord-settings',
      partialize: (state) => ({
        pttKey: state.pttKey,
        memberListVisible: state.memberListVisible,
        noiseSuppressionEnabled: state.noiseSuppressionEnabled,
        noiseSuppressionStrength: state.noiseSuppressionStrength,
        selectedMicDeviceId: state.selectedMicDeviceId,
        selectedSpeakerDeviceId: state.selectedSpeakerDeviceId,
        voiceNotificationSounds: state.voiceNotificationSounds,
        userVolumes: state.userVolumes,
        isDeafened: state.isDeafened,
        hideWhatsNew: state.hideWhatsNew,
        lastSeenVersion: state.lastSeenVersion,
        fontSize: state.fontSize,
        fontColor: state.fontColor,
        iconSize: state.iconSize,
        usernameColor: state.usernameColor,
        chatTextColor: state.chatTextColor,
        compactMode: state.compactMode,
      }),
    },
  ),
);
