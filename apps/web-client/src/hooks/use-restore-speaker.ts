'use client';

import { useEffect } from 'react';
import { useRoomContext } from '@livekit/components-react';
import { useSettingsStore } from '@/stores/settings-store';

// ---------------------------------------------------------------------------
// useRestoreSpeaker — restores the saved speaker (audio output) device
//
// MUST be called inside a <LiveKitRoom> context.
//
// On mount and whenever the saved speaker ID changes, calls
// room.switchActiveDevice('audiooutput', id). If the device no longer
// exists (unplugged), it silently falls back to the browser default.
// ---------------------------------------------------------------------------

export function useRestoreSpeaker(): void {
  const room = useRoomContext();
  const speakerId = useSettingsStore((s) => s.selectedSpeakerDeviceId);

  useEffect(() => {
    if (!speakerId) return;

    room.switchActiveDevice('audiooutput', speakerId).catch(() => {
      // Device no longer available — fall back to browser default (no-op)
    });
  }, [room, speakerId]);
}
