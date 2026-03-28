/**
 * Ripcord Engine IPC Client
 *
 * Communicates with the native Rust runtime via WebView2's postMessage bridge.
 * Uses JSON-RPC 2.0 protocol.
 *
 * Usage:
 *   const version = await engine.invoke('system.getVersion');
 */

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

let nextId = 1;
const pending = new Map<number, PendingRequest>();
const eventListeners = new Map<string, Set<(data: unknown) => void>>();

/**
 * Handle responses from the Rust runtime.
 * Called by the native side via ExecuteScript.
 */
function handleResponse(raw: string) {
  try {
    const msg = JSON.parse(raw);
    const req = pending.get(msg.id);
    if (!req) return;
    pending.delete(msg.id);

    if (msg.error) {
      req.reject(new Error(msg.error.message));
    } else {
      req.resolve(msg.result);
    }
  } catch {
    // Malformed response — ignore
  }
}

/**
 * Handle events pushed from the Rust runtime.
 */
function handleEvent(raw: string) {
  try {
    const msg = JSON.parse(raw);
    const listeners = eventListeners.get(msg.event);
    if (listeners) {
      for (const cb of listeners) {
        cb(msg.data);
      }
    }
  } catch {
    // Malformed event — ignore
  }
}

// Register global handlers that the native side calls
if (typeof window !== 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).__ripcord_ipc_recv = handleResponse;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).__ripcord_ipc_event = handleEvent;
}

/**
 * Check if we're running inside the Ripcord Engine (vs a regular browser).
 */
export function isEngine(): boolean {
  return (
    typeof window !== 'undefined' &&
    'chrome' in window &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    typeof (window as any).chrome === 'object' &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).chrome?.webview?.postMessage !== undefined
  );
}

/**
 * Invoke a native command via JSON-RPC.
 *
 * @param method - Namespaced method name (e.g. 'system.getVersion')
 * @param params - Parameters to pass (optional)
 * @returns Promise that resolves with the result
 */
export function invoke<T = unknown>(
  method: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!isEngine()) {
      reject(new Error('Not running inside Ripcord Engine'));
      return;
    }

    const id = nextId++;
    pending.set(id, {
      resolve: resolve as (value: unknown) => void,
      reject,
    });

    const message = JSON.stringify({ method, params, id });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).chrome.webview.postMessage(message);
  });
}

/**
 * Subscribe to events pushed from the native runtime.
 *
 * @param event - Event name (e.g. 'audio.levelUpdate')
 * @param callback - Called when the event fires
 * @returns Unsubscribe function
 */
export function onEvent(event: string, callback: (data: unknown) => void): () => void {
  let listeners = eventListeners.get(event);
  if (!listeners) {
    listeners = new Set();
    eventListeners.set(event, listeners);
  }
  listeners.add(callback);

  return () => {
    listeners!.delete(callback);
    if (listeners!.size === 0) {
      eventListeners.delete(event);
    }
  };
}

// ---------------------------------------------------------------------------
// Typed wrappers for media pipeline IPC
// ---------------------------------------------------------------------------

export interface IceServerConfig {
  urls: string[];
  username?: string;
  credential?: string;
}

/** Configure ICE servers for the next transport session. */
export function setIceServers(iceServers: IceServerConfig[]): Promise<{ configured: number }> {
  return invoke('transport.setIceServers', { iceServers });
}

/** Create a WebRTC offer for screen sharing. */
export function createOffer(userId: string, target: string): Promise<{ sdp: string; type: string }> {
  return invoke('transport.createOffer', { userId, target });
}

/** Accept a WebRTC offer and return an answer SDP. */
export function acceptOffer(sdp: string, userId: string, target: string): Promise<{ sdp: string; type: string }> {
  return invoke('transport.acceptOffer', { sdp, userId, target });
}

/** Stop the transport session. */
export function stopTransport(): Promise<{ stopped: boolean }> {
  return invoke('transport.stop');
}

/** Start the sender media pipeline (capture → encode → transport). */
export function startMediaSender(monitorIndex = 0, profile = 'performance-1080'): Promise<{ sending: boolean }> {
  return invoke('media.startSender', { monitorIndex, profile });
}

/** Start the receiver media pipeline (transport → decode → compositor). */
export function startMediaReceiver(surfaceIndex = 0): Promise<{ receiving: boolean }> {
  return invoke('media.startReceiver', { surfaceIndex });
}

/** Stop the media pipeline. */
export function stopMedia(): Promise<{ stopped: boolean }> {
  return invoke('media.stop');
}

/** Get media pipeline status. */
export function getMediaStatus(): Promise<{ running: boolean }> {
  return invoke('media.getStatus');
}

/**
 * Convenience object for importing:
 *   import { engine } from '@ripcord/ui/lib/engine-ipc';
 *   await engine.invoke('system.getVersion');
 */
export const engine = { invoke, onEvent, isEngine };
