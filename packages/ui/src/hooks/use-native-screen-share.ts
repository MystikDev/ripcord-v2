/**
 * Native Screen Share Hook
 *
 * Manages the native Ripcord Engine screen share pipeline (capture → H.264 → WebRTC)
 * with gateway signaling for SDP/ICE exchange.
 *
 * Falls back to LiveKit screen share when not running on the native engine.
 */

import { useCallback, useEffect, useRef } from 'react';
import { GatewayOpcode } from '@ripcord/types';
import type {
  ScreenShareSignalPayload,
  ScreenShareIcePayload,
  ScreenShareStatePayload,
} from '@ripcord/types';
import { gateway } from '../lib/gateway-client';
import {
  startNativeScreenShare,
  acceptNativeScreenShare,
  stopNativeScreenShare,
  isNativeScreenShareAvailable,
} from '../lib/platform';
import type { IceServerConfig } from '../lib/engine-ipc';
import { useAuthStore } from '../stores/auth-store';
import { useVoiceStateStore } from '../stores/voice-state-store';
import { getApiBaseUrl } from '../lib/constants';

/** Fetch ICE servers from the REST API. */
async function fetchIceServers(accessToken: string): Promise<IceServerConfig[]> {
  const res = await fetch(`${getApiBaseUrl()}/v1/voice/ice-servers`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!res.ok) throw new Error(`ICE server request failed: ${res.status}`);
  const body = (await res.json()) as { ok: boolean; data: { iceServers: IceServerConfig[] } };
  return body.data.iceServers;
}

/**
 * Hook that registers gateway listeners for native screen share signaling
 * and provides start/stop functions for the local user.
 *
 * Should be mounted once inside the voice session context.
 */
export function useNativeScreenShare(channelId: string | null) {
  const userId = useAuthStore((s) => s.userId);
  const accessToken = useAuthStore((s) => s.accessToken);
  const setLocalScreenSharing = useVoiceStateStore((s) => s.setLocalScreenSharing);
  const activeRef = useRef(false);

  // --- Sender: start native screen share ---
  const startSharing = useCallback(
    async (monitorIndex = 0) => {
      if (!channelId || !userId || !accessToken || !isNativeScreenShareAvailable()) return;

      try {
        const iceServers = await fetchIceServers(accessToken);
        const result = await startNativeScreenShare(iceServers, userId, channelId, monitorIndex);
        if (!result) return;

        activeRef.current = true;
        setLocalScreenSharing(true);

        // Broadcast SCREEN_SHARE_START to channel
        gateway.send(GatewayOpcode.SCREEN_SHARE_START, {
          channelId,
          userId,
        } satisfies ScreenShareStatePayload);

        // Note: SDP offer would be sent to specific receivers via SCREEN_SHARE_OFFER.
        // For the initial implementation, the offer is available in result.sdp
        // and will be sent when receivers request it.
      } catch (err) {
        console.error('Failed to start native screen share:', err);
        activeRef.current = false;
        setLocalScreenSharing(false);
      }
    },
    [channelId, userId, accessToken, setLocalScreenSharing],
  );

  // --- Sender: stop native screen share ---
  const stopSharing = useCallback(async () => {
    if (!activeRef.current) return;

    try {
      await stopNativeScreenShare();
    } catch (err) {
      console.error('Failed to stop native screen share:', err);
    }

    activeRef.current = false;
    setLocalScreenSharing(false);

    if (channelId && userId) {
      gateway.send(GatewayOpcode.SCREEN_SHARE_STOP, {
        channelId,
        userId,
      } satisfies ScreenShareStatePayload);
    }
  }, [channelId, userId, setLocalScreenSharing]);

  // --- Gateway event listeners ---
  useEffect(() => {
    if (!channelId || !userId || !accessToken) return;

    const unsubs: Array<() => void> = [];

    // Handle incoming SDP offers (we are the receiver)
    unsubs.push(
      gateway.on('SCREEN_SHARE_OFFER', async (data) => {
        const payload = data as unknown as ScreenShareSignalPayload;
        if (payload.channelId !== channelId || payload.toUserId !== userId) return;

        try {
          const iceServers = await fetchIceServers(accessToken);
          const result = await acceptNativeScreenShare(
            iceServers,
            payload.sdp,
            userId,
            payload.fromUserId,
          );
          if (!result) return;

          // Send SDP answer back to the sender
          gateway.send(GatewayOpcode.SCREEN_SHARE_ANSWER, {
            channelId,
            fromUserId: userId,
            toUserId: payload.fromUserId,
            sdp: result.sdp,
          } satisfies ScreenShareSignalPayload);
        } catch (err) {
          console.error('Failed to accept screen share offer:', err);
        }
      }),
    );

    // Handle incoming SDP answers (we are the sender)
    unsubs.push(
      gateway.on('SCREEN_SHARE_ANSWER', (data) => {
        const payload = data as unknown as ScreenShareSignalPayload;
        if (payload.channelId !== channelId || payload.toUserId !== userId) return;
        // The transport session processes the answer internally via str0m
        // Future: route answer SDP to engine via IPC
      }),
    );

    // Handle screen share start/stop broadcasts (update store)
    unsubs.push(
      gateway.on('SCREEN_SHARE_START', (data) => {
        const payload = data as unknown as ScreenShareStatePayload;
        if (payload.channelId !== channelId) return;

        const store = useVoiceStateStore.getState();
        const current = store.screenSharingUserIds;
        if (!current.includes(payload.userId)) {
          store.setScreenSharingUserIds([...current, payload.userId]);
        }
      }),
    );

    unsubs.push(
      gateway.on('SCREEN_SHARE_STOP', (data) => {
        const payload = data as unknown as ScreenShareStatePayload;
        if (payload.channelId !== channelId) return;

        const store = useVoiceStateStore.getState();
        store.setScreenSharingUserIds(
          store.screenSharingUserIds.filter((id) => id !== payload.userId),
        );
      }),
    );

    return () => {
      unsubs.forEach((fn) => fn());
    };
  }, [channelId, userId, accessToken]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (activeRef.current) {
        stopNativeScreenShare().catch(() => {});
        activeRef.current = false;
      }
    };
  }, []);

  return {
    startSharing,
    stopSharing,
    isAvailable: isNativeScreenShareAvailable(),
  };
}
