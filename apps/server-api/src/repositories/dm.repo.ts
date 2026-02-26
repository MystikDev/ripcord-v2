import { query, queryOne } from '@ripcord/db';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A DM channel with participant info. */
export interface DmChannel {
  channelId: string;
  createdAt: string;
  participants: DmParticipant[];
}

export interface DmParticipant {
  userId: string;
  handle: string;
  avatarUrl: string | null;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Find an existing DM channel between exactly two users, or create one.
 * Returns the channel ID (existing or new).
 */
export async function findOrCreate(userIdA: string, userIdB: string): Promise<string> {
  // Check for existing DM between these two users
  const existing = await queryOne<{ channel_id: string }>(
    `SELECT dp1.channel_id
     FROM dm_participants dp1
     INNER JOIN dm_participants dp2 ON dp1.channel_id = dp2.channel_id
     INNER JOIN channels c ON c.id = dp1.channel_id
     WHERE dp1.user_id = $1 AND dp2.user_id = $2 AND c.type = 'dm'
     LIMIT 1`,
    [userIdA, userIdB],
  );

  if (existing) return existing.channel_id;

  // Create new DM channel
  const channelRow = await queryOne<{ id: string }>(
    `INSERT INTO channels (hub_id, type, name, is_private)
     VALUES (NULL, 'dm', 'DM', true)
     RETURNING id`,
    [],
  );
  const channelId = channelRow!.id;

  // Insert both participants
  await query(
    `INSERT INTO dm_participants (channel_id, user_id) VALUES ($1, $2), ($1, $3)`,
    [channelId, userIdA, userIdB],
  );

  return channelId;
}

/**
 * List all DM channels for a user, with participant info.
 * Returns newest DMs first.
 */
export async function listByUser(userId: string): Promise<DmChannel[]> {
  // Get all DM channel IDs for this user
  const rows = await query<{ channel_id: string; created_at: string }>(
    `SELECT dp.channel_id, c.created_at
     FROM dm_participants dp
     INNER JOIN channels c ON c.id = dp.channel_id
     WHERE dp.user_id = $1 AND c.type = 'dm'
     ORDER BY c.created_at DESC`,
    [userId],
  );

  if (rows.length === 0) return [];

  // Batch-fetch all participants for these channels
  const channelIds = rows.map((r) => r.channel_id);
  const placeholders = channelIds.map((_, i) => `$${i + 1}`).join(',');
  const participantRows = await query<{
    channel_id: string;
    user_id: string;
    handle: string;
    avatar_url: string | null;
  }>(
    `SELECT dp.channel_id, dp.user_id, u.handle, u.avatar_url
     FROM dm_participants dp
     INNER JOIN users u ON u.id = dp.user_id
     WHERE dp.channel_id IN (${placeholders})`,
    channelIds,
  );

  // Group participants by channel
  const participantMap = new Map<string, DmParticipant[]>();
  for (const p of participantRows) {
    const list = participantMap.get(p.channel_id) ?? [];
    list.push({ userId: p.user_id, handle: p.handle, avatarUrl: p.avatar_url });
    participantMap.set(p.channel_id, list);
  }

  return rows.map((r) => ({
    channelId: r.channel_id,
    createdAt: r.created_at,
    participants: participantMap.get(r.channel_id) ?? [],
  }));
}

/**
 * Check if a user is a participant in a DM channel.
 */
export async function isParticipant(channelId: string, userId: string): Promise<boolean> {
  const row = await queryOne<{ user_id: string }>(
    `SELECT user_id FROM dm_participants WHERE channel_id = $1 AND user_id = $2`,
    [channelId, userId],
  );
  return row !== null;
}
