import { GatewayOpcode } from '@ripcord/types';
import type { VoiceParticipant } from '@ripcord/types';
import { redis } from './redis.js';
import { log } from './logger.js';
import type { ConnectionManager } from './connection-manager.js';

/** Redis key prefix for voice channel state hashes. */
const VOICE_PREFIX = 'voice:';

/** TTL for voice state keys (seconds). Refreshed on each heartbeat. */
const VOICE_TTL_SEC = 90;

// ---------------------------------------------------------------------------
// Join / Leave / Update
// ---------------------------------------------------------------------------

/**
 * Record a user joining a voice channel.
 * Stores their info in Redis and broadcasts to all channel subscribers.
 */
export async function joinVoiceChannel(
  channelId: string,
  userId: string,
  handle: string | undefined,
  manager: ConnectionManager,
): Promise<void> {
  const key = `${VOICE_PREFIX}${channelId}`;
  const participant: VoiceParticipant = {
    userId,
    handle,
    selfMute: false,
    selfDeaf: false,
    joinedAt: new Date().toISOString(),
  };

  await redis.hset(key, userId, JSON.stringify(participant));
  await redis.expire(key, VOICE_TTL_SEC);

  // Broadcast to all subscribers of this channel
  manager.broadcastToChannel(
    channelId,
    GatewayOpcode.VOICE_STATE_UPDATE,
    { channelId, userId, handle, action: 'join', selfMute: false, selfDeaf: false },
    'VOICE_STATE_UPDATE',
  );

  log.debug({ channelId, userId }, 'User joined voice channel');
}

/**
 * Record a user leaving a voice channel.
 * Removes their entry from Redis and broadcasts to all channel subscribers.
 */
export async function leaveVoiceChannel(
  channelId: string,
  userId: string,
  manager: ConnectionManager,
): Promise<void> {
  const key = `${VOICE_PREFIX}${channelId}`;
  await redis.hdel(key, userId);

  // Clean up key if hash is now empty
  const remaining = await redis.hlen(key);
  if (remaining === 0) {
    await redis.del(key);
  }

  // Broadcast leave to all subscribers
  manager.broadcastToChannel(
    channelId,
    GatewayOpcode.VOICE_STATE_UPDATE,
    { channelId, userId, action: 'leave' },
    'VOICE_STATE_UPDATE',
  );

  log.debug({ channelId, userId }, 'User left voice channel');
}

/**
 * Update a user's voice state (mute/deafen) in a channel.
 */
export async function updateVoiceState(
  channelId: string,
  userId: string,
  selfMute: boolean,
  selfDeaf: boolean,
  manager: ConnectionManager,
): Promise<void> {
  const key = `${VOICE_PREFIX}${channelId}`;
  const raw = await redis.hget(key, userId);
  if (!raw) return; // User not in this voice channel

  const participant: VoiceParticipant = JSON.parse(raw);
  participant.selfMute = selfMute;
  participant.selfDeaf = selfDeaf;

  await redis.hset(key, userId, JSON.stringify(participant));
  await redis.expire(key, VOICE_TTL_SEC);

  manager.broadcastToChannel(
    channelId,
    GatewayOpcode.VOICE_STATE_UPDATE,
    { channelId, userId, action: 'update', selfMute, selfDeaf },
    'VOICE_STATE_UPDATE',
  );
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

/**
 * Get all participants in a voice channel.
 */
export async function getVoiceParticipants(channelId: string): Promise<VoiceParticipant[]> {
  const key = `${VOICE_PREFIX}${channelId}`;
  const entries = await redis.hgetall(key);
  const participants: VoiceParticipant[] = [];

  for (const raw of Object.values(entries)) {
    try {
      participants.push(JSON.parse(raw));
    } catch {
      // Skip malformed entries
    }
  }

  return participants;
}

/**
 * Get voice states for all given channel IDs (used for REST hydration).
 * Returns a map of channelId → participants (only channels with participants).
 */
export async function getHubVoiceStates(
  channelIds: string[],
): Promise<Record<string, VoiceParticipant[]>> {
  const result: Record<string, VoiceParticipant[]> = {};

  for (const channelId of channelIds) {
    const participants = await getVoiceParticipants(channelId);
    if (participants.length > 0) {
      result[channelId] = participants;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Cleanup (on disconnect)
// ---------------------------------------------------------------------------

/**
 * Remove a user from all voice channels they were subscribed to.
 * Called when a WebSocket connection closes.
 */
export async function cleanupUserVoiceStates(
  userId: string,
  subscribedChannels: ReadonlySet<string>,
  manager: ConnectionManager,
): Promise<void> {
  for (const channelId of subscribedChannels) {
    const key = `${VOICE_PREFIX}${channelId}`;
    const exists = await redis.hexists(key, userId);
    if (exists) {
      await leaveVoiceChannel(channelId, userId, manager);
    }
  }
}

/**
 * Refresh TTL on all voice channel keys a user is in.
 * Called on heartbeat to keep voice state alive.
 */
export async function refreshVoiceStateTTL(
  subscribedChannels: ReadonlySet<string>,
  userId: string,
): Promise<void> {
  for (const channelId of subscribedChannels) {
    const key = `${VOICE_PREFIX}${channelId}`;
    const exists = await redis.hexists(key, userId);
    if (exists) {
      await redis.expire(key, VOICE_TTL_SEC);
    }
  }
}
