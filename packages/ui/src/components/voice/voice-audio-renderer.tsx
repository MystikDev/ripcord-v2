'use client';

/**
 * @module voice-audio-renderer
 * Custom audio renderer for hub voice channels with per-user volume control
 * (including boost beyond 100 %), a pluggable effects chain, and a global
 * 3-band audio equalizer.
 *
 * All audio is routed through a shared Web Audio graph:
 *
 *   <audio> → MediaElementSource → GainNode (per-user volume)
 *           → EffectChain (compressor, reverb, etc.)
 *           → BiquadFilter (bass) → BiquadFilter (mid) → BiquadFilter (treble)
 *           → AudioContext.destination
 *
 * GainNode supports 0–2.0 range (200 % boost). EQ bypass = all filter gains
 * set to 0 dB (flat response). Must be rendered inside a <LiveKitRoom> provider.
 */

import { useEffect, useRef } from 'react';
import { useTracks } from '@livekit/components-react';
import { Track, RemoteAudioTrack } from 'livekit-client';
import { useSettingsStore } from '../../stores/settings-store';
import { useEffectsStore } from '../../stores/effects-store';
import { EffectChain } from '../../lib/audio-effects/effect-chain';

// ---------------------------------------------------------------------------
// Shared AudioContext + EQ chain + EffectChain (module-level singletons)
// ---------------------------------------------------------------------------

let sharedCtx: AudioContext | null = null;
let eqBassFilter: BiquadFilterNode | null = null;
let eqMidFilter: BiquadFilterNode | null = null;
let eqTrebleFilter: BiquadFilterNode | null = null;
let effectChain: EffectChain | null = null;

/** Lazily create the shared AudioContext, EQ filter chain, and effect chain. */
function ensureAudioContext(): AudioContext {
  if (!sharedCtx || sharedCtx.state === 'closed') {
    sharedCtx = new AudioContext();

    // Bass: lowshelf at 300 Hz
    eqBassFilter = sharedCtx.createBiquadFilter();
    eqBassFilter.type = 'lowshelf';
    eqBassFilter.frequency.value = 300;
    eqBassFilter.gain.value = 0;

    // Mid: peaking at 1 kHz, Q = 1.0
    eqMidFilter = sharedCtx.createBiquadFilter();
    eqMidFilter.type = 'peaking';
    eqMidFilter.frequency.value = 1000;
    eqMidFilter.Q.value = 1.0;
    eqMidFilter.gain.value = 0;

    // Treble: highshelf at 3 kHz
    eqTrebleFilter = sharedCtx.createBiquadFilter();
    eqTrebleFilter.type = 'highshelf';
    eqTrebleFilter.frequency.value = 3000;
    eqTrebleFilter.gain.value = 0;

    // Effect chain (sits between per-user gains and the EQ)
    effectChain = new EffectChain(sharedCtx);

    // Wire: effectChain.output → bass → mid → treble → destination
    effectChain.output.connect(eqBassFilter);
    eqBassFilter.connect(eqMidFilter);
    eqMidFilter.connect(eqTrebleFilter);
    eqTrebleFilter.connect(sharedCtx.destination);

    // Restore persisted chain config
    const savedConfig = useEffectsStore.getState().chainConfig;
    if (savedConfig.effects.length > 0) {
      effectChain.loadConfig(savedConfig);
    }

    // Sync chain changes back to the store for persistence
    effectChain.setOnChange(() => {
      if (effectChain) {
        useEffectsStore.getState().setChainConfig(effectChain.getConfig());
        useEffectsStore.getState().bumpRevision();
      }
    });
  }

  // Resume if suspended (browser autoplay policy)
  if (sharedCtx.state === 'suspended') {
    sharedCtx.resume().catch(() => {});
  }

  return sharedCtx;
}

/**
 * Get the effect chain input node. Per-user GainNodes connect here.
 * When the chain is empty, this passes through directly to the EQ.
 */
function getChainInput(): AudioNode | null {
  return effectChain?.input ?? null;
}

/** Expose the shared effect chain for external use (e.g. effects panel UI). */
export function getSharedEffectChain(): EffectChain | null {
  return effectChain;
}

/** Expose the shared AudioContext for external use. */
export function getSharedAudioContext(): AudioContext | null {
  return sharedCtx;
}

// ---------------------------------------------------------------------------
// Per-user audio entry
// ---------------------------------------------------------------------------

interface AudioEntry {
  audioEl: HTMLAudioElement;
  sourceNode: MediaElementAudioSourceNode;
  gainNode: GainNode;
  /** ID of the MediaStreamTrack this entry is playing. */
  trackId: string;
}

function cleanupEntry(entry: AudioEntry): void {
  try {
    entry.gainNode.disconnect();
    entry.sourceNode.disconnect();
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
  const eqEnabled = useSettingsStore((s) => s.eqEnabled);
  const eqBass = useSettingsStore((s) => s.eqBass);
  const eqMid = useSettingsStore((s) => s.eqMid);
  const eqTreble = useSettingsStore((s) => s.eqTreble);

  /** Map of composite key (identity:source) → active AudioEntry. */
  const entriesRef = useRef(new Map<string, AudioEntry>());

  // ---- Update EQ filter gains every render ----
  useEffect(() => {
    if (!eqBassFilter || !eqMidFilter || !eqTrebleFilter) return;

    if (eqEnabled) {
      eqBassFilter.gain.value = eqBass;
      eqMidFilter.gain.value = eqMid;
      eqTrebleFilter.gain.value = eqTreble;
    } else {
      // Bypass: 0 dB = flat response (unity gain)
      eqBassFilter.gain.value = 0;
      eqMidFilter.gain.value = 0;
      eqTrebleFilter.gain.value = 0;
    }
  });

  // ---- Manage audio elements, GainNodes, and apply volumes ----
  useEffect(() => {
    const ctx = ensureAudioContext();
    const chainInput = getChainInput();
    if (!chainInput) return;

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

      // Volume: 0–2.0 via GainNode (supports boost beyond 100 %)
      const rawVolume = isDeafened ? 0 : (userVolumes[participant.identity] ?? 1.0);
      const targetVolume = Math.max(0, Math.min(2.0, rawVolume));

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
          // Volume is controlled exclusively by the GainNode
          audioEl.volume = 1.0;
          // Belt-and-suspenders: also mute the element when deafened in case
          // createMediaElementSource doesn't fully capture audio in WebView2
          audioEl.muted = isDeafened;

          const sourceNode = ctx.createMediaElementSource(audioEl);
          const gainNode = ctx.createGain();
          gainNode.gain.value = targetVolume;

          // Wire: source → gainNode → effect chain input
          sourceNode.connect(gainNode);
          gainNode.connect(chainInput);

          audioEl.play().catch((err) => {
            console.warn('[VoiceAudioRenderer] audio.play() failed for', entryKey, err);
          });

          entry = { audioEl, sourceNode, gainNode, trackId: mst.id };
          entriesRef.current.set(entryKey, entry);
        } catch (err) {
          console.warn('[VoiceAudioRenderer] Failed to create audio entry for', entryKey, err);
          continue;
        }
      }

      // Apply volume (O(1), no reconnection needed)
      entry.gainNode.gain.value = targetVolume;
      entry.audioEl.muted = isDeafened;
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
      // Do NOT close sharedCtx or dispose effectChain — they're module
      // singletons that persist across voice reconnects.
    };
  }, []);

  return null;
}
