'use client';

import { useEffect, useRef } from 'react';
import { useTracks } from '@livekit/components-react';
import { Track } from 'livekit-client';
import { useVoiceStateStore } from '../stores/voice-state-store';

// ---------------------------------------------------------------------------
// useSyncScreenSharing
//
// Bridges LiveKit's real-time screen-share tracks into the Zustand voice store
// so components outside the <LiveKitRoom> context (e.g. sidebar channel list)
// can show a streaming icon next to participants who are sharing their screen.
//
// Must be called inside a <LiveKitRoom> provider.
// ---------------------------------------------------------------------------

/** Stable empty array to avoid unnecessary store writes. */
const EMPTY: string[] = [];

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
