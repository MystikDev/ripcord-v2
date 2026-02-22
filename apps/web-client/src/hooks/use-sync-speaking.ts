'use client';

import { useEffect, useRef } from 'react';
import { useParticipants } from '@livekit/components-react';
import { useVoiceStateStore } from '@/stores/voice-state-store';

// ---------------------------------------------------------------------------
// useSyncSpeaking
//
// Bridges LiveKit's real-time `isSpeaking` state into the Zustand voice store
// so components outside the <LiveKitRoom> context (e.g. sidebar channel list)
// can show speaking indicators.
//
// Must be called inside a <LiveKitRoom> provider.
// ---------------------------------------------------------------------------

/** Stable empty array to avoid unnecessary store writes. */
const EMPTY: string[] = [];

export function useSyncSpeaking(): void {
  const participants = useParticipants();
  const setSpeakingUserIds = useVoiceStateStore((s) => s.setSpeakingUserIds);
  const prevRef = useRef<string[]>(EMPTY);

  useEffect(() => {
    // Compute which participants are currently speaking
    const speaking = participants
      .filter((p) => p.isSpeaking)
      .map((p) => p.identity);

    // Only update the store if the set actually changed (avoid re-renders)
    const prev = prevRef.current;
    const changed =
      speaking.length !== prev.length ||
      speaking.some((id, i) => id !== prev[i]);

    if (changed) {
      prevRef.current = speaking;
      setSpeakingUserIds(speaking.length > 0 ? speaking : EMPTY);
    }
  });

  // Clear speaking state on unmount (voice disconnect)
  useEffect(() => {
    return () => {
      useVoiceStateStore.getState().setSpeakingUserIds(EMPTY);
    };
  }, []);
}
