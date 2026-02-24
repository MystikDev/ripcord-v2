'use client';

/**
 * @module use-apply-user-volumes
 * Bridges per-user volume settings from the settings store to LiveKit audio
 * tracks, including volume boost beyond 100 % via Web Audio GainNodes.
 */

import { useEffect, useRef } from 'react';
import { useParticipants } from '@livekit/components-react';
import { Track, RemoteAudioTrack } from 'livekit-client';
import { useSettingsStore } from '../stores/settings-store';

interface GainEntry {
  gainNode: GainNode;
  sourceNode: MediaElementAudioSourceNode;
  context: AudioContext;
}

/** Map of participant identity → active GainNode chain (for boost > 1.0). */
const gainNodes = new Map<string, GainEntry>();

/**
 * Ensure a GainNode chain exists for a given audio element and return it.
 * If one already exists for this participant, reuse it.
 */
function ensureGainNode(identity: string, audioElement: HTMLMediaElement): GainEntry | null {
  const existing = gainNodes.get(identity);
  if (existing) return existing;

  try {
    const context = new AudioContext();
    const sourceNode = context.createMediaElementSource(audioElement);
    const gainNode = context.createGain();
    sourceNode.connect(gainNode);
    gainNode.connect(context.destination);

    const entry: GainEntry = { gainNode, sourceNode, context };
    gainNodes.set(identity, entry);
    return entry;
  } catch {
    return null;
  }
}

/** Remove and clean up a GainNode chain for a participant. */
function removeGainNode(identity: string): void {
  const entry = gainNodes.get(identity);
  if (!entry) return;

  try {
    entry.sourceNode.disconnect();
    entry.gainNode.disconnect();
    entry.context.close();
  } catch {
    // Ignore cleanup errors
  }
  gainNodes.delete(identity);
}

/**
 * Applies per-user volume overrides to every remote participant's audio track.
 *
 * Must be called inside a `<LiveKitRoom>` provider. For volumes in the 0 -- 1
 * range, the native `HTMLMediaElement.volume` is used. For boost values above 1
 * a Web Audio `GainNode` chain is inserted to amplify beyond the browser cap.
 */
export function useApplyUserVolumes(): void {
  const participants = useParticipants();
  const userVolumes = useSettingsStore((s) => s.userVolumes);
  const appliedRef = useRef<Record<string, number>>({});

  useEffect(() => {
    for (const p of participants) {
      if (p.isLocal) continue;

      const targetVolume = userVolumes[p.identity] ?? 1.0;

      // Skip if we already applied this exact volume to this participant
      if (appliedRef.current[p.identity] === targetVolume) continue;

      const audioPub = p
        .getTrackPublications()
        .find((t) => t.source === Track.Source.Microphone);

      const track = audioPub?.track;
      if (!track || !(track instanceof RemoteAudioTrack)) continue;

      if (targetVolume <= 1.0) {
        // Native range — use LiveKit's built-in setVolume (sets HTMLMediaElement.volume)
        // First remove any boost GainNode if we previously had one
        removeGainNode(p.identity);
        track.setVolume(targetVolume);
      } else {
        // Boost range (>1.0) — need Web Audio GainNode
        // Set the native element volume to 1.0 (max) and use gain for amplification
        track.setVolume(1.0);

        // Get the underlying <audio> element from the track's attachedElements
        const audioElements = track.attachedElements;
        const audioEl = audioElements?.[0];
        if (audioEl) {
          const entry = ensureGainNode(p.identity, audioEl);
          if (entry) {
            entry.gainNode.gain.value = targetVolume;
          }
        }
      }

      appliedRef.current[p.identity] = targetVolume;
    }
  });

  // Clean up all GainNodes on unmount (voice disconnect)
  useEffect(() => {
    return () => {
      appliedRef.current = {};
      for (const identity of gainNodes.keys()) {
        removeGainNode(identity);
      }
    };
  }, []);
}
