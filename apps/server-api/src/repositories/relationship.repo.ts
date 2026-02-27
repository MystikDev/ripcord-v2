import { query, queryOne } from '@ripcord/db';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RelationshipRow {
  id: string;
  user_id: string;
  target_id: string;
  type: 'pending' | 'accepted' | 'blocked';
  created_at: string;
}

export interface FriendInfo {
  userId: string;
  handle: string;
  avatarUrl: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Send a friend request from `userId` to `targetId`.
 * Inserts a single 'pending' row.
 * Throws if already exists or if either party has blocked the other.
 */
export async function sendRequest(userId: string, targetId: string): Promise<void> {
  // Check for blocks in either direction
  const blocked = await isBlocked(userId, targetId);
  if (blocked) throw new Error('BLOCKED');

  // Check for existing relationship
  const existing = await getRelationship(userId, targetId);
  if (existing) {
    if (existing.type === 'pending') throw new Error('ALREADY_PENDING');
    if (existing.type === 'accepted') throw new Error('ALREADY_FRIENDS');
  }

  // If the target already sent US a pending request, auto-accept
  const reverse = await queryOne<RelationshipRow>(
    `SELECT * FROM relationships WHERE user_id = $1 AND target_id = $2 AND type = 'pending'`,
    [targetId, userId],
  );
  if (reverse) {
    // Mutual accept: update their row to 'accepted' and insert ours as 'accepted'
    await query(
      `UPDATE relationships SET type = 'accepted' WHERE user_id = $1 AND target_id = $2 AND type = 'pending'`,
      [targetId, userId],
    );
    await query(
      `INSERT INTO relationships (user_id, target_id, type) VALUES ($1, $2, 'accepted')
       ON CONFLICT (user_id, target_id) DO UPDATE SET type = 'accepted'`,
      [userId, targetId],
    );
    return;
  }

  await query(
    `INSERT INTO relationships (user_id, target_id, type) VALUES ($1, $2, 'pending')`,
    [userId, targetId],
  );
}

/**
 * Accept a friend request. The caller (`userId`) is the recipient;
 * `fromUserId` is who sent the request.
 */
export async function acceptRequest(userId: string, fromUserId: string): Promise<void> {
  // Verify a pending request exists from fromUserId to userId
  const pending = await queryOne<RelationshipRow>(
    `SELECT * FROM relationships WHERE user_id = $1 AND target_id = $2 AND type = 'pending'`,
    [fromUserId, userId],
  );
  if (!pending) throw new Error('NO_PENDING_REQUEST');

  // Update sender's row to 'accepted'
  await query(
    `UPDATE relationships SET type = 'accepted' WHERE user_id = $1 AND target_id = $2`,
    [fromUserId, userId],
  );

  // Insert accepter's row as 'accepted'
  await query(
    `INSERT INTO relationships (user_id, target_id, type) VALUES ($1, $2, 'accepted')
     ON CONFLICT (user_id, target_id) DO UPDATE SET type = 'accepted'`,
    [userId, fromUserId],
  );
}

/**
 * Decline a friend request. Deletes the pending row.
 */
export async function declineRequest(userId: string, fromUserId: string): Promise<void> {
  await query(
    `DELETE FROM relationships WHERE user_id = $1 AND target_id = $2 AND type = 'pending'`,
    [fromUserId, userId],
  );
}

/**
 * Remove a friend. Deletes both accepted rows.
 */
export async function removeFriend(userId: string, targetId: string): Promise<void> {
  await query(
    `DELETE FROM relationships
     WHERE type = 'accepted'
       AND ((user_id = $1 AND target_id = $2) OR (user_id = $2 AND target_id = $1))`,
    [userId, targetId],
  );
}

/**
 * Block a user. Removes any existing relationship, then inserts a 'blocked' row.
 */
export async function blockUser(userId: string, targetId: string): Promise<void> {
  // Remove all existing rows between the two users
  await query(
    `DELETE FROM relationships
     WHERE (user_id = $1 AND target_id = $2) OR (user_id = $2 AND target_id = $1)`,
    [userId, targetId],
  );
  // Insert blocked row
  await query(
    `INSERT INTO relationships (user_id, target_id, type) VALUES ($1, $2, 'blocked')`,
    [userId, targetId],
  );
}

/**
 * Unblock a user. Deletes the blocked row.
 */
export async function unblockUser(userId: string, targetId: string): Promise<void> {
  await query(
    `DELETE FROM relationships WHERE user_id = $1 AND target_id = $2 AND type = 'blocked'`,
    [userId, targetId],
  );
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * List accepted friends for a user with their handle and avatar.
 */
export async function listFriends(userId: string): Promise<FriendInfo[]> {
  const rows = await query<{ target_id: string; handle: string; avatar_url: string | null; created_at: string }>(
    `SELECT r.target_id, u.handle, u.avatar_url, r.created_at
     FROM relationships r
     INNER JOIN users u ON u.id = r.target_id
     WHERE r.user_id = $1 AND r.type = 'accepted'
     ORDER BY u.handle ASC`,
    [userId],
  );
  return rows.map((r) => ({
    userId: r.target_id,
    handle: r.handle,
    avatarUrl: r.avatar_url,
    createdAt: r.created_at,
  }));
}

/**
 * List incoming pending friend requests (others → userId).
 */
export async function listPendingIncoming(userId: string): Promise<FriendInfo[]> {
  const rows = await query<{ user_id: string; handle: string; avatar_url: string | null; created_at: string }>(
    `SELECT r.user_id, u.handle, u.avatar_url, r.created_at
     FROM relationships r
     INNER JOIN users u ON u.id = r.user_id
     WHERE r.target_id = $1 AND r.type = 'pending'
     ORDER BY r.created_at DESC`,
    [userId],
  );
  return rows.map((r) => ({
    userId: r.user_id,
    handle: r.handle,
    avatarUrl: r.avatar_url,
    createdAt: r.created_at,
  }));
}

/**
 * List outgoing pending friend requests (userId → others).
 */
export async function listPendingOutgoing(userId: string): Promise<FriendInfo[]> {
  const rows = await query<{ target_id: string; handle: string; avatar_url: string | null; created_at: string }>(
    `SELECT r.target_id, u.handle, u.avatar_url, r.created_at
     FROM relationships r
     INNER JOIN users u ON u.id = r.target_id
     WHERE r.user_id = $1 AND r.type = 'pending'
     ORDER BY r.created_at DESC`,
    [userId],
  );
  return rows.map((r) => ({
    userId: r.target_id,
    handle: r.handle,
    avatarUrl: r.avatar_url,
    createdAt: r.created_at,
  }));
}

/**
 * List blocked users.
 */
export async function listBlocked(userId: string): Promise<FriendInfo[]> {
  const rows = await query<{ target_id: string; handle: string; avatar_url: string | null; created_at: string }>(
    `SELECT r.target_id, u.handle, u.avatar_url, r.created_at
     FROM relationships r
     INNER JOIN users u ON u.id = r.target_id
     WHERE r.user_id = $1 AND r.type = 'blocked'
     ORDER BY r.created_at DESC`,
    [userId],
  );
  return rows.map((r) => ({
    userId: r.target_id,
    handle: r.handle,
    avatarUrl: r.avatar_url,
    createdAt: r.created_at,
  }));
}

/**
 * Get the relationship row from userId → targetId (if any).
 */
export async function getRelationship(
  userId: string,
  targetId: string,
): Promise<RelationshipRow | null> {
  return queryOne<RelationshipRow>(
    `SELECT id, user_id, target_id, type, created_at
     FROM relationships
     WHERE user_id = $1 AND target_id = $2`,
    [userId, targetId],
  );
}

/**
 * Check if either user has blocked the other.
 */
export async function isBlocked(userId: string, targetId: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `SELECT id FROM relationships
     WHERE type = 'blocked'
       AND ((user_id = $1 AND target_id = $2) OR (user_id = $2 AND target_id = $1))
     LIMIT 1`,
    [userId, targetId],
  );
  return row !== null;
}
