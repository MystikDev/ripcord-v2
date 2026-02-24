'use client';

/**
 * @module use-deafen-remote-audio
 * Mutes all remote participant audio tracks when the user is self-deafened.
 * On undeafen, restores per-user volume overrides from the settings store.
 * Must be called inside a `<LiveKitRoom>` provider.
 */

import { useEffect, useRef } from 'react';
import { useParticipants } from '@livekit/components-react';
import { Track, RemoteAudioTrack } from 'livekit-client';
import { useSettingsStore } from '../stores/settings-store';

/**
 * When deafened, sets all remote audio track volumes to 0.
 * When undeafened, restores volumes from per-user overrides (default 1.0).
 */
export function useDeafenRemoteAudio(): void {
  const participants = useParticipants();
  const isDeafened = useSettingsStore((s) => s.isDeafened);
  const userVolumes = useSettingsStore((s) => s.userVolumes);

  // Track whether we've already applied the current deafen state to avoid
  // redundant setVolume calls on every render.
  const appliedDeafRef = useRef<boolean | null>(null);

  useEffect(() => {
    // Skip if the deafen state hasn't changed since last application
    if (appliedDeafRef.current === isDeafened) return;

    for (const p of participants) {
      if (p.isLocal) continue;

      const audioPub = p
        .getTrackPublications()
        .find((t) => t.source === Track.Source.Microphone);

      const track = audioPub?.track;
      if (!track || !(track instanceof RemoteAudioTrack)) continue;

      if (isDeafened) {
        track.setVolume(0);
      } else {
        // Restore per-user volume (default 1.0)
        const restored = userVolumes[p.identity] ?? 1.0;
        // Only use native setVolume for values <= 1.0;
        // the useApplyUserVolumes hook handles boost (>1.0) via GainNodes
        track.setVolume(Math.min(restored, 1.0));
      }
    }

    appliedDeafRef.current = isDeafened;
  });

  // Reset on unmount so a rejoin starts clean
  useEffect(() => {
    return () => {
      appliedDeafRef.current = null;
    };
  }, []);
}
