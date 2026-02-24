'use client';

/**
 * @module use-restore-speaker
 * Restores the user's saved audio-output (speaker) device when entering a voice channel.
 */

import { useEffect } from 'react';
import { useRoomContext } from '@livekit/components-react';
import { useSettingsStore } from '../stores/settings-store';

/**
 * Applies the persisted speaker device selection to the active LiveKit room.
 *
 * Must be called inside a `<LiveKitRoom>` context. On mount and whenever the
 * saved speaker ID changes, switches the room's audio output device. Falls back
 * silently to the browser default if the device is no longer available.
 */
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
