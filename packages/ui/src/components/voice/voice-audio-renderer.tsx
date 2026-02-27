'use client';

/**
 * @module voice-audio-renderer
 * Custom audio renderer for hub voice channels with per-user volume control.
 *
 * Uses plain <audio> elements (the same approach as LiveKit's RoomAudioRenderer
 * and Discord) for maximum compatibility with Tauri WebView2 and all browsers.
 * Volume is applied via HTMLAudioElement.volume (0–1 range).
 *
 * We don't use <RoomAudioRenderer> directly because its internal <AudioTrack>
 * components call track.setVolume(1) on every re-render, resetting any
 * external volume changes.
 *
 * Must be rendered inside a <LiveKitRoom> provider.
 */

import { useEffect, useRef } from 'react';
import { useTracks } from '@livekit/components-react';
import { Track, RemoteAudioTrack } from 'livekit-client';
import { useSettingsStore } from '../../stores/settings-store';

// ---------------------------------------------------------------------------
// Audio element management
// ---------------------------------------------------------------------------

interface AudioEntry {
  audioEl: HTMLAudioElement;
  /** ID of the MediaStreamTrack this entry is playing. */
  trackId: string;
}

function cleanupEntry(entry: AudioEntry): void {
  try {
    entry.audioEl.pause();
    entry.audioEl.srcObject = null;
  } catch {
    // Ignore cleanup errors
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function VoiceAudioRenderer() {
  const tracks = useTracks(
    [Track.Source.Microphone, Track.Source.ScreenShareAudio, Track.Source.Unknown],
    { onlySubscribed: true },
  );
  const userVolumes = useSettingsStore((s) => s.userVolumes);
  const isDeafened = useSettingsStore((s) => s.isDeafened);

  /** Map of composite key (identity:source) → active AudioEntry. */
  const entriesRef = useRef(new Map<string, AudioEntry>());

  // ---- Manage audio elements and apply volumes every render ----
  useEffect(() => {
    const activeKeys = new Set<string>();

    for (const trackRef of tracks) {
      const { participant, publication } = trackRef;
      if (participant.isLocal) continue;

      const track = publication?.track;
      if (!track || !(track instanceof RemoteAudioTrack)) continue;

      const mst = track.mediaStreamTrack;
      if (!mst || mst.readyState === 'ended') continue;

      const entryKey = `${participant.identity}:${trackRef.source}`;
      activeKeys.add(entryKey);

      // Volume: 0–1 range (HTMLAudioElement.volume is clamped to 0–1 by spec)
      const rawVolume = isDeafened ? 0 : (userVolumes[participant.identity] ?? 1.0);
      const targetVolume = Math.max(0, Math.min(1, rawVolume));

      let entry = entriesRef.current.get(entryKey);

      // Recreate entry if the underlying MediaStreamTrack changed
      // (track renegotiated, participant reconnected, etc.)
      if (entry && entry.trackId !== mst.id) {
        cleanupEntry(entry);
        entriesRef.current.delete(entryKey);
        entry = undefined;
      }

      if (!entry) {
        try {
          const audioEl = new Audio();
          audioEl.srcObject = new MediaStream([mst]);
          audioEl.play().catch((err) => {
            console.warn('[VoiceAudioRenderer] audio.play() failed for', entryKey, err);
          });

          entry = { audioEl, trackId: mst.id };
          entriesRef.current.set(entryKey, entry);
        } catch (err) {
          console.warn('[VoiceAudioRenderer] Failed to create audio element for', entryKey, err);
          continue;
        }
      }

      // Apply volume
      entry.audioEl.volume = targetVolume;
    }

    // Remove entries for tracks that no longer exist (participant left, track unsubscribed)
    for (const [key, entry] of entriesRef.current) {
      if (!activeKeys.has(key)) {
        cleanupEntry(entry);
        entriesRef.current.delete(key);
      }
    }
  });

  // Cleanup all entries on unmount (disconnect from voice)
  useEffect(() => {
    return () => {
      for (const entry of entriesRef.current.values()) {
        cleanupEntry(entry);
      }
      entriesRef.current.clear();
    };
  }, []);

  return null;
}
