import { query } from '@ripcord/db';

/** Row shape returned from the channel_overrides table. */
interface ChannelOverrideRow {
  id: string;
  channel_id: string;
  target_type: string;
  target_id: string;
  allow_bitset: string;
  deny_bitset: string;
}

/** Domain representation of a channel permission override. */
export interface ChannelOverride {
  id: string;
  channelId: string;
  targetType: 'role' | 'member';
  targetId: string;
  allowBitset: number;
  denyBitset: number;
}

/** Map a database row to the camelCase domain type. */
function toOverride(row: ChannelOverrideRow): ChannelOverride {
  return {
    id: row.id,
    channelId: row.channel_id,
    targetType: row.target_type as 'role' | 'member',
    targetId: row.target_id,
    allowBitset: Number(row.allow_bitset),
    denyBitset: Number(row.deny_bitset),
  };
}

/**
 * Find all channel overrides for a specific channel.
 *
 * @param channelId - Channel UUID.
 * @returns Array of channel overrides.
 */
export async function findByChannelId(channelId: string): Promise<ChannelOverride[]> {
  const rows = await query<ChannelOverrideRow>(
    `SELECT id, channel_id, target_type, target_id, allow_bitset, deny_bitset
     FROM channel_overrides WHERE channel_id = $1`,
    [channelId],
  );
  return rows.map(toOverride);
}

/**
 * Find overrides for a specific channel targeting specific role IDs.
 *
 * @param channelId - Channel UUID.
 * @param roleIds - Array of role UUIDs to match.
 * @returns Array of matching role overrides.
 */
export async function findRoleOverrides(
  channelId: string,
  roleIds: string[],
): Promise<ChannelOverride[]> {
  if (roleIds.length === 0) return [];

  const placeholders = roleIds.map((_, i) => `$${i + 3}`).join(', ');
  const rows = await query<ChannelOverrideRow>(
    `SELECT id, channel_id, target_type, target_id, allow_bitset, deny_bitset
     FROM channel_overrides
     WHERE channel_id = $1 AND target_type = $2 AND target_id IN (${placeholders})`,
    [channelId, 'role', ...roleIds],
  );
  return rows.map(toOverride);
}

/**
 * Find the member-specific override for a channel.
 *
 * @param channelId - Channel UUID.
 * @param userId - User UUID.
 * @returns The member override, or null.
 */
export async function findMemberOverride(
  channelId: string,
  userId: string,
): Promise<ChannelOverride | null> {
  const rows = await query<ChannelOverrideRow>(
    `SELECT id, channel_id, target_type, target_id, allow_bitset, deny_bitset
     FROM channel_overrides
     WHERE channel_id = $1 AND target_type = 'member' AND target_id = $2`,
    [channelId, userId],
  );
  return rows.length > 0 ? toOverride(rows[0]!) : null;
}
