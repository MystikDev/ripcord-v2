import type { GatewayOpcode } from '@ripcord/types';
import { ClientConnection } from './connection.js';
import { redisSub } from './redis.js';
import { log } from './logger.js';

/** Maximum concurrent WebSocket connections allowed per user. */
const MAX_CONNECTIONS_PER_USER = 5;

/**
 * Manages all active WebSocket connections and their channel subscriptions.
 *
 * Maintains three indices for efficient lookups:
 *  - connectionId -> ClientConnection
 *  - userId       -> Set<connectionId>
 *  - channelId    -> Set<connectionId>
 *
 * Also coordinates Redis pub/sub: subscribes to Redis channels when the first
 * connection joins, and unsubscribes when the last connection leaves.
 */
export class ConnectionManager {
  /** All active connections keyed by connection ID. */
  private readonly connections = new Map<string, ClientConnection>();

  /** Index of connection IDs by user ID (for presence + connection limits). */
  private readonly userIndex = new Map<string, Set<string>>();

  /** Index of connection IDs by channel ID (for message broadcasting). */
  private readonly channelIndex = new Map<string, Set<string>>();

  /**
   * Register a new connection.
   */
  addConnection(conn: ClientConnection): void {
    this.connections.set(conn.id, conn);
    log.debug({ connId: conn.id }, 'Connection added');
  }

  /**
   * Remove a connection and clean up all associated indices.
   * Returns the removed connection, or undefined if not found.
   */
  removeConnection(connId: string): ClientConnection | undefined {
    const conn = this.connections.get(connId);
    if (!conn) return undefined;

    // Remove from user index
    if (conn.userId) {
      const userConns = this.userIndex.get(conn.userId);
      if (userConns) {
        userConns.delete(connId);
        if (userConns.size === 0) {
          this.userIndex.delete(conn.userId);
        }
      }
    }

    // Remove from all channel indices and unsubscribe from Redis if needed
    for (const channelId of conn.subscribedChannels) {
      this.removeFromChannel(connId, channelId);
    }

    this.connections.delete(connId);
    log.debug({ connId, userId: conn.userId }, 'Connection removed');
    return conn;
  }

  /**
   * Mark a connection as authenticated and index it by user ID.
   *
   * @returns `true` if authenticated successfully, `false` if the user
   *          has reached the maximum connection limit.
   */
  authenticateConnection(
    connId: string,
    userId: string,
    deviceId: string,
    sessionId: string,
  ): boolean {
    const conn = this.connections.get(connId);
    if (!conn) return false;

    // Enforce per-user connection limit
    const existing = this.userIndex.get(userId);
    if (existing && existing.size >= MAX_CONNECTIONS_PER_USER) {
      return false;
    }

    conn.userId = userId;
    conn.deviceId = deviceId;
    conn.sessionId = sessionId;
    conn.authenticated = true;

    if (!this.userIndex.has(userId)) {
      this.userIndex.set(userId, new Set());
    }
    this.userIndex.get(userId)!.add(connId);

    log.info({ connId, userId, deviceId }, 'Connection authenticated');
    return true;
  }

  /**
   * Subscribe a connection to a channel. If this is the first connection
   * subscribing to this channel, also subscribe to the Redis pub/sub channel.
   */
  subscribeToChannel(connId: string, channelId: string): void {
    const conn = this.connections.get(connId);
    if (!conn) return;

    conn.subscribedChannels.add(channelId);

    if (!this.channelIndex.has(channelId)) {
      this.channelIndex.set(channelId, new Set());

      // First subscriber for this channel — subscribe in Redis
      const redisChannel = `ch:${channelId}`;
      redisSub.subscribe(redisChannel).catch((err: unknown) => {
        log.error({ channelId, err }, 'Failed to subscribe to Redis channel');
      });
      log.debug({ channelId }, 'Redis channel subscribed');
    }

    this.channelIndex.get(channelId)!.add(connId);
    log.debug({ connId, channelId }, 'Connection subscribed to channel');
  }

  /**
   * Unsubscribe a connection from a channel. If this was the last connection
   * subscribed to that channel, also unsubscribe from the Redis pub/sub channel.
   */
  unsubscribeFromChannel(connId: string, channelId: string): void {
    const conn = this.connections.get(connId);
    if (!conn) return;

    conn.subscribedChannels.delete(channelId);
    this.removeFromChannel(connId, channelId);
    log.debug({ connId, channelId }, 'Connection unsubscribed from channel');
  }

  /**
   * Broadcast a gateway message to all connections subscribed to a channel.
   *
   * @param channelId - Channel to broadcast to.
   * @param op - Gateway opcode.
   * @param data - Payload data.
   * @param eventName - Optional event name for the `t` field (e.g. 'MESSAGE_CREATED').
   */
  broadcastToChannel<T>(channelId: string, op: GatewayOpcode, data: T, eventName?: string): void {
    const subscribers = this.channelIndex.get(channelId);
    if (!subscribers || subscribers.size === 0) return;

    for (const connId of subscribers) {
      const conn = this.connections.get(connId);
      if (conn?.authenticated) {
        conn.send(op, data, true, eventName);
      }
    }
  }

  /**
   * Broadcast a gateway message to all connections subscribed to a channel,
   * excluding a specific connection (typically the sender).
   */
  broadcastToChannelExcept<T>(
    channelId: string,
    op: GatewayOpcode,
    data: T,
    excludeConnId: string,
    eventName?: string,
  ): void {
    const subscribers = this.channelIndex.get(channelId);
    if (!subscribers || subscribers.size === 0) return;

    for (const connId of subscribers) {
      if (connId === excludeConnId) continue;
      const conn = this.connections.get(connId);
      if (conn?.authenticated) {
        conn.send(op, data, true, eventName);
      }
    }
  }

  /**
   * Get all connections belonging to a specific user.
   */
  getConnectionsByUser(userId: string): ClientConnection[] {
    const connIds = this.userIndex.get(userId);
    if (!connIds) return [];

    const result: ClientConnection[] = [];
    for (const connId of connIds) {
      const conn = this.connections.get(connId);
      if (conn) result.push(conn);
    }
    return result;
  }

  /**
   * Get a connection by its ID.
   */
  getConnection(connId: string): ClientConnection | undefined {
    return this.connections.get(connId);
  }

  /**
   * Check whether a user has any active connections.
   */
  hasUserConnections(userId: string): boolean {
    const conns = this.userIndex.get(userId);
    return conns !== undefined && conns.size > 0;
  }

  /**
   * Get all channels a given user is subscribed to (across all connections).
   */
  getUserChannels(userId: string): Set<string> {
    const channels = new Set<string>();
    const connIds = this.userIndex.get(userId);
    if (!connIds) return channels;

    for (const connId of connIds) {
      const conn = this.connections.get(connId);
      if (conn) {
        for (const ch of conn.subscribedChannels) {
          channels.add(ch);
        }
      }
    }
    return channels;
  }

  /**
   * Return all active connections. Used for heartbeat sweeps.
   */
  allConnections(): IterableIterator<ClientConnection> {
    return this.connections.values();
  }

  /**
   * Total number of active connections.
   */
  get size(): number {
    return this.connections.size;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Remove a connection from the channel index. If the channel has no more
   * subscribers, unsubscribe from Redis.
   */
  private removeFromChannel(connId: string, channelId: string): void {
    const subscribers = this.channelIndex.get(channelId);
    if (!subscribers) return;

    subscribers.delete(connId);

    if (subscribers.size === 0) {
      this.channelIndex.delete(channelId);

      // Last subscriber left — unsubscribe from Redis
      const redisChannel = `ch:${channelId}`;
      redisSub.unsubscribe(redisChannel).catch((err: unknown) => {
        log.error({ channelId, err }, 'Failed to unsubscribe from Redis channel');
      });
      log.debug({ channelId }, 'Redis channel unsubscribed');
    }
  }
}
