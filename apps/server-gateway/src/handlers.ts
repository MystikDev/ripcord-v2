import { GatewayOpcode } from '@ripcord/types';
import type { AuthPayload, SubscribePayload, TypingPayload, VoiceStatePayload } from '@ripcord/types';
import { Permission, hasPermission } from '@ripcord/types';
import { verifyAccessToken } from '@ripcord/crypto';
import { query, queryOne } from '@ripcord/db';
import { ClientConnection } from './connection.js';
import { ConnectionManager } from './connection-manager.js';
import { setPresence, refreshPresenceTTL } from './presence.js';
import { joinVoiceChannel, leaveVoiceChannel, updateVoiceState, refreshVoiceStateTTL } from './voice-state.js';
import { log } from './logger.js';

/**
 * Handle the AUTH opcode. Verifies the JWT, enforces per-user connection
 * limits, and transitions the connection to an authenticated state.
 */
export async function handleAuth(
  conn: ClientConnection,
  payload: AuthPayload,
  manager: ConnectionManager,
): Promise<void> {
  if (conn.authenticated) {
    conn.send(GatewayOpcode.ERROR, { message: 'Already authenticated' });
    return;
  }

  // Strip "Bearer " prefix if present
  const rawToken = payload.token;
  const token = rawToken.startsWith('Bearer ')
    ? rawToken.slice(7)
    : rawToken;

  try {
    const jwt = await verifyAccessToken(token);

    const success = manager.authenticateConnection(
      conn.id,
      jwt.sub,
      jwt.did,
      jwt.sid,
    );

    if (!success) {
      conn.send(GatewayOpcode.AUTH_FAIL, {
        reason: 'Maximum connections per user reached',
      });
      conn.close(4008, 'Connection limit exceeded');
      return;
    }

    conn.send(GatewayOpcode.AUTH_OK, { userId: jwt.sub });

    // Update presence to online
    await setPresence(jwt.sub, 'online', manager);

    log.info({ connId: conn.id, userId: jwt.sub }, 'Client authenticated');
  } catch (err) {
    log.warn({ connId: conn.id, err }, 'Auth failed — invalid token');
    conn.send(GatewayOpcode.AUTH_FAIL, { reason: 'Invalid or expired token' });
    conn.close(4001, 'Authentication failed');
  }
}

/**
 * Lightweight permission check for the gateway.
 * Checks VIEW_CHANNELS permission using the 5-layer resolution.
 * This duplicates part of the API's permission.service.ts but avoids
 * cross-service imports. Results are NOT cached here (the API's Redis
 * cache handles that for REST routes).
 */
async function checkChannelAccess(
  hubId: string,
  channelId: string,
  userId: string,
): Promise<boolean> {
  // Layer 1: @everyone role
  const everyoneRole = await queryOne<{ bitset_permissions: string }>(
    `SELECT bitset_permissions FROM roles WHERE hub_id = $1 AND name = '@everyone'`,
    [hubId],
  );
  let permissions = everyoneRole ? Number(everyoneRole.bitset_permissions) : 0;

  // Layer 2: OR with assigned roles
  const memberRoles = await query<{ id: string; bitset_permissions: string }>(
    `SELECT r.id, r.bitset_permissions FROM roles r
     INNER JOIN member_roles mr ON mr.role_id = r.id
     WHERE mr.hub_id = $1 AND mr.user_id = $2`,
    [hubId, userId],
  );
  for (const role of memberRoles) {
    permissions |= Number(role.bitset_permissions);
  }

  // ADMIN short-circuit
  if (hasPermission(permissions, Permission.ADMINISTRATOR)) return true;

  // Layer 3: Channel role overrides (uses unified channel_overrides table)
  try {
    const allRoleIds = memberRoles.map(r => r.id);
    if (everyoneRole) {
      const evRow = await queryOne<{ id: string }>(
        `SELECT id FROM roles WHERE hub_id = $1 AND name = '@everyone'`,
        [hubId],
      );
      if (evRow) allRoleIds.push(evRow.id);
    }

    if (allRoleIds.length > 0) {
      const placeholders = allRoleIds.map((_, i) => `$${i + 3}`).join(',');
      const overrides = await query<{ allow_bitset: string; deny_bitset: string }>(
        `SELECT allow_bitset, deny_bitset FROM channel_overrides
         WHERE channel_id = $1 AND target_type = $2 AND target_id IN (${placeholders})`,
        [channelId, 'role', ...allRoleIds],
      );
      for (const ov of overrides) {
        permissions |= Number(ov.allow_bitset);
        permissions &= ~Number(ov.deny_bitset);
      }
    }
  } catch {
    // Table may not exist yet — skip channel role overrides
  }

  // Layer 4: Channel member overrides (uses unified channel_overrides table)
  try {
    const memberOv = await queryOne<{ allow_bitset: string; deny_bitset: string }>(
      `SELECT allow_bitset, deny_bitset FROM channel_overrides
       WHERE channel_id = $1 AND target_type = 'member' AND target_id = $2`,
      [channelId, userId],
    );
    if (memberOv) {
      permissions |= Number(memberOv.allow_bitset);
      permissions &= ~Number(memberOv.deny_bitset);
    }
  } catch {
    // Table may not exist yet — skip channel member overrides
  }

  return hasPermission(permissions, Permission.VIEW_CHANNELS);
}

/**
 * Handle the SUBSCRIBE opcode. Validates channel IDs, checks VIEW_CHANNELS
 * permission for each channel, then subscribes to authorized channels.
 */
export async function handleSubscribe(
  conn: ClientConnection,
  payload: SubscribePayload,
  manager: ConnectionManager,
): Promise<void> {
  if (!conn.authenticated || !conn.userId) {
    conn.send(GatewayOpcode.ERROR, { message: 'Not authenticated' });
    conn.close(4003, 'Not authenticated');
    return;
  }

  if (!Array.isArray(payload.channelIds) || payload.channelIds.length === 0) {
    conn.send(GatewayOpcode.ERROR, { message: 'channelIds must be a non-empty array' });
    return;
  }

  if (payload.channelIds.length > 200) {
    conn.send(GatewayOpcode.ERROR, { message: 'Too many channelIds (max 200)' });
    return;
  }

  // Validate all IDs are valid UUIDs
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const invalidIds = payload.channelIds.filter(id => typeof id !== 'string' || !UUID_RE.test(id));
  if (invalidIds.length > 0) {
    conn.send(GatewayOpcode.ERROR, { message: 'Invalid channelId format', invalidIds });
    return;
  }

  const authorized: string[] = [];
  const denied: string[] = [];

  for (const channelId of payload.channelIds) {
    try {
      // Look up channel to get hub_id
      const channelRow = await queryOne<{ hub_id: string }>(
        'SELECT hub_id FROM channels WHERE id = $1',
        [channelId],
      );

      if (!channelRow) {
        denied.push(channelId);
        continue;
      }

      // Check hub membership
      const memberRow = await queryOne<{ user_id: string }>(
        'SELECT user_id FROM hub_members WHERE hub_id = $1 AND user_id = $2',
        [channelRow.hub_id, conn.userId],
      );

      if (!memberRow) {
        denied.push(channelId);
        continue;
      }

      // Check VIEW_CHANNELS permission via the 5-layer resolution
      // We do a simplified check: get @everyone + member roles, compute bitset
      const hasAccess = await checkChannelAccess(channelRow.hub_id, channelId, conn.userId);
      if (hasAccess) {
        authorized.push(channelId);
      } else {
        denied.push(channelId);
      }
    } catch (err) {
      log.error({ channelId, err }, 'Error checking channel access for SUBSCRIBE');
      denied.push(channelId);
    }
  }

  // Subscribe to authorized channels
  for (const channelId of authorized) {
    manager.subscribeToChannel(conn.id, channelId);
  }

  if (denied.length > 0) {
    conn.send(GatewayOpcode.ERROR, { message: 'Access denied for some channels', denied });
    log.warn({ connId: conn.id, userId: conn.userId, denied }, 'Subscribe denied for channels');
  }

  if (authorized.length > 0) {
    log.debug(
      { connId: conn.id, channels: authorized },
      'Client subscribed to channels',
    );
  }
}

/**
 * Handle the UNSUBSCRIBE opcode. Removes the connection from the specified
 * channels and cleans up Redis pub/sub if no subscribers remain.
 */
export function handleUnsubscribe(
  conn: ClientConnection,
  payload: SubscribePayload,
  manager: ConnectionManager,
): void {
  if (!conn.authenticated) {
    conn.send(GatewayOpcode.ERROR, { message: 'Not authenticated' });
    conn.close(4003, 'Not authenticated');
    return;
  }

  if (!Array.isArray(payload.channelIds) || payload.channelIds.length === 0) {
    conn.send(GatewayOpcode.ERROR, { message: 'channelIds must be a non-empty array' });
    return;
  }

  for (const channelId of payload.channelIds) {
    if (typeof channelId === 'string' && channelId.length > 0) {
      manager.unsubscribeFromChannel(conn.id, channelId);
    }
  }

  log.debug(
    { connId: conn.id, channels: payload.channelIds },
    'Client unsubscribed from channels',
  );
}

/**
 * Handle the HEARTBEAT opcode. Resets the missed-heartbeat counter and
 * sends a HEARTBEAT_ACK back to the client. Also refreshes the presence
 * TTL in Redis.
 */
export async function handleHeartbeat(
  conn: ClientConnection,
): Promise<void> {
  conn.missedHeartbeats = 0;
  conn.lastHeartbeat = Date.now();
  conn.send(GatewayOpcode.HEARTBEAT_ACK, {});

  // Refresh presence and voice state TTLs if authenticated
  if (conn.authenticated && conn.userId) {
    await refreshPresenceTTL(conn.userId).catch((err) => {
      log.error({ connId: conn.id, err }, 'Failed to refresh presence TTL');
    });
    await refreshVoiceStateTTL(conn.subscribedChannels, conn.userId).catch((err) => {
      log.error({ connId: conn.id, err }, 'Failed to refresh voice state TTL');
    });
  }
}

/**
 * Handle the TYPING_START opcode. Broadcasts the typing indicator to all
 * other connections in the same channel (excluding the sender).
 */
export function handleTypingStart(
  conn: ClientConnection,
  payload: TypingPayload,
  manager: ConnectionManager,
): void {
  if (!conn.authenticated || !conn.userId) {
    conn.send(GatewayOpcode.ERROR, { message: 'Not authenticated' });
    return;
  }

  if (!payload.channelId) {
    conn.send(GatewayOpcode.ERROR, { message: 'channelId is required' });
    return;
  }

  // Verify sender is subscribed to the channel
  if (!conn.subscribedChannels.has(payload.channelId)) {
    conn.send(GatewayOpcode.ERROR, { message: 'Not subscribed to this channel' });
    return;
  }

  // Broadcast to channel subscribers except sender
  manager.broadcastToChannelExcept(
    payload.channelId,
    GatewayOpcode.TYPING_START,
    {
      channelId: payload.channelId,
      userId: conn.userId,
      handle: payload.handle,
    },
    conn.id,
    'TYPING_START',
  );
}

/**
 * Handle the VOICE_STATE_UPDATE opcode. Tracks users joining, leaving,
 * or updating their state (mute/deafen) in voice channels.
 * Stores state in Redis and broadcasts to all channel subscribers.
 */
export async function handleVoiceStateUpdate(
  conn: ClientConnection,
  payload: VoiceStatePayload,
  manager: ConnectionManager,
): Promise<void> {
  if (!conn.authenticated || !conn.userId) {
    conn.send(GatewayOpcode.ERROR, { message: 'Not authenticated' });
    return;
  }

  if (!payload.channelId) {
    conn.send(GatewayOpcode.ERROR, { message: 'channelId is required' });
    return;
  }

  if (!payload.action) {
    conn.send(GatewayOpcode.ERROR, { message: 'action is required' });
    return;
  }

  // Verify sender is subscribed to the voice channel
  if (!conn.subscribedChannels.has(payload.channelId)) {
    conn.send(GatewayOpcode.ERROR, { message: 'Not subscribed to this channel' });
    return;
  }

  switch (payload.action) {
    case 'join':
      await joinVoiceChannel(payload.channelId, conn.userId, payload.handle, manager);
      break;
    case 'leave':
      await leaveVoiceChannel(payload.channelId, conn.userId, manager);
      break;
    case 'update':
      await updateVoiceState(
        payload.channelId,
        conn.userId,
        payload.selfMute ?? false,
        payload.selfDeaf ?? false,
        manager,
      );
      break;
    default:
      conn.send(GatewayOpcode.ERROR, { message: `Unknown voice action: ${String(payload.action)}` });
  }
}
