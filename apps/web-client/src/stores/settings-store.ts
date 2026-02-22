import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DEFAULT_PTT_KEY = ' ';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

  setPttKey: (key: string) => void;
  resetPttKey: () => void;
  toggleMemberList: () => void;
  setNoiseSuppressionEnabled: (enabled: boolean) => void;
  setNoiseSuppressionStrength: (strength: number) => void;
  setSelectedMicDeviceId: (id: string | null) => void;
  setSelectedSpeakerDeviceId: (id: string | null) => void;
  setVoiceNotificationSounds: (enabled: boolean) => void;
  setUserVolume: (userId: string, volume: number) => void;
  resetUserVolume: (userId: string) => void;
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
      }),
    },
  ),
);
