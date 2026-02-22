import { query, queryOne } from '@ripcord/db';

/** Row shape for the hub_members join table. */
interface MemberRow {
  hub_id: string;
  user_id: string;
  joined_at: string;
}

/** Domain representation of a hub membership. */
export interface HubMember {
  hubId: string;
  userId: string;
  joinedAt: string;
}

/** Map a database row to the camelCase domain type. */
function toMember(row: MemberRow): HubMember {
  return {
    hubId: row.hub_id,
    userId: row.user_id,
    joinedAt: row.joined_at,
  };
}

/**
 * Add a user to a hub.
 *
 * @param hubId - Hub UUID.
 * @param userId - User UUID.
 * @returns The new membership record.
 */
export async function add(hubId: string, userId: string): Promise<HubMember> {
  const rows = await query<MemberRow>(
    `INSERT INTO hub_members (hub_id, user_id)
     VALUES ($1, $2)
     ON CONFLICT (hub_id, user_id) DO NOTHING
     RETURNING hub_id, user_id, joined_at`,
    [hubId, userId],
  );
  // If ON CONFLICT hit, the member already exists -- fetch it
  if (rows.length === 0) {
    const existing = await findOne(hubId, userId);
    return existing!;
  }
  return toMember(rows[0]!);
}

/**
 * Remove a user from a hub.
 *
 * @param hubId - Hub UUID.
 * @param userId - User UUID.
 * @returns True if the membership was deleted, false if it didn't exist.
 */
export async function remove(hubId: string, userId: string): Promise<boolean> {
  const rows = await query<MemberRow>(
    `DELETE FROM hub_members WHERE hub_id = $1 AND user_id = $2
     RETURNING hub_id, user_id, joined_at`,
    [hubId, userId],
  );
  return rows.length > 0;
}

/**
 * Check if a user is a member of a hub.
 *
 * @param hubId - Hub UUID.
 * @param userId - User UUID.
 * @returns The membership, or null if not a member.
 */
export async function findOne(hubId: string, userId: string): Promise<HubMember | null> {
  const row = await queryOne<MemberRow>(
    `SELECT hub_id, user_id, joined_at
     FROM hub_members WHERE hub_id = $1 AND user_id = $2`,
    [hubId, userId],
  );
  return row ? toMember(row) : null;
}

/**
 * List all members of a hub.
 *
 * @param hubId - Hub UUID.
 * @returns Array of memberships.
 */
export async function findByHubId(hubId: string): Promise<HubMember[]> {
  const rows = await query<MemberRow>(
    `SELECT hub_id, user_id, joined_at
     FROM hub_members WHERE hub_id = $1
     ORDER BY joined_at ASC`,
    [hubId],
  );
  return rows.map(toMember);
}

/** Member with joined user handle and optional avatar. */
export interface MemberWithUser {
  userId: string;
  handle: string;
  avatarUrl: string | undefined;
  joinedAt: string;
}

/**
 * List members of a hub with user handles (cursor-paginated).
 *
 * @param hubId - Hub UUID.
 * @param limit - Max rows to return.
 * @param cursor - ISO timestamp cursor for keyset pagination.
 * @returns Array of members with handles.
 */
export async function findByHub(hubId: string, limit = 100, cursor?: string): Promise<MemberWithUser[]> {
  const params: unknown[] = [hubId, limit];
  let sql = `SELECT hm.user_id, u.handle, u.avatar_url, hm.joined_at
    FROM hub_members hm
    INNER JOIN users u ON u.id = hm.user_id
    WHERE hm.hub_id = $1`;

  if (cursor) {
    params.push(cursor);
    sql += ` AND hm.joined_at < $${params.length}`;
  }

  sql += ` ORDER BY hm.joined_at DESC LIMIT $2`;

  const rows = await query<{ user_id: string; handle: string; avatar_url: string | null; joined_at: string }>(sql, params);
  return rows.map(r => ({ userId: r.user_id, handle: r.handle, avatarUrl: r.avatar_url ?? undefined, joinedAt: r.joined_at }));
}
