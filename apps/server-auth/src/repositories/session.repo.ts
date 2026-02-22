import { query, queryOne } from '@ripcord/db';

/** Row shape returned by session queries. */
export interface SessionRow {
  id: string;
  user_id: string;
  device_id: string | null;
  refresh_hash: string;
  ip_hash: string | null;
  ua_hash: string | null;
  created_at: Date;
  expires_at: Date;
  revoked_at: Date | null;
  token_family: string;
  generation: number;
  last_rotated_at: Date;
}

/**
 * Create a new refresh-token session.
 *
 * @param userId      - Owning user ID.
 * @param deviceId    - Device this session is bound to.
 * @param refreshHash - SHA-256 hash of the refresh token.
 * @param expiresAt   - Session expiry timestamp.
 * @param tokenFamily - UUID identifying the token rotation family.
 * @param ipHash      - Optional hashed client IP.
 * @param uaHash      - Optional hashed User-Agent string.
 * @returns The newly created session row.
 */
export async function create(
  userId: string,
  deviceId: string,
  refreshHash: string,
  expiresAt: Date,
  tokenFamily: string,
  ipHash?: string,
  uaHash?: string,
): Promise<SessionRow> {
  const row = await queryOne<SessionRow>(
    `INSERT INTO sessions
       (user_id, device_id, refresh_hash, expires_at, token_family, ip_hash, ua_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [userId, deviceId, refreshHash, expiresAt, tokenFamily, ipHash ?? null, uaHash ?? null],
  );
  return row!;
}

/**
 * Look up a session by the SHA-256 hash of its current refresh token.
 *
 * @param hash - SHA-256 hex digest of the refresh token.
 * @returns The session row if found, or `null`.
 */
export async function findByRefreshHash(hash: string): Promise<SessionRow | null> {
  return queryOne<SessionRow>(
    'SELECT * FROM sessions WHERE refresh_hash = $1',
    [hash],
  );
}

/**
 * Retrieve all active (non-revoked, non-expired) sessions for a user.
 *
 * @param userId - UUIDv4 user ID.
 * @returns Array of active session rows.
 */
export async function findActiveByUserId(userId: string): Promise<SessionRow[]> {
  return query<SessionRow>(
    `SELECT * FROM sessions
     WHERE user_id = $1
       AND revoked_at IS NULL
       AND expires_at > now()
     ORDER BY created_at DESC`,
    [userId],
  );
}

/**
 * Revoke a session by setting its `revoked_at` timestamp to now.
 *
 * @param sessionId - UUIDv4 session ID.
 */
export async function revokeById(sessionId: string): Promise<void> {
  await query(
    'UPDATE sessions SET revoked_at = now() WHERE id = $1',
    [sessionId],
  );
}

/**
 * Revoke ALL sessions sharing a token family.
 *
 * Called when refresh-token reuse is detected to invalidate the
 * entire compromised token chain.
 *
 * @param tokenFamily - UUID of the token family to revoke.
 */
export async function revokeByTokenFamily(tokenFamily: string): Promise<void> {
  await query(
    'UPDATE sessions SET revoked_at = now() WHERE token_family = $1 AND revoked_at IS NULL',
    [tokenFamily],
  );
}

/**
 * Rotate the refresh token for an existing session.
 *
 * Atomically updates the hash, increments the generation counter,
 * and refreshes the `last_rotated_at` timestamp.
 *
 * @param sessionId      - Session to rotate.
 * @param newRefreshHash - SHA-256 hash of the new refresh token.
 * @param newGeneration  - The new generation number (previous + 1).
 */
export async function rotateRefreshToken(
  sessionId: string,
  newRefreshHash: string,
  newGeneration: number,
): Promise<void> {
  await query(
    `UPDATE sessions
     SET refresh_hash = $1, generation = $2, last_rotated_at = now()
     WHERE id = $3`,
    [newRefreshHash, newGeneration, sessionId],
  );
}
