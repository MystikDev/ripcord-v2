import { GatewayOpcode } from '@ripcord/types';
import type { PresenceStatus } from '@ripcord/types';
import { redis } from './redis.js';
import { log } from './logger.js';
import type { ConnectionManager } from './connection-manager.js';

/** Redis key prefix for presence entries. */
const PRESENCE_PREFIX = 'presence:';

/** TTL for online presence keys (seconds). Refreshed on each heartbeat. */
const PRESENCE_TTL_SEC = 60;

/**
 * Set a user's presence status in Redis and optionally broadcast the
 * change to all channels the user is subscribed to.
 *
 * @param userId  - The user whose presence changed.
 * @param status  - The new presence status.
 * @param manager - ConnectionManager for broadcasting and channel lookups.
 */
export async function setPresence(
  userId: string,
  status: PresenceStatus,
  manager: ConnectionManager,
): Promise<void> {
  const key = `${PRESENCE_PREFIX}${userId}`;

  if (status === 'offline') {
    await redis.del(key);
  } else {
    await redis.set(key, status, 'EX', PRESENCE_TTL_SEC);
  }

  // Broadcast PRESENCE_UPDATED to every channel the user participates in
  const channels = manager.getUserChannels(userId);
  const payload = {
    userId,
    status,
    lastSeen: new Date().toISOString(),
  };

  for (const channelId of channels) {
    manager.broadcastToChannel(channelId, GatewayOpcode.PRESENCE_UPDATED, payload);
  }

  log.debug({ userId, status }, 'Presence updated');
}

/**
 * Refresh the TTL on a user's presence key. Called on every heartbeat
 * to keep the "online" status alive.
 */
export async function refreshPresenceTTL(userId: string): Promise<void> {
  const key = `${PRESENCE_PREFIX}${userId}`;
  await redis.expire(key, PRESENCE_TTL_SEC);
}

/**
 * Get the current presence status for a user from Redis.
 * Returns "offline" if no key exists.
 */
export async function getPresence(userId: string): Promise<PresenceStatus> {
  const key = `${PRESENCE_PREFIX}${userId}`;
  const value = await redis.get(key);
  if (value === 'online' || value === 'idle' || value === 'dnd') {
    return value;
  }
  return 'offline';
}
