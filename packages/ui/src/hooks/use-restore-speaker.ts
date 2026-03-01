'use client';

/**
 * @module use-restore-speaker
 * Restores the user's saved audio-output (speaker) device when entering a voice channel.
 */

import { useEffect } from 'react';
import { useRoomContext } from '@livekit/components-react';
import { useSettingsStore } from '../stores/settings-store';
import { setAudioOutputDevice } from '../components/voice/voice-audio-renderer';

/**
 * Applies the persisted speaker device selection to the active LiveKit room
 * and the custom Web Audio graph.
 *
 * Must be called inside a `<LiveKitRoom>` context. On mount and whenever the
 * saved speaker ID changes, switches both LiveKit's audio output and the
 * shared AudioContext's sink. Falls back silently to the browser default if
 * the device is no longer available.
 */
export function useRestoreSpeaker(): void {
  const room = useRoomContext();
  const speakerId = useSettingsStore((s) => s.selectedSpeakerDeviceId);

  useEffect(() => {
    if (!speakerId) return;

    // Route LiveKit-managed audio (if any) to the selected device
    room.switchActiveDevice('audiooutput', speakerId).catch(() => {
      // Device no longer available — fall back to browser default (no-op)
    });

    // Route our custom Web Audio graph output to the selected device
    setAudioOutputDevice(speakerId);
  }, [room, speakerId]);
}
