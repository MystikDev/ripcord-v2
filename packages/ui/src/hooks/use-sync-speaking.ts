'use client';

/**
 * @module use-sync-speaking
 * Bridges LiveKit's real-time `isSpeaking` state into the Zustand voice store
 * with a short hold timer to prevent flickering between words.
 */

import { useEffect, useRef } from 'react';
import { useParticipants } from '@livekit/components-react';
import { useVoiceStateStore } from '../stores/voice-state-store';

/** Stable empty array to avoid unnecessary store writes. */
const EMPTY: string[] = [];

/** How long to keep the indicator lit after speaking stops (ms). */
const HOLD_MS = 100;

/**
 * Syncs speaking participant IDs from LiveKit into the voice-state store.
 *
 * A per-participant hold timer keeps the speaking indicator visible for a short
 * period after speech ends, preventing rapid on/off flicker. Only writes to the
 * store when the set of speaking IDs actually changes.
 *
 * Must be called inside a `<LiveKitRoom>` provider.
 */
export function useSyncSpeaking(): void {
  const participants = useParticipants();
  const setSpeakingUserIds = useVoiceStateStore((s) => s.setSpeakingUserIds);
  const prevRef = useRef<string[]>(EMPTY);
  const holdTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const heldIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    const nowSpeaking = new Set(
      participants.filter((p) => p.isSpeaking).map((p) => p.identity),
    );

    // For each participant currently speaking, clear any pending release timer
    for (const id of nowSpeaking) {
      const timer = holdTimers.current.get(id);
      if (timer) {
        clearTimeout(timer);
        holdTimers.current.delete(id);
      }
      heldIds.current.add(id);
    }

    // For each held ID that stopped speaking, start a release timer
    for (const id of heldIds.current) {
      if (!nowSpeaking.has(id) && !holdTimers.current.has(id)) {
        const timer = setTimeout(() => {
          holdTimers.current.delete(id);
          heldIds.current.delete(id);
          // Recompute and push to store
          const updated = [...heldIds.current];
          const prev = prevRef.current;
          const changed = updated.length !== prev.length || updated.some((v, i) => v !== prev[i]);
          if (changed) {
            prevRef.current = updated.length > 0 ? updated : EMPTY;
            setSpeakingUserIds(prevRef.current);
          }
        }, HOLD_MS);
        holdTimers.current.set(id, timer);
      }
    }

    // Compute the visible speaking set (includes held IDs)
    const speaking = [...heldIds.current];
    const prev = prevRef.current;
    const changed =
      speaking.length !== prev.length ||
      speaking.some((id, i) => id !== prev[i]);

    if (changed) {
      prevRef.current = speaking.length > 0 ? speaking : EMPTY;
      setSpeakingUserIds(prevRef.current);
    }
  });

  // Clear all timers and speaking state on unmount (voice disconnect)
  useEffect(() => {
    return () => {
      for (const timer of holdTimers.current.values()) {
        clearTimeout(timer);
      }
      holdTimers.current.clear();
      heldIds.current.clear();
      useVoiceStateStore.getState().setSpeakingUserIds(EMPTY);
    };
  }, []);
}
