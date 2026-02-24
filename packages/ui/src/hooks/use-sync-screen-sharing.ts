'use client';

/**
 * @module use-sync-screen-sharing
 * Bridges LiveKit screen-share track state into the Zustand voice store so that
 * components outside the LiveKitRoom context can display screen-sharing indicators.
 */

import { useEffect, useRef } from 'react';
import { useTracks } from '@livekit/components-react';
import { Track } from 'livekit-client';
import { useVoiceStateStore } from '../stores/voice-state-store';

/** Stable empty array to avoid unnecessary store writes. */
const EMPTY: string[] = [];

/**
 * Syncs the set of screen-sharing participant IDs from LiveKit into the
 * voice-state store. Only writes when the set actually changes to avoid
 * unnecessary re-renders.
 *
 * Must be called inside a `<LiveKitRoom>` provider.
 */
export function useSyncScreenSharing(): void {
  const tracks = useTracks([Track.Source.ScreenShare], { onlySubscribed: false });
  const setScreenSharingUserIds = useVoiceStateStore((s) => s.setScreenSharingUserIds);
  const prevRef = useRef<string[]>(EMPTY);

  useEffect(() => {
    const sharing = [
      ...new Set(tracks.map((t) => t.participant.identity).filter(Boolean)),
    ];

    const prev = prevRef.current;
    const changed =
      sharing.length !== prev.length ||
      sharing.some((id, i) => id !== prev[i]);

    if (changed) {
      prevRef.current = sharing.length > 0 ? sharing : EMPTY;
      setScreenSharingUserIds(prevRef.current);
    }
  }, [tracks, setScreenSharingUserIds]);

  // Clear screen-sharing state on unmount (voice disconnect)
  useEffect(() => {
    return () => {
      useVoiceStateStore.getState().setScreenSharingUserIds(EMPTY);
    };
  }, []);
}
