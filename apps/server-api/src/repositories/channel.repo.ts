import { query, queryOne } from '@ripcord/db';
import type { Channel, ChannelType } from '@ripcord/types';

/** Row shape returned from the channels table. */
interface ChannelRow {
  id: string;
  hub_id: string;
  type: string;
  name: string;
  is_private: boolean;
  created_at: string;
}

/** Map a database row to the camelCase domain type. */
function toChannel(row: ChannelRow): Channel {
  return {
    id: row.id,
    hubId: row.hub_id,
    type: row.type as ChannelType,
    name: row.name,
    isPrivate: row.is_private,
    createdAt: row.created_at,
  };
}

/**
 * Create a new channel in a hub.
 *
 * @param hubId - Parent hub UUID.
 * @param name - Display name for the channel.
 * @param type - Channel type (text or voice).
 * @param isPrivate - Whether the channel is private.
 * @returns The newly created channel.
 */
export async function create(
  hubId: string,
  name: string,
  type: ChannelType,
  isPrivate: boolean = false,
): Promise<Channel> {
  const rows = await query<ChannelRow>(
    `INSERT INTO channels (hub_id, name, type, is_private)
     VALUES ($1, $2, $3, $4)
     RETURNING id, hub_id, type, name, is_private, created_at`,
    [hubId, name, type, isPrivate],
  );
  return toChannel(rows[0]!);
}

/**
 * Find a channel by its primary key.
 *
 * @param id - Channel UUID.
 * @returns The channel, or null if not found.
 */
export async function findById(id: string): Promise<Channel | null> {
  const row = await queryOne<ChannelRow>(
    `SELECT id, hub_id, type, name, is_private, created_at
     FROM channels WHERE id = $1`,
    [id],
  );
  return row ? toChannel(row) : null;
}

/**
 * List all channels belonging to a hub.
 *
 * @param hubId - Parent hub UUID.
 * @returns Array of channels sorted by creation time.
 */
export async function findByHubId(hubId: string): Promise<Channel[]> {
  const rows = await query<ChannelRow>(
    `SELECT id, hub_id, type, name, is_private, created_at
     FROM channels WHERE hub_id = $1
     ORDER BY created_at ASC`,
    [hubId],
  );
  return rows.map(toChannel);
}
