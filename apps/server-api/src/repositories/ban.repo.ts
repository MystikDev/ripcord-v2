import { query, queryOne } from '@ripcord/db';
import type { BannedMember } from '@ripcord/types';

interface BanRow {
  hub_id: string;
  user_id: string;
  banned_by: string;
  reason: string | null;
  banned_at: string;
}

function toBan(row: BanRow): BannedMember {
  return {
    hubId: row.hub_id,
    userId: row.user_id,
    bannedBy: row.banned_by,
    reason: row.reason ?? undefined,
    bannedAt: row.banned_at,
  };
}

export async function create(
  hubId: string,
  userId: string,
  bannedBy: string,
  reason?: string,
): Promise<BannedMember> {
  const rows = await query<BanRow>(
    `INSERT INTO hub_bans (hub_id, user_id, banned_by, reason)
     VALUES ($1, $2, $3, $4)
     RETURNING hub_id, user_id, banned_by, reason, banned_at`,
    [hubId, userId, bannedBy, reason ?? null],
  );
  return toBan(rows[0]!);
}

export async function remove(hubId: string, userId: string): Promise<void> {
  await query(`DELETE FROM hub_bans WHERE hub_id = $1 AND user_id = $2`, [hubId, userId]);
}

export async function findOne(hubId: string, userId: string): Promise<BannedMember | null> {
  const row = await queryOne<BanRow>(
    `SELECT hub_id, user_id, banned_by, reason, banned_at
     FROM hub_bans WHERE hub_id = $1 AND user_id = $2`,
    [hubId, userId],
  );
  return row ? toBan(row) : null;
}

export async function findByHub(hubId: string): Promise<BannedMember[]> {
  const rows = await query<BanRow>(
    `SELECT hub_id, user_id, banned_by, reason, banned_at
     FROM hub_bans WHERE hub_id = $1
     ORDER BY banned_at DESC`,
    [hubId],
  );
  return rows.map(toBan);
}
