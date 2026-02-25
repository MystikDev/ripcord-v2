'use client';

/**
 * @module use-sync-speaking
 * Bridges LiveKit's real-time active-speaker events directly into the Zustand
 * voice store. Uses RoomEvent.ActiveSpeakersChanged for instant updates,
 * bypassing the React render cycle entirely.
 */

import { useEffect } from 'react';
import { useRoomContext } from '@livekit/components-react';
import { RoomEvent, type Participant } from 'livekit-client';
import { useVoiceStateStore } from '../stores/voice-state-store';

/** Stable empty array to avoid unnecessary store writes. */
const EMPTY: string[] = [];

/**
 * Syncs speaking participant IDs from LiveKit into the voice-state store.
 *
 * Subscribes directly to RoomEvent.ActiveSpeakersChanged for minimal latency —
 * the event fires from the LiveKit SDK and updates the Zustand store in the
 * same microtask, without waiting for React re-renders.
 *
 * Must be called inside a `<LiveKitRoom>` provider.
 */
export function useSyncSpeaking(): void {
  const room = useRoomContext();

  useEffect(() => {
    const handler = (speakers: Participant[]) => {
      const ids = speakers.map((s) => s.identity).filter(Boolean);
      useVoiceStateStore.getState().setSpeakingUserIds(ids.length > 0 ? ids : EMPTY);
    };

    room.on(RoomEvent.ActiveSpeakersChanged, handler);

    return () => {
      room.off(RoomEvent.ActiveSpeakersChanged, handler);
      useVoiceStateStore.getState().setSpeakingUserIds(EMPTY);
    };
  }, [room]);
}
