/**
 * Platform abstraction layer.
 *
 * Detects which runtime we're in (Ripcord Engine, Tauri, or plain web browser)
 * and provides a unified interface for native operations.
 *
 * Priority: Engine > Tauri > Web (fallback)
 */

import { isEngine, invoke as engineInvoke, onEvent as engineOnEvent } from './engine-ipc';
import type { IceServerConfig } from './engine-ipc';
import {
  setIceServers,
  createOffer,
  acceptOffer,
  stopTransport,
  startMediaSender,
  startMediaReceiver,
  stopMedia,
} from './engine-ipc';

// ---------------------------------------------------------------------------
// Platform detection
// ---------------------------------------------------------------------------

export type Platform = 'engine' | 'tauri' | 'web';

let detectedPlatform: Platform | null = null;

export function getPlatform(): Platform {
  if (detectedPlatform) return detectedPlatform;

  if (isEngine()) {
    detectedPlatform = 'engine';
  } else if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    detectedPlatform = 'tauri';
  } else {
    detectedPlatform = 'web';
  }

  return detectedPlatform;
}

// ---------------------------------------------------------------------------
// Shell — open external URLs
// ---------------------------------------------------------------------------

export async function shellOpen(url: string): Promise<void> {
  const platform = getPlatform();

  if (platform === 'engine') {
    await engineInvoke('shell.open', { url });
    return;
  }

  if (platform === 'tauri') {
    try {
      const { open } = await import('@tauri-apps/plugin-shell');
      await open(url);
      return;
    } catch { /* fall through */ }
  }

  // Web fallback
  window.open(url, '_blank', 'noopener');
}

// ---------------------------------------------------------------------------
// PTT — push-to-talk native hooks
// ---------------------------------------------------------------------------

export interface PttHookHandle {
  cleanup: () => void;
}

/**
 * Start a native push-to-talk hook for the given virtual key code.
 * Returns a cleanup handle, or null if not supported on this platform.
 */
export async function startPttHook(
  vkCode: number,
  onDown: () => void,
  onUp: () => void,
): Promise<PttHookHandle | null> {
  const platform = getPlatform();

  if (platform === 'engine') {
    const result = await engineInvoke<{ success: boolean }>('ptt.start', { keyCode: vkCode });
    if (!result?.success) return null;

    const unsubDown = engineOnEvent('ptt.down', onDown);
    const unsubUp = engineOnEvent('ptt.up', onUp);

    return {
      cleanup: () => {
        unsubDown();
        unsubUp();
        engineInvoke('ptt.stop').catch(() => {});
      },
    };
  }

  if (platform === 'tauri') {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const { listen } = await import('@tauri-apps/api/event');

      const success = (await invoke('start_ptt_hook', { keyCode: vkCode })) as boolean;
      if (!success) return null;

      const unlistenDown = await listen('ptt-hook-down', () => onDown());
      const unlistenUp = await listen('ptt-hook-up', () => onUp());

      return {
        cleanup: () => {
          unlistenDown();
          unlistenUp();
          invoke('stop_ptt_hook').catch(() => {});
        },
      };
    } catch {
      return null;
    }
  }

  // Web — no background PTT support
  return null;
}

/**
 * Poll a key's state via GetAsyncKeyState (engine) or check_key_pressed (Tauri).
 * Returns 1 if pressed, 0 if not. Returns null if not supported.
 */
export async function checkKeyPressed(vkCode: number): Promise<number | null> {
  const platform = getPlatform();

  if (platform === 'engine') {
    const result = await engineInvoke<{ pressed: number }>('ptt.checkKey', { keyCode: vkCode });
    return result?.pressed ?? null;
  }

  if (platform === 'tauri') {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return (await invoke('check_key_pressed', { keyCode: vkCode })) as number;
    } catch {
      return null;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// HTTP fetch — CORS-free on desktop
// ---------------------------------------------------------------------------

export async function nativeFetch(
  url: string,
  options?: { method?: string; headers?: Record<string, string>; timeout?: number },
): Promise<string> {
  const platform = getPlatform();

  // Engine doesn't have native HTTP yet — fall through to Tauri or browser
  if (platform === 'tauri') {
    try {
      const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');
      const res = await tauriFetch(url, {
        method: options?.method ?? 'GET',
        headers: options?.headers,
        connectTimeout: options?.timeout ?? 5000,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch {
      // Fall through to browser fetch
    }
  }

  // Browser fallback
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options?.timeout ?? 5000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: options?.headers,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------------------------------------------------------------------------
// App version
// ---------------------------------------------------------------------------

export async function getAppVersion(): Promise<string | null> {
  const platform = getPlatform();

  if (platform === 'engine') {
    try {
      const result = await engineInvoke<{ version: string }>('system.getVersion');
      return result?.version ?? null;
    } catch {
      return null;
    }
  }

  if (platform === 'tauri') {
    try {
      const { getVersion } = await import('@tauri-apps/api/app');
      return await getVersion();
    } catch {
      return null;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Native Screen Share
// ---------------------------------------------------------------------------

/**
 * Start a native screen share as the sender.
 * 1. Configures ICE servers on the engine
 * 2. Creates a WebRTC offer
 * 3. Starts the capture → encode → transport pipeline
 *
 * Returns the SDP offer to send to the receiver via signaling.
 */
export async function startNativeScreenShare(
  iceServers: IceServerConfig[],
  userId: string,
  targetUserId: string,
  monitorIndex = 0,
): Promise<{ sdp: string } | null> {
  if (getPlatform() !== 'engine') return null;

  await setIceServers(iceServers);
  const offer = await createOffer(userId, targetUserId);
  await startMediaSender(monitorIndex);

  return { sdp: offer.sdp };
}

/**
 * Accept a native screen share as the receiver.
 * 1. Configures ICE servers on the engine
 * 2. Accepts the offer SDP and returns an answer
 * 3. Initializes compositor + starts the decode pipeline
 *
 * Returns the SDP answer to send back to the sender.
 */
export async function acceptNativeScreenShare(
  iceServers: IceServerConfig[],
  offerSdp: string,
  userId: string,
  senderUserId: string,
  surfaceIndex = 0,
): Promise<{ sdp: string } | null> {
  if (getPlatform() !== 'engine') return null;

  await setIceServers(iceServers);

  // Initialize compositor if not already done
  await engineInvoke('compositor.init');
  await engineInvoke('compositor.addSurface', {
    name: `screen-share-${senderUserId}`,
    width: 1920,
    height: 1080,
  });

  const answer = await acceptOffer(offerSdp, userId, senderUserId);
  await startMediaReceiver(surfaceIndex);

  return { sdp: answer.sdp };
}

/** Stop an active native screen share (sender or receiver). */
export async function stopNativeScreenShare(): Promise<void> {
  if (getPlatform() !== 'engine') return;

  await stopMedia();
  await stopTransport();
}

/** Check if the native screen share pipeline is available. */
export function isNativeScreenShareAvailable(): boolean {
  return getPlatform() === 'engine';
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const platform = {
  getPlatform,
  shellOpen,
  startPttHook,
  checkKeyPressed,
  nativeFetch,
  getAppVersion,
  startNativeScreenShare,
  acceptNativeScreenShare,
  stopNativeScreenShare,
  isNativeScreenShareAvailable,
};
