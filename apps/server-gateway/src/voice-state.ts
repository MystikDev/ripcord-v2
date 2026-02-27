import { GatewayOpcode } from '@ripcord/types';
import type { VoiceParticipant } from '@ripcord/types';
import { redis } from './redis.js';
import { log } from './logger.js';
import type { ConnectionManager } from './connection-manager.js';

/** Redis key prefix for voice channel state hashes. */
const VOICE_PREFIX = 'voice:';

/** Redis key prefix tracking which voice channel a user is currently in. */
const VOICE_CURRENT_PREFIX = 'voice-current:';

/** TTL for voice state keys (seconds). Refreshed on each heartbeat. */
const VOICE_TTL_SEC = 90;

// ---------------------------------------------------------------------------
// Join / Leave / Update
// ---------------------------------------------------------------------------

/**
 * Record a user joining a voice channel.
 *
 * Enforces the "one voice channel at a time" invariant: if the user is
 * already in a different voice channel, they are automatically removed
 * from it first (with a leave broadcast to subscribers).
 *
 * Stores their info in Redis and broadcasts to all channel subscribers.
 */
export async function joinVoiceChannel(
  channelId: string,
  userId: string,
  handle: string | undefined,
  manager: ConnectionManager,
  senderConnId?: string,
): Promise<void> {
  // --- Enforce single-channel: auto-leave previous channel if different ---
  const currentKey = `${VOICE_CURRENT_PREFIX}${userId}`;
  const previousChannelId = await redis.get(currentKey);

  if (previousChannelId && previousChannelId !== channelId) {
    log.debug({ userId, from: previousChannelId, to: channelId }, 'Auto-leaving previous voice channel');
    await leaveVoiceChannel(previousChannelId, userId, manager);
  }

  // --- Join the new channel ---
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

  // Track the user's current channel
  await redis.set(currentKey, channelId, 'EX', VOICE_TTL_SEC);

  // Broadcast to all subscribers of this channel (excluding the sender who
  // already applied an optimistic UI update to avoid duplicate entries).
  const payload = { channelId, userId, handle, action: 'join', selfMute: false, selfDeaf: false };
  if (senderConnId) {
    manager.broadcastToChannelExcept(channelId, GatewayOpcode.VOICE_STATE_UPDATE, payload, senderConnId, 'VOICE_STATE_UPDATE');
  } else {
    manager.broadcastToChannel(channelId, GatewayOpcode.VOICE_STATE_UPDATE, payload, 'VOICE_STATE_UPDATE');
  }

  log.debug({ channelId, userId }, 'User joined voice channel');
}

/**
 * Record a user leaving a voice channel.
 * Removes their entry from Redis, clears the current-channel tracker,
 * and broadcasts to all channel subscribers.
 */
export async function leaveVoiceChannel(
  channelId: string,
  userId: string,
  manager: ConnectionManager,
  senderConnId?: string,
): Promise<void> {
  const key = `${VOICE_PREFIX}${channelId}`;
  await redis.hdel(key, userId);

  // Clean up key if hash is now empty
  const remaining = await redis.hlen(key);
  if (remaining === 0) {
    await redis.del(key);
  }

  // Clear the current-channel tracker (only if it still points to this channel)
  const currentKey = `${VOICE_CURRENT_PREFIX}${userId}`;
  const tracked = await redis.get(currentKey);
  if (tracked === channelId) {
    await redis.del(currentKey);
  }

  // Broadcast leave to all subscribers (excluding the sender who already
  // applied an optimistic UI update).
  const payload = { channelId, userId, action: 'leave' };
  if (senderConnId) {
    manager.broadcastToChannelExcept(channelId, GatewayOpcode.VOICE_STATE_UPDATE, payload, senderConnId, 'VOICE_STATE_UPDATE');
  } else {
    manager.broadcastToChannel(channelId, GatewayOpcode.VOICE_STATE_UPDATE, payload, 'VOICE_STATE_UPDATE');
  }

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
  senderConnId?: string,
): Promise<void> {
  const key = `${VOICE_PREFIX}${channelId}`;
  const raw = await redis.hget(key, userId);
  if (!raw) return; // User not in this voice channel

  const participant: VoiceParticipant = JSON.parse(raw);
  participant.selfMute = selfMute;
  participant.selfDeaf = selfDeaf;

  await redis.hset(key, userId, JSON.stringify(participant));
  await redis.expire(key, VOICE_TTL_SEC);

  const payload = { channelId, userId, action: 'update', selfMute, selfDeaf };
  if (senderConnId) {
    manager.broadcastToChannelExcept(channelId, GatewayOpcode.VOICE_STATE_UPDATE, payload, senderConnId, 'VOICE_STATE_UPDATE');
  } else {
    manager.broadcastToChannel(channelId, GatewayOpcode.VOICE_STATE_UPDATE, payload, 'VOICE_STATE_UPDATE');
  }
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
 * Grace period (ms) — if a user's Redis entry was written within this window
 * it likely belongs to a new session (rapid reconnect), so skip cleanup.
 */
const REJOIN_GRACE_MS = 5_000;

/**
 * Remove a user from all voice channels they were subscribed to.
 * Called when a WebSocket connection closes.
 *
 * Guards against a race condition where the user has already reconnected and
 * rejoined via a new connection: if the Redis entry's `joinedAt` is very
 * recent, we skip cleanup for that channel.
 */
export async function cleanupUserVoiceStates(
  userId: string,
  subscribedChannels: ReadonlySet<string>,
  manager: ConnectionManager,
): Promise<void> {
  // Also check the current-channel tracker in case the subscribed set is stale
  const currentKey = `${VOICE_CURRENT_PREFIX}${userId}`;
  const trackedChannel = await redis.get(currentKey);
  const channelsToCheck = new Set(subscribedChannels);
  if (trackedChannel) channelsToCheck.add(trackedChannel);

  for (const channelId of channelsToCheck) {
    const key = `${VOICE_PREFIX}${channelId}`;
    const raw = await redis.hget(key, userId);
    if (!raw) continue;

    // If the user already rejoined via a new connection, their joinedAt will be
    // very recent — skip cleanup so we don't remove a valid session.
    try {
      const participant: VoiceParticipant = JSON.parse(raw);
      const joinedAge = Date.now() - new Date(participant.joinedAt).getTime();
      if (joinedAge < REJOIN_GRACE_MS) {
        log.debug({ channelId, userId, joinedAge }, 'Skipping voice cleanup — user recently rejoined');
        continue;
      }
    } catch {
      // If we can't parse, proceed with removal
    }

    await leaveVoiceChannel(channelId, userId, manager);
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

  // Also refresh the current-channel tracker TTL
  const currentKey = `${VOICE_CURRENT_PREFIX}${userId}`;
  const tracked = await redis.get(currentKey);
  if (tracked) {
    await redis.expire(currentKey, VOICE_TTL_SEC);
  }
}
