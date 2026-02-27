'use client';

/**
 * @module use-apply-user-volumes
 * Bridges per-user volume settings from the settings store to LiveKit audio
 * tracks using Web Audio GainNodes. Also handles self-deafen (gain → 0).
 *
 * ## Why GainNodes instead of el.volume?
 *
 * `HTMLMediaElement.volume` is clamped to 0–1 by the spec, so it can't boost
 * beyond 100 %. Once `createMediaElementSource(el)` reroutes audio through
 * Web Audio, `el.volume` becomes an *input* gain to the source node — mixing
 * it with a separate GainNode causes confusing volume math. Instead, we
 * always drive volume through a single GainNode and leave `el.volume` at 1.
 *
 * ## Why no cache?
 *
 * LiveKit's `<RoomAudioRenderer>` renders internal `<AudioTrack>` components
 * that call `track.setVolume(1)` on mount/re-render, overriding external
 * volume changes. A stale cache (`appliedRef`) would skip reapplication,
 * leaving volume stuck at 100 %. Instead, we simply re-set `gain.value`
 * every render — setting a number on an AudioParam is O(1) and free.
 */

import { useEffect, useRef } from 'react';
import { useParticipants } from '@livekit/components-react';
import { Track, RemoteAudioTrack } from 'livekit-client';
import { useSettingsStore } from '../stores/settings-store';

// ---------------------------------------------------------------------------
// GainNode management
// ---------------------------------------------------------------------------

interface GainEntry {
  gainNode: GainNode;
  sourceNode: MediaElementAudioSourceNode;
  context: AudioContext;
  /** The HTMLMediaElement this chain is attached to. */
  element: HTMLMediaElement;
}

/** Map of participant identity → active GainNode chain. */
const gainNodes = new Map<string, GainEntry>();

/**
 * Ensure a GainNode chain exists for a given audio element and return it.
 * If one already exists AND is connected to the same element, reuse it.
 * If the element changed (track re-attached), the old chain must be removed
 * first via `removeGainNode`.
 */
function ensureGainNode(identity: string, audioElement: HTMLMediaElement): GainEntry | null {
  const existing = gainNodes.get(identity);
  if (existing && existing.element === audioElement) return existing;

  // Different element or no entry — clean up old one first
  if (existing) removeGainNode(identity);

  try {
    const context = new AudioContext();
    const sourceNode = context.createMediaElementSource(audioElement);
    const gainNode = context.createGain();
    sourceNode.connect(gainNode);
    gainNode.connect(context.destination);

    const entry: GainEntry = { gainNode, sourceNode, context, element: audioElement };
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

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Applies per-user volume overrides (including boost > 100 %) and handles
 * self-deafen for all remote participants. Must be called inside a
 * `<LiveKitRoom>` provider.
 */
export function useApplyUserVolumes(): void {
  const participants = useParticipants();
  const userVolumes = useSettingsStore((s) => s.userVolumes);
  const isDeafened = useSettingsStore((s) => s.isDeafened);

  // Track which audio elements each participant is currently using so we can
  // detect when LiveKit re-attaches a track to a different element.
  const elementMapRef = useRef<Map<string, HTMLMediaElement>>(new Map());

  // ---- Apply volumes every render (no cache — see module doc) ----
  useEffect(() => {
    for (const p of participants) {
      if (p.isLocal) continue;

      const audioPub = p
        .getTrackPublications()
        .find((t) => t.source === Track.Source.Microphone);

      const track = audioPub?.track;
      if (!track || !(track instanceof RemoteAudioTrack)) continue;

      // Effective volume: 0 when deafened, else per-user override (default 1.0)
      const targetVolume = isDeafened ? 0 : (userVolumes[p.identity] ?? 1.0);

      // Get the underlying <audio> element RoomAudioRenderer created
      const audioEl = track.attachedElements?.[0] as HTMLMediaElement | undefined;

      if (!audioEl) {
        // No element yet (track still negotiating). Use LiveKit's internal
        // setVolume so it stores the value and applies on next attach.
        track.setVolume(Math.min(targetVolume, 1.0));
        continue;
      }

      // ---- GainNode path ----
      // If we already have a GainNode for this participant, use it for ALL
      // volume values. Once createMediaElementSource has been called, we must
      // control volume exclusively through the GainNode.

      const existing = gainNodes.get(p.identity);

      if (existing) {
        // Check if the audio element changed (track re-attached to new el)
        if (existing.element !== audioEl) {
          removeGainNode(p.identity);
          elementMapRef.current.set(p.identity, audioEl);
          // Fall through to re-evaluate below
        } else {
          existing.gainNode.gain.value = targetVolume;
          continue;
        }
      }

      // ---- No GainNode yet ----
      // For volumes in the normal range (0–1), use el.volume directly.
      // For boost (> 1), create a GainNode.
      if (targetVolume > 1.0) {
        // Boost: need GainNode
        // Set el.volume to 1.0 first — it becomes the input level to the
        // GainNode after createMediaElementSource reroutes audio.
        track.setVolume(1.0);

        const entry = ensureGainNode(p.identity, audioEl);
        if (entry) {
          entry.gainNode.gain.value = targetVolume;
          elementMapRef.current.set(p.identity, audioEl);
        }
        // If ensureGainNode failed, retry next render (no cache prevents it)
      } else {
        // Normal range — el.volume is sufficient
        track.setVolume(targetVolume);
      }
    }

    // Clean up GainNodes for participants who have left the call
    const activeIdentities = new Set(
      participants.filter((p) => !p.isLocal).map((p) => p.identity),
    );
    for (const identity of gainNodes.keys()) {
      if (!activeIdentities.has(identity)) {
        removeGainNode(identity);
        elementMapRef.current.delete(identity);
      }
    }
  });

  // Clean up all GainNodes on unmount (voice disconnect)
  useEffect(() => {
    return () => {
      elementMapRef.current.clear();
      for (const identity of gainNodes.keys()) {
        removeGainNode(identity);
      }
    };
  }, []);
}
