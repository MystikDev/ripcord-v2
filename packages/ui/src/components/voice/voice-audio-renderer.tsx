'use client';

/**
 * @module voice-audio-renderer
 * Custom audio renderer replacing LiveKit's <RoomAudioRenderer> for reliable
 * per-user volume control including boost >100%.
 *
 * ## Why not RoomAudioRenderer?
 *
 * LiveKit's <RoomAudioRenderer> renders internal <AudioTrack volume={1}>
 * components that call track.setVolume(1) on mount/re-render, resetting any
 * external volume changes in a race condition. Additionally, the standard
 * HTMLMediaElement.volume is spec-clamped to 0–1, making volume boost
 * impossible through that API.
 *
 * The previous approach used createMediaElementSource to intercept LiveKit's
 * <audio> elements, but that API is one-shot — once an element is captured by
 * an AudioContext, it cannot be recaptured by a new one even after close().
 * React remounts (strict mode, dependency changes) would permanently break
 * the audio chain.
 *
 * ## Architecture
 *
 * For each remote audio track (microphone, screen-share audio):
 *
 *   MediaStreamTrack → createMediaStreamSource → GainNode → destination
 *
 * Key advantages:
 *   - createMediaStreamSource can be called multiple times (no one-shot issue)
 *   - No HTMLMediaElement involved (no 0-1 volume clamping)
 *   - No conflict with LiveKit's internal volume management
 *   - GainNode.gain.value supports any non-negative value (0=mute, 4=400%)
 *   - Works across React remounts cleanly
 *
 * Must be rendered inside a <LiveKitRoom> provider.
 */

import { useEffect, useRef } from 'react';
import { useTracks } from '@livekit/components-react';
import { Track, RemoteAudioTrack } from 'livekit-client';
import { useSettingsStore } from '../../stores/settings-store';

// ---------------------------------------------------------------------------
// Audio chain management
// ---------------------------------------------------------------------------

interface AudioChain {
  context: AudioContext;
  source: MediaStreamAudioSourceNode;
  gain: GainNode;
  /** ID of the MediaStreamTrack this chain is connected to. */
  trackId: string;
}

function cleanupChain(chain: AudioChain): void {
  try {
    chain.source.disconnect();
    chain.gain.disconnect();
    void chain.context.close();
  } catch {
    // Ignore cleanup errors (context may already be closed)
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

  /** Map of composite key (identity:source) → active AudioChain. */
  const chainsRef = useRef(new Map<string, AudioChain>());

  // ---- Apply volumes and manage audio chains every render ----
  useEffect(() => {
    const activeKeys = new Set<string>();

    for (const trackRef of tracks) {
      const { participant, publication } = trackRef;
      if (participant.isLocal) continue;

      const track = publication?.track;
      if (!track || !(track instanceof RemoteAudioTrack)) continue;

      const mst = track.mediaStreamTrack;
      if (!mst || mst.readyState === 'ended') continue;

      const chainKey = `${participant.identity}:${trackRef.source}`;
      activeKeys.add(chainKey);

      const targetVolume = isDeafened ? 0 : (userVolumes[participant.identity] ?? 1.0);

      let chain = chainsRef.current.get(chainKey);

      // Recreate chain if the underlying MediaStreamTrack changed
      // (track renegotiated, participant reconnected, etc.)
      if (chain && chain.trackId !== mst.id) {
        cleanupChain(chain);
        chainsRef.current.delete(chainKey);
        chain = undefined;
      }

      if (!chain) {
        try {
          const context = new AudioContext();
          // Resume if suspended (browser autoplay policy — should be running
          // since user already clicked "Join Voice", but handle edge cases)
          if (context.state === 'suspended') void context.resume();

          const stream = new MediaStream([mst]);
          const source = context.createMediaStreamSource(stream);
          const gain = context.createGain();
          source.connect(gain);
          gain.connect(context.destination);

          chain = { context, source, gain, trackId: mst.id };
          chainsRef.current.set(chainKey, chain);
        } catch (err) {
          console.warn('[VoiceAudioRenderer] Failed to create audio chain for', chainKey, err);
          continue;
        }
      }

      // Apply volume — works for any value: 0, 0.5, 1, 2, 4, etc.
      chain.gain.gain.value = targetVolume;
    }

    // Remove chains for tracks that no longer exist (participant left, track unsubscribed)
    for (const [key, chain] of chainsRef.current) {
      if (!activeKeys.has(key)) {
        cleanupChain(chain);
        chainsRef.current.delete(key);
      }
    }
  });

  // Cleanup all chains on unmount (disconnect from voice)
  useEffect(() => {
    return () => {
      for (const chain of chainsRef.current.values()) {
        cleanupChain(chain);
      }
      chainsRef.current.clear();
    };
  }, []);

  return null;
}
