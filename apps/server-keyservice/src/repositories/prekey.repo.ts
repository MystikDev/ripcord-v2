import type { PoolClient } from 'pg';
import { queryOne } from '@ripcord/db';

/** Row shape for a one-time prekey. */
interface PrekeyRow {
  id: string;
  user_id: string;
  device_id: string;
  prekey_pub: string;
  claimed_at: Date | null;
}

/**
 * Insert a batch of one-time pre-keys inside an existing transaction.
 *
 * @param client    - A transaction-bound PoolClient.
 * @param userId    - Owning user ID.
 * @param deviceId  - Owning device ID.
 * @param prekeyPubs - Array of Curve25519 public keys (base64).
 * @returns The number of pre-keys inserted.
 */
export async function insertBatch(
  client: PoolClient,
  userId: string,
  deviceId: string,
  prekeyPubs: string[],
): Promise<number> {
  if (prekeyPubs.length === 0) return 0;

  // Build a multi-row VALUES clause for batch insert
  const values: unknown[] = [];
  const placeholders: string[] = [];

  for (let i = 0; i < prekeyPubs.length; i++) {
    const offset = i * 3;
    placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3})`);
    values.push(userId, deviceId, prekeyPubs[i]);
  }

  await client.query(
    `INSERT INTO one_time_prekeys (user_id, device_id, prekey_pub)
     VALUES ${placeholders.join(', ')}`,
    values,
  );

  return prekeyPubs.length;
}

/**
 * Atomically claim one unclaimed pre-key for a target user/device.
 *
 * Uses `FOR UPDATE SKIP LOCKED` to prevent double-claims under
 * concurrent requests. The claimed key has its `claimed_at` set
 * to the current timestamp.
 *
 * @param userId   - Target user whose pre-key to claim.
 * @param deviceId - Target device whose pre-key to claim.
 * @returns The claimed pre-key public key (base64), or `null` if none remain.
 */
export async function claimOne(
  userId: string,
  deviceId: string,
): Promise<string | null> {
  const row = await queryOne<Pick<PrekeyRow, 'prekey_pub'>>(
    `UPDATE one_time_prekeys
     SET claimed_at = NOW()
     WHERE id = (
       SELECT id FROM one_time_prekeys
       WHERE user_id = $1 AND device_id = $2 AND claimed_at IS NULL
       ORDER BY id
       LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING prekey_pub`,
    [userId, deviceId],
  );
  return row?.prekey_pub ?? null;
}

/**
 * Count unclaimed one-time pre-keys for a user/device pair.
 *
 * @param userId   - User ID.
 * @param deviceId - Device ID.
 * @returns The number of unclaimed pre-keys.
 */
export async function countUnclaimed(
  userId: string,
  deviceId: string,
): Promise<number> {
  const row = await queryOne<{ count: string }>(
    `SELECT COUNT(*) AS count
     FROM one_time_prekeys
     WHERE user_id = $1 AND device_id = $2 AND claimed_at IS NULL`,
    [userId, deviceId],
  );
  return parseInt(row?.count ?? '0', 10);
}
