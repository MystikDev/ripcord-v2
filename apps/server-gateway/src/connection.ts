import { randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';
import type { GatewayOpcode, GatewayMessage } from '@ripcord/types';
import { log } from './logger.js';

/**
 * Represents a single WebSocket client connected to the gateway.
 *
 * Tracks authentication state, channel subscriptions, heartbeat health,
 * and provides helpers for sending typed gateway messages.
 */
export class ClientConnection {
  /** Unique identifier for this connection (UUID v4). */
  readonly id: string;

  /** Underlying WebSocket instance. */
  readonly ws: WebSocket;

  /** Authenticated user ID (set after successful AUTH). */
  userId?: string;

  /** Device ID from the JWT (set after successful AUTH). */
  deviceId?: string;

  /** Session ID from the JWT (set after successful AUTH). */
  sessionId?: string;

  /** Whether this connection has passed authentication. */
  authenticated = false;

  /** Set of channel IDs this connection is subscribed to. */
  readonly subscribedChannels = new Set<string>();

  /** Timestamp (ms) of the last heartbeat received from the client. */
  lastHeartbeat: number;

  /** Number of consecutive heartbeat intervals with no client response. */
  missedHeartbeats = 0;

  /** Monotonically increasing counter for outgoing sequenced messages. */
  private _sequence = 0;

  constructor(ws: WebSocket) {
    this.id = randomUUID();
    this.ws = ws;
    this.lastHeartbeat = Date.now();
  }

  /**
   * Current outgoing sequence number (read-only).
   */
  get sequence(): number {
    return this._sequence;
  }

  /**
   * Send a typed gateway message to the client.
   *
   * If `seq` is not explicitly provided, no sequence number is attached
   * (used for control messages like HELLO, AUTH_OK, HEARTBEAT_ACK).
   * For event broadcasts (MESSAGE_CREATED, etc.), pass `true` for
   * `autoSeq` to auto-increment and attach a sequence number.
   *
   * Optionally pass `eventName` to set the `t` field on the outgoing message.
   * This allows clients to dispatch on the string event name.
   */
  send<T>(op: GatewayOpcode, data: T, autoSeq = false, eventName?: string): void {
    if (this.ws.readyState !== WebSocket.OPEN) return;

    const msg: GatewayMessage<T> & { t?: string } = {
      op,
      d: data,
      ts: Date.now(),
    };

    if (autoSeq) {
      this._sequence += 1;
      msg.seq = this._sequence;
    }

    if (eventName) {
      msg.t = eventName;
    }

    try {
      this.ws.send(JSON.stringify(msg));
    } catch (err) {
      log.error({ connId: this.id, err }, 'Failed to send message');
    }
  }

  /**
   * Close the WebSocket connection with a status code and reason.
   */
  close(code: number, reason: string): void {
    try {
      this.ws.close(code, reason);
    } catch {
      // Connection may already be closed; ignore.
    }
  }
}
