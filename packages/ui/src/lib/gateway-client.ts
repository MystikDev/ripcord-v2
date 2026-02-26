/**
 * WebSocket client for the Ripcord realtime gateway.
 *
 * Handles connection lifecycle, automatic reconnection with exponential
 * backoff, heartbeat keep-alive, and event dispatch. The gateway pushes
 * events (messages, presence, voice state, etc.) and this client routes
 * them to registered handlers.
 *
 * Protocol opcodes:
 *   0 = AUTH (sent on connect with JWT access token)
 *   6 = HEARTBEAT (sent every 30s to keep the connection alive)
 *
 * @example
 *   gateway.connect(accessToken);
 *   const unsub = gateway.on('MESSAGE_CREATED', (data) => { ... });
 *   gateway.disconnect();
 *
 * @module gateway-client
 */

import {
  getGatewayUrl,
  HEARTBEAT_INTERVAL,
  RECONNECT_BASE_DELAY,
  RECONNECT_MAX_DELAY,
} from './constants';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Server-dispatched event names carried in the `t` field of gateway payloads. */
export type GatewayEvent =
  | 'MESSAGE_CREATED'
  | 'MESSAGE_UPDATED'
  | 'MESSAGE_DELETED'
  | 'MESSAGE_PINNED'
  | 'MESSAGE_UNPINNED'
  | 'PRESENCE_UPDATED'
  | 'TYPING_START'
  | 'VOICE_STATE_UPDATE'
  | 'CHANNEL_UPDATED'
  | 'SERVER_UPDATED'
  | 'CALL_INVITE'
  | 'CALL_ACCEPT'
  | 'CALL_DECLINE'
  | 'CALL_END';

export interface GatewayPayload {
  op: string;
  d?: Record<string, unknown>;
  t?: GatewayEvent;
}

type EventHandler = (data: Record<string, unknown>) => void;

// ---------------------------------------------------------------------------
// Gateway Client
// ---------------------------------------------------------------------------

/**
 * Singleton WebSocket client with auto-reconnect and heartbeat.
 *
 * Reconnect uses exponential backoff (1s base, 30s max). The heartbeat
 * prevents idle-timeout disconnects from proxies and load balancers.
 */
export class GatewayClient {
  private ws: WebSocket | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private token: string | null = null;
  private intentionalClose = false;
  private listeners = new Map<string, Set<EventHandler>>();

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /** Open a WebSocket connection and authenticate with the given JWT. */
  connect(accessToken: string): void {
    this.token = accessToken;
    this.intentionalClose = false;
    this.reconnectAttempt = 0;
    this.openSocket();
  }

  /** Close the connection and suppress auto-reconnect. */
  disconnect(): void {
    this.intentionalClose = true;
    this.cleanup();
  }

  /**
   * Update the stored token without reconnecting.
   *
   * Called when the access token is refreshed so that future auto-reconnects
   * (e.g. after a network blip) use the latest valid token. This avoids
   * tearing down the existing WebSocket just to swap the token.
   */
  updateToken(accessToken: string): void {
    this.token = accessToken;
  }

  /** Register an event handler. Returns an unsubscribe function. */
  on(event: GatewayEvent | 'open' | 'close' | 'error', handler: EventHandler): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
    return () => {
      this.listeners.get(event)?.delete(handler);
    };
  }

  /** Send a gateway message. Silently no-ops if the socket isn't open. */
  send(op: number, data?: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ op, d: data, ts: Date.now() }));
    }
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  private openSocket(): void {
    this.cleanup();

    try {
      this.ws = new WebSocket(getGatewayUrl());
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectAttempt = 0;
      // Authenticate immediately
      // AUTH opcode = 0
      this.send(0, { token: this.token });
      this.startHeartbeat();
      this.emit('open', {});
    };

    this.ws.onmessage = (event) => {
      try {
        const payload: GatewayPayload = JSON.parse(event.data as string);
        if (payload.t) {
          this.emit(payload.t, payload.d ?? {});
        }
      } catch {
        // Ignore malformed messages
      }
    };

    this.ws.onclose = () => {
      this.stopHeartbeat();
      this.emit('close', {});
      if (!this.intentionalClose) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      this.emit('error', {});
    };
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      // HEARTBEAT opcode = 6
      this.send(6);
    }, HEARTBEAT_INTERVAL);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.intentionalClose) return;

    const delay = Math.min(
      RECONNECT_BASE_DELAY * Math.pow(2, this.reconnectAttempt),
      RECONNECT_MAX_DELAY,
    );
    this.reconnectAttempt++;

    this.reconnectTimer = setTimeout(() => {
      this.openSocket();
    }, delay);
  }

  private cleanup(): void {
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      if (
        this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING
      ) {
        this.ws.close();
      }
      this.ws = null;
    }
  }

  private emit(event: string, data: Record<string, unknown>): void {
    this.listeners.get(event)?.forEach((handler) => {
      try {
        handler(data);
      } catch {
        // Don't let one handler crash others
      }
    });
  }
}

// Singleton instance
export const gateway = new GatewayClient();
