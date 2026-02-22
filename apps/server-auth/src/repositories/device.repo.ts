import type { PoolClient } from 'pg';
import { queryOne } from '@ripcord/db';

/** Row shape returned by device queries. */
export interface DeviceRow {
  id: string;
  user_id: string;
  device_name: string;
  pub_identity_key: string;
  created_at: Date;
  revoked_at: Date | null;
}

/**
 * Find a device by its owner and public identity key.
 *
 * Used during login to check whether the device is already registered.
 *
 * @param userId         - Owning user ID.
 * @param pubIdentityKey - Curve25519 public identity key (base64).
 * @returns The device row if found, or `null`.
 */
export async function findByUserIdAndKey(
  userId: string,
  pubIdentityKey: string,
): Promise<DeviceRow | null> {
  return queryOne<DeviceRow>(
    `SELECT id, user_id, device_name, pub_identity_key, created_at, revoked_at
     FROM devices
     WHERE user_id = $1 AND pub_identity_key = $2`,
    [userId, pubIdentityKey],
  );
}

/**
 * Register a new device inside an existing database transaction.
 *
 * @param client         - A transaction-bound PoolClient.
 * @param userId         - Owning user ID.
 * @param deviceName     - Human-readable label (e.g. "MacBook Pro").
 * @param pubIdentityKey - Curve25519 public identity key (base64).
 * @returns The newly created device row.
 */
export async function create(
  client: PoolClient,
  userId: string,
  deviceName: string,
  pubIdentityKey: string,
): Promise<DeviceRow> {
  const result = await client.query<DeviceRow>(
    `INSERT INTO devices (user_id, device_name, pub_identity_key)
     VALUES ($1, $2, $3)
     RETURNING id, user_id, device_name, pub_identity_key, created_at, revoked_at`,
    [userId, deviceName, pubIdentityKey],
  );
  return result.rows[0]!;
}
