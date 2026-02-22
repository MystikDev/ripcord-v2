import {
  getGatewayUrl,
  HEARTBEAT_INTERVAL,
  RECONNECT_BASE_DELAY,
  RECONNECT_MAX_DELAY,
} from './constants';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GatewayEvent =
  | 'MESSAGE_CREATED'
  | 'MESSAGE_UPDATED'
  | 'MESSAGE_DELETED'
  | 'PRESENCE_UPDATED'
  | 'TYPING_START'
  | 'VOICE_STATE_UPDATE'
  | 'CHANNEL_UPDATED'
  | 'SERVER_UPDATED';

export interface GatewayPayload {
  op: string;
  d?: Record<string, unknown>;
  t?: GatewayEvent;
}

type EventHandler = (data: Record<string, unknown>) => void;

// ---------------------------------------------------------------------------
// Gateway Client
// ---------------------------------------------------------------------------

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

  connect(accessToken: string): void {
    this.token = accessToken;
    this.intentionalClose = false;
    this.reconnectAttempt = 0;
    this.openSocket();
  }

  disconnect(): void {
    this.intentionalClose = true;
    this.cleanup();
  }

  on(event: GatewayEvent | 'open' | 'close' | 'error', handler: EventHandler): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
    return () => {
      this.listeners.get(event)?.delete(handler);
    };
  }

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
