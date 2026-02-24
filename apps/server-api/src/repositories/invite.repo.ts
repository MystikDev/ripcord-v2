import { query, queryOne } from '@ripcord/db';
import crypto from 'node:crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InviteRow {
  id: string;
  hub_id: string;
  code: string;
  created_by: string;
  max_uses: number | null;
  uses: number;
  expires_at: string | null;
  created_at: string;
}

export interface Invite {
  id: string;
  hubId: string;
  code: string;
  createdBy: string;
  maxUses: number | null;
  uses: number;
  expiresAt: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toInvite(row: InviteRow): Invite {
  return {
    id: row.id,
    hubId: row.hub_id,
    code: row.code,
    createdBy: row.created_by,
    maxUses: row.max_uses,
    uses: row.uses,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

/** Generate a random 8-character alphanumeric invite code. */
function generateCode(): string {
  return crypto.randomBytes(6).toString('base64url').slice(0, 8);
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/**
 * Create a new invite for a hub.
 */
export async function create(
  hubId: string,
  createdBy: string,
  maxUses?: number,
  expiresAt?: string,
): Promise<Invite> {
  const code = generateCode();
  const rows = await query<InviteRow>(
    `INSERT INTO hub_invites (hub_id, code, created_by, max_uses, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, hub_id, code, created_by, max_uses, uses, expires_at, created_at`,
    [hubId, code, createdBy, maxUses ?? null, expiresAt ?? null],
  );
  return toInvite(rows[0]!);
}

/**
 * Find an invite by its code.
 */
export async function findByCode(code: string): Promise<Invite | null> {
  const row = await queryOne<InviteRow>(
    `SELECT id, hub_id, code, created_by, max_uses, uses, expires_at, created_at
     FROM hub_invites WHERE code = $1`,
    [code],
  );
  return row ? toInvite(row) : null;
}

/**
 * Find all invites for a hub.
 */
export async function findByHub(hubId: string): Promise<Invite[]> {
  const rows = await query<InviteRow>(
    `SELECT id, hub_id, code, created_by, max_uses, uses, expires_at, created_at
     FROM hub_invites WHERE hub_id = $1
     ORDER BY created_at DESC`,
    [hubId],
  );
  return rows.map(toInvite);
}

/**
 * Atomically claim a use of this invite.
 *
 * Increments `uses` only if the invite has not yet reached `max_uses`
 * (or `max_uses` is NULL, meaning unlimited). Returns the updated row
 * if the claim succeeded, or `null` if the invite was already exhausted
 * (race-condition safe).
 */
export async function claimUse(inviteId: string): Promise<Invite | null> {
  const rows = await query<InviteRow>(
    `UPDATE hub_invites
       SET uses = uses + 1
     WHERE id = $1
       AND (max_uses IS NULL OR uses < max_uses)
     RETURNING id, hub_id, code, created_by, max_uses, uses, expires_at, created_at`,
    [inviteId],
  );
  return rows[0] ? toInvite(rows[0]) : null;
}

/**
 * Delete an invite by its ID.
 */
export async function deleteInvite(inviteId: string): Promise<void> {
  await query(`DELETE FROM hub_invites WHERE id = $1`, [inviteId]);
}
