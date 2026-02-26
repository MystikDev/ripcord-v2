import type { PoolClient } from 'pg';
import { query, queryOne } from '@ripcord/db';

/** Row shape returned by user queries. */
export interface UserRow {
  id: string;
  handle: string;
  email_hash: string | null;
  avatar_url: string | null;
  status: string;
  created_at: Date;
}

/**
 * Find a user by their unique handle.
 *
 * @param handle - The display handle to search for (case-sensitive).
 * @returns The user row if found, or `null`.
 */
export async function findByHandle(handle: string): Promise<UserRow | null> {
  return queryOne<UserRow>(
    'SELECT id, handle, email_hash, avatar_url, status, created_at FROM users WHERE handle = $1',
    [handle],
  );
}

/**
 * Find a user by primary key.
 *
 * @param id - UUIDv4 user ID.
 * @returns The user row if found, or `null`.
 */
export async function findById(id: string): Promise<UserRow | null> {
  return queryOne<UserRow>(
    'SELECT id, handle, email_hash, avatar_url, status, created_at FROM users WHERE id = $1',
    [id],
  );
}

/**
 * Create a new user inside an existing database transaction.
 *
 * @param client    - A transaction-bound PoolClient.
 * @param handle    - Unique display handle.
 * @param emailHash - Optional SHA-256 hash of the user's email.
 * @returns The newly created user row.
 */
export async function create(
  client: PoolClient,
  handle: string,
  emailHash?: string,
): Promise<UserRow> {
  const result = await client.query<UserRow>(
    `INSERT INTO users (handle, email_hash)
     VALUES ($1, $2)
     RETURNING id, handle, email_hash, avatar_url, status, created_at`,
    [handle, emailHash ?? null],
  );
  return result.rows[0]!;
}

// ---------------------------------------------------------------------------
// Password Auth
// ---------------------------------------------------------------------------

/** User row extended with the optional password hash. */
export interface UserRowWithPassword extends UserRow {
  password_hash: string | null;
}

/**
 * Create a new user with a password hash inside an existing transaction.
 *
 * @param client       - A transaction-bound PoolClient.
 * @param handle       - Unique display handle.
 * @param passwordHash - Argon2id hash of the user's password.
 * @param emailHash    - Optional SHA-256 hash of the user's email.
 * @returns The newly created user row.
 */
export async function createWithPassword(
  client: PoolClient,
  handle: string,
  passwordHash: string,
  emailHash?: string,
): Promise<UserRow> {
  const result = await client.query<UserRow>(
    `INSERT INTO users (handle, password_hash, email_hash)
     VALUES ($1, $2, $3)
     RETURNING id, handle, email_hash, avatar_url, status, created_at`,
    [handle, passwordHash, emailHash ?? null],
  );
  return result.rows[0]!;
}

/**
 * Create a new user with a password in `pending_verification` status.
 *
 * Stores the plaintext email (for sending verification codes) and email hash.
 *
 * @param client       - A transaction-bound PoolClient.
 * @param handle       - Unique display handle.
 * @param passwordHash - Argon2id hash of the user's password.
 * @param email        - Plaintext email (stored for sending verification codes).
 * @param emailHash    - SHA-256 hash of the email (for uniqueness checks).
 * @returns The newly created user row.
 */
export async function createWithPasswordPending(
  client: PoolClient,
  handle: string,
  passwordHash: string,
  email: string,
  emailHash?: string,
): Promise<UserRow> {
  const result = await client.query<UserRow>(
    `INSERT INTO users (handle, password_hash, email, email_hash, status)
     VALUES ($1, $2, $3, $4, 'pending_verification')
     RETURNING id, handle, email_hash, avatar_url, status, created_at`,
    [handle, passwordHash, email, emailHash ?? null],
  );
  return result.rows[0]!;
}

/**
 * Update a user's status (e.g. from `pending_verification` to `active`).
 *
 * @param client - A transaction-bound PoolClient.
 * @param userId - User ID to update.
 * @param status - New status value.
 */
export async function updateStatus(
  client: PoolClient,
  userId: string,
  status: string,
): Promise<void> {
  await client.query('UPDATE users SET status = $1 WHERE id = $2', [
    status,
    userId,
  ]);
}

/**
 * Retrieve the plaintext email for a user (used for sending verification codes).
 *
 * @param userId - User ID.
 * @returns The email address, or `null` if not set.
 */
export async function getEmail(userId: string): Promise<string | null> {
  const row = await queryOne<{ email: string | null }>(
    'SELECT email FROM users WHERE id = $1',
    [userId],
  );
  return row?.email ?? null;
}

/**
 * Find a user by handle, including the password_hash column.
 *
 * Used by the password login route to verify credentials.
 *
 * @param handle - The display handle to search for.
 * @returns The user row with password hash if found, or `null`.
 */
export async function findByHandleWithPassword(
  handle: string,
): Promise<UserRowWithPassword | null> {
  return queryOne<UserRowWithPassword>(
    `SELECT id, handle, email_hash, avatar_url, status, created_at, password_hash
     FROM users WHERE handle = $1`,
    [handle],
  );
}

/**
 * Update a user's password hash.
 *
 * Used by the password reset flow after verifying the 6-digit code.
 *
 * @param userId       - User ID.
 * @param passwordHash - New Argon2id hash.
 */
export async function updatePassword(
  userId: string,
  passwordHash: string,
): Promise<void> {
  await query(
    'UPDATE users SET password_hash = $1 WHERE id = $2',
    [passwordHash, userId],
  );
}
