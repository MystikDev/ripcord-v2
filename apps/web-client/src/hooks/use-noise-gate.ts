'use client';

import { useEffect, useRef } from 'react';
import { useLocalParticipant } from '@livekit/components-react';
import type { LocalAudioTrack } from 'livekit-client';
import { useSettingsStore } from '@/stores/settings-store';
import { NoiseGateProcessor } from '@/lib/noise-gate-processor';

// ---------------------------------------------------------------------------
// useNoiseGate — bridges the settings store with a LiveKit TrackProcessor
//
// MUST be called inside a <LiveKitRoom> context (needs useLocalParticipant).
//
// • When enabled + mic track exists → creates & attaches the processor.
// • When disabled → detaches the processor from the track.
// • When strength changes → updates the threshold without rebuilding.
// ---------------------------------------------------------------------------

export function useNoiseGate(): void {
  const { microphoneTrack } = useLocalParticipant();
  const enabled = useSettingsStore((s) => s.noiseSuppressionEnabled);
  const strength = useSettingsStore((s) => s.noiseSuppressionStrength);

  const processorRef = useRef<NoiseGateProcessor | null>(null);

  // ---- Effect 1: attach / detach processor when enabled or track changes ----
  // NOTE: `strength` is intentionally NOT in this dep array. Strength updates
  // go through Effect 2 only — they must never cause a detach/reattach cycle,
  // which would trigger LiveKit's restart() on a potentially destroyed instance.
  useEffect(() => {
    const audioTrack = microphoneTrack?.audioTrack as LocalAudioTrack | undefined;

    if (enabled && audioTrack) {
      // Create processor if not already alive
      if (!processorRef.current) {
        processorRef.current = new NoiseGateProcessor();
      }

      // Set current strength before attaching
      processorRef.current.setStrength(useSettingsStore.getState().noiseSuppressionStrength);

      audioTrack.setProcessor(processorRef.current).catch((err) => {
        console.error('[useNoiseGate] Failed to set processor:', err);
      });
    } else if (audioTrack && processorRef.current) {
      // Suppression disabled — remove the processor from the track
      (audioTrack as LocalAudioTrack).stopProcessor().catch((err) => {
        console.error('[useNoiseGate] Failed to stop processor:', err);
      });
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, microphoneTrack]);

  // ---- Effect 2: update strength in real-time (no reattach) ----
  useEffect(() => {
    processorRef.current?.setStrength(strength);
  }, [strength]);

  // ---- Effect 3: cleanup on unmount (disconnect from voice) ----
  useEffect(() => {
    return () => {
      if (processorRef.current) {
        processorRef.current.destroy().catch(() => {});
        processorRef.current = null;
      }
    };
  }, []);
}
