import { queryOne, query } from '@ripcord/db';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Row shape returned from the users table. */
interface UserRow {
  id: string;
  handle: string;
  avatar_url: string | null;
  status: string;
  created_at: string;
}

/** Domain representation used by route handlers. */
export interface UserRecord {
  id: string;
  handle: string;
  avatarUrl: string | undefined;
  status: string;
  createdAt: string;
}

/** Map a database row to the camelCase domain type. */
function toUser(row: UserRow): UserRecord {
  return {
    id: row.id,
    handle: row.handle,
    avatarUrl: row.avatar_url ?? undefined,
    status: row.status,
    createdAt: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Find a user by their primary key.
 *
 * @param id - User UUID.
 * @returns The user, or null if not found.
 */
export async function findById(id: string): Promise<UserRecord | null> {
  const row = await queryOne<UserRow>(
    `SELECT id, handle, avatar_url, status, created_at FROM users WHERE id = $1`,
    [id],
  );
  return row ? toUser(row) : null;
}

/**
 * Find a user by their handle (case-insensitive).
 *
 * @param handle - User handle string.
 * @returns The user, or null if not found.
 */
export async function findByHandle(handle: string): Promise<UserRecord | null> {
  const row = await queryOne<UserRow>(
    `SELECT id, handle, avatar_url, status, created_at FROM users WHERE LOWER(handle) = LOWER($1)`,
    [handle],
  );
  return row ? toUser(row) : null;
}

/**
 * Count total registered users.
 */
export async function countAll(): Promise<number> {
  const row = await queryOne<{ count: string }>(`SELECT COUNT(*) AS count FROM users`);
  return row ? parseInt(row.count, 10) : 0;
}

/**
 * Count users registered since a given date.
 */
export async function countSince(since: Date): Promise<number> {
  const row = await queryOne<{ count: string }>(
    `SELECT COUNT(*) AS count FROM users WHERE created_at >= $1`,
    [since.toISOString()],
  );
  return row ? parseInt(row.count, 10) : 0;
}

/**
 * Update a user's avatar URL (the storage key in MinIO).
 *
 * @param id - User UUID.
 * @param avatarUrl - Storage key for the avatar image, or null to remove.
 * @returns The updated user, or null if not found.
 */
export async function updateAvatarUrl(id: string, avatarUrl: string | null): Promise<UserRecord | null> {
  const row = await queryOne<UserRow>(
    `UPDATE users SET avatar_url = $2 WHERE id = $1
     RETURNING id, handle, avatar_url, status, created_at`,
    [id, avatarUrl],
  );
  return row ? toUser(row) : null;
}
