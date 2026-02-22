import { query, queryOne } from '@ripcord/db';

/** Row shape returned by WebAuthn credential queries. */
export interface CredentialRow {
  id: string;
  user_id: string;
  credential_id: string;
  public_key: Buffer;
  counter: number;
  transports: string[] | null;
  device_name: string | null;
  created_at: Date;
  last_used_at: Date | null;
}

/**
 * Retrieve all WebAuthn credentials registered to a user.
 *
 * @param userId - UUIDv4 user ID.
 * @returns Array of credential rows (may be empty).
 */
export async function findByUserId(userId: string): Promise<CredentialRow[]> {
  return query<CredentialRow>(
    `SELECT id, user_id, credential_id, public_key, counter,
            transports, device_name, created_at, last_used_at
     FROM webauthn_credentials
     WHERE user_id = $1`,
    [userId],
  );
}

/**
 * Find a single WebAuthn credential by its credential ID.
 *
 * @param credentialId - The Base64URL-encoded credential identifier.
 * @returns The credential row if found, or `null`.
 */
export async function findByCredentialId(credentialId: string): Promise<CredentialRow | null> {
  return queryOne<CredentialRow>(
    `SELECT id, user_id, credential_id, public_key, counter,
            transports, device_name, created_at, last_used_at
     FROM webauthn_credentials
     WHERE credential_id = $1`,
    [credentialId],
  );
}

/**
 * Store a new WebAuthn credential.
 *
 * Typically called inside a registration transaction alongside user
 * and device creation.
 *
 * @param userId       - Owning user ID.
 * @param credentialId - Base64URL credential identifier from the authenticator.
 * @param publicKey    - COSE public key bytes.
 * @param counter      - Initial signature counter value.
 * @param transports   - Optional transport hints (e.g. "usb", "ble", "internal").
 * @param deviceName   - Optional human-readable label for the credential.
 */
export async function create(
  userId: string,
  credentialId: string,
  publicKey: Buffer,
  counter: number,
  transports?: string[],
  deviceName?: string,
): Promise<void> {
  await query(
    `INSERT INTO webauthn_credentials
       (user_id, credential_id, public_key, counter, transports, device_name)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, credentialId, publicKey, counter, transports ?? null, deviceName ?? null],
  );
}

/**
 * Update the signature counter after a successful authentication.
 *
 * The counter is a monotonically increasing value used to detect
 * cloned authenticators.
 *
 * @param credentialId - The credential to update.
 * @param newCounter   - The new counter value from the assertion.
 */
export async function updateCounter(credentialId: string, newCounter: number): Promise<void> {
  await query(
    `UPDATE webauthn_credentials
     SET counter = $1, last_used_at = now()
     WHERE credential_id = $2`,
    [newCounter, credentialId],
  );
}
