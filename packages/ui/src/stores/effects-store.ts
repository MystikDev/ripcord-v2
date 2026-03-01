/**
 * @module effects-store
 * Zustand store for the audio effects chain configuration and presets.
 * Persisted to localStorage under the `ripcord-effects` key.
 *
 * This store holds the serialised chain config (which effects are active,
 * their order, params, and bypass state) plus named presets. The live
 * EffectChain instance lives in voice-audio-renderer.tsx — this store
 * is the persistence + UI state layer.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { EffectChainConfig } from '../lib/audio-effects/effect-types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EffectsStore {
  /** Current active chain config (serialised). */
  chainConfig: EffectChainConfig;
  /** Named presets. */
  presets: Record<string, EffectChainConfig>;
  /** Revision counter — bumped on every mutation so React can re-render. */
  revision: number;

  // Actions
  setChainConfig: (config: EffectChainConfig) => void;
  savePreset: (name: string) => void;
  loadPreset: (name: string) => EffectChainConfig | null;
  deletePreset: (name: string) => void;
  bumpRevision: () => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useEffectsStore = create<EffectsStore>()(
  persist(
    (set, get) => ({
      chainConfig: { effects: [] },
      presets: {},
      revision: 0,

      setChainConfig: (config) => set({ chainConfig: config }),

      savePreset: (name) =>
        set((state) => ({
          presets: { ...state.presets, [name]: state.chainConfig },
        })),

      loadPreset: (name) => {
        const preset = get().presets[name];
        if (!preset) return null;
        set({ chainConfig: preset });
        return preset;
      },

      deletePreset: (name) =>
        set((state) => {
          const { [name]: _, ...rest } = state.presets;
          return { presets: rest };
        }),

      bumpRevision: () => set((state) => ({ revision: state.revision + 1 })),
    }),
    {
      name: 'ripcord-effects',
      partialize: (state) => ({
        chainConfig: state.chainConfig,
        presets: state.presets,
      }),
    },
  ),
);
