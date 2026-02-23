'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRoomContext } from '@livekit/components-react';

// ---------------------------------------------------------------------------
// useVoiceLatency
//
// Polls WebRTC stats from the LiveKit Room's subscriber PeerConnection to
// extract the ICE candidate-pair `currentRoundTripTime`. Exposes a smoothed
// latency value in ms and a qualitative quality label.
//
// Must be called inside a <LiveKitRoom> provider.
// ---------------------------------------------------------------------------

export type LatencyQuality = 'excellent' | 'good' | 'poor' | 'unknown';

export interface VoiceLatency {
  /** Smoothed RTT in milliseconds, or null if not yet measured */
  latencyMs: number | null;
  /** Qualitative quality derived from latencyMs thresholds */
  quality: LatencyQuality;
}

/** How often to poll WebRTC stats (ms). */
const POLL_INTERVAL_MS = 5_000;

/** Thresholds for quality classification (ms). */
const EXCELLENT_THRESHOLD_MS = 80;
const GOOD_THRESHOLD_MS = 150;

function classifyLatency(ms: number | null): LatencyQuality {
  if (ms === null) return 'unknown';
  if (ms < EXCELLENT_THRESHOLD_MS) return 'excellent';
  if (ms < GOOD_THRESHOLD_MS) return 'good';
  return 'poor';
}

export function useVoiceLatency(): VoiceLatency {
  const room = useRoomContext();
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const prevRttRef = useRef<number | null>(null);

  const pollStats = useCallback(async () => {
    try {
      // Access the subscriber PCTransport via the engine's PCTransportManager.
      // In livekit-client v2.x: room.engine.pcManager.subscriber.getStats()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const engine = (room as any).engine;
      const subscriber = engine?.pcManager?.subscriber;
      if (!subscriber) return;

      const stats: RTCStatsReport = await subscriber.getStats();
      let rtt: number | null = null;

      stats.forEach((report) => {
        // The 'candidate-pair' entry with state 'succeeded' contains the
        // currentRoundTripTime measured by ICE (in seconds).
        if (
          report.type === 'candidate-pair' &&
          report.state === 'succeeded' &&
          typeof report.currentRoundTripTime === 'number'
        ) {
          rtt = Math.round(report.currentRoundTripTime * 1000);
        }
      });

      if (rtt !== null) {
        // Exponential moving average (alpha = 0.3) for smooth transitions.
        const prev = prevRttRef.current;
        const smoothed = prev === null ? rtt : Math.round(prev * 0.7 + rtt * 0.3);
        prevRttRef.current = smoothed;
        setLatencyMs(smoothed);
      }
    } catch {
      // Stats not available yet — ignore silently.
    }
  }, [room]);

  useEffect(() => {
    // Give WebRTC a moment to establish before the first poll.
    const initialTimer = setTimeout(pollStats, 1_000);
    const interval = setInterval(pollStats, POLL_INTERVAL_MS);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [pollStats]);

  // Reset smoothing state on unmount (voice disconnect).
  useEffect(() => {
    return () => {
      prevRttRef.current = null;
    };
  }, []);

  return {
    latencyMs,
    quality: classifyLatency(latencyMs),
  };
}
