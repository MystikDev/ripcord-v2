import type { PoolClient } from 'pg';
import { queryOne } from '@ripcord/db';
import type { KeyBundle } from '@ripcord/types';

/** Row shape returned by key_bundles queries. */
interface BundleRow {
  user_id: string;
  device_id: string;
  identity_pub: string;
  signed_prekey_pub: string;
  signed_prekey_sig: string;
  uploaded_at: Date;
}

/**
 * Map a snake_case database row to a camelCase {@link KeyBundle}.
 */
function toKeyBundle(row: BundleRow): KeyBundle {
  return {
    userId: row.user_id,
    deviceId: row.device_id,
    identityPub: row.identity_pub,
    signedPrekeyPub: row.signed_prekey_pub,
    signedPrekeySig: row.signed_prekey_sig,
    uploadedAt: row.uploaded_at.toISOString(),
  };
}

/**
 * Upsert a key bundle inside an existing transaction.
 *
 * If a bundle already exists for the (user_id, device_id) pair, all
 * key fields are replaced. Otherwise a new row is inserted.
 *
 * @param client         - A transaction-bound PoolClient.
 * @param userId         - Owning user ID.
 * @param deviceId       - Owning device ID.
 * @param identityPub    - Curve25519 identity public key (base64).
 * @param signedPrekeyPub - Curve25519 signed pre-key public key (base64).
 * @param signedPrekeySig - Ed25519 signature of the signed pre-key (base64).
 * @returns The upserted {@link KeyBundle}.
 */
export async function upsert(
  client: PoolClient,
  userId: string,
  deviceId: string,
  identityPub: string,
  signedPrekeyPub: string,
  signedPrekeySig: string,
): Promise<KeyBundle> {
  const result = await client.query<BundleRow>(
    `INSERT INTO key_bundles (user_id, device_id, identity_pub, signed_prekey_pub, signed_prekey_sig)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, device_id) DO UPDATE
       SET identity_pub = EXCLUDED.identity_pub,
           signed_prekey_pub = EXCLUDED.signed_prekey_pub,
           signed_prekey_sig = EXCLUDED.signed_prekey_sig,
           uploaded_at = NOW()
     RETURNING user_id, device_id, identity_pub, signed_prekey_pub, signed_prekey_sig, uploaded_at`,
    [userId, deviceId, identityPub, signedPrekeyPub, signedPrekeySig],
  );
  return toKeyBundle(result.rows[0]!);
}

/**
 * Fetch a key bundle by user ID and device ID.
 *
 * @param userId   - Target user ID.
 * @param deviceId - Target device ID.
 * @returns The {@link KeyBundle} if found, or `null`.
 */
export async function findByUserAndDevice(
  userId: string,
  deviceId: string,
): Promise<KeyBundle | null> {
  const row = await queryOne<BundleRow>(
    `SELECT user_id, device_id, identity_pub, signed_prekey_pub, signed_prekey_sig, uploaded_at
     FROM key_bundles
     WHERE user_id = $1 AND device_id = $2`,
    [userId, deviceId],
  );
  return row ? toKeyBundle(row) : null;
}

/**
 * Rotate the signed pre-key for an existing bundle inside a transaction.
 *
 * Only updates the signed pre-key fields and the uploaded_at timestamp.
 * The identity key is immutable and never changed during rotation.
 *
 * @param client          - A transaction-bound PoolClient.
 * @param userId          - Owning user ID.
 * @param deviceId        - Owning device ID.
 * @param signedPrekeyPub - New signed pre-key public key (base64).
 * @param signedPrekeySig - New signature of the signed pre-key (base64).
 * @returns The updated {@link KeyBundle}, or `null` if no bundle exists.
 */
export async function rotateSignedPrekey(
  client: PoolClient,
  userId: string,
  deviceId: string,
  signedPrekeyPub: string,
  signedPrekeySig: string,
): Promise<KeyBundle | null> {
  const result = await client.query<BundleRow>(
    `UPDATE key_bundles
     SET signed_prekey_pub = $3,
         signed_prekey_sig = $4,
         uploaded_at = NOW()
     WHERE user_id = $1 AND device_id = $2
     RETURNING user_id, device_id, identity_pub, signed_prekey_pub, signed_prekey_sig, uploaded_at`,
    [userId, deviceId, signedPrekeyPub, signedPrekeySig],
  );
  const row = result.rows[0];
  return row ? toKeyBundle(row) : null;
}
