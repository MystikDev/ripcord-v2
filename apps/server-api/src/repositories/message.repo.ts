import { query, queryOne } from '@ripcord/db';
import type { EncryptedEnvelope } from '@ripcord/types';

/** Row shape returned from the messages table. */
export interface MessageRow {
  id: string;
  channel_id: string;
  sender_user_id: string;
  sender_device_id: string;
  envelope_jsonb: unknown;
  created_at: string;
  deleted_at: string | null;
}

/** Domain representation of a persisted message. */
export interface Message {
  id: string;
  channelId: string;
  senderUserId: string;
  senderDeviceId: string;
  envelope: EncryptedEnvelope;
  createdAt: string;
  deletedAt: string | null;
}

/** Map a database row to the camelCase domain type. */
function toMessage(row: MessageRow): Message {
  return {
    id: row.id,
    channelId: row.channel_id,
    senderUserId: row.sender_user_id,
    senderDeviceId: row.sender_device_id,
    envelope: row.envelope_jsonb as EncryptedEnvelope,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
  };
}

/**
 * Persist a new message to the database.
 *
 * The envelope is stored as opaque JSONB -- the server never inspects
 * or decrypts its contents.
 *
 * @param channelId - Target channel UUID.
 * @param senderUserId - Sender user UUID.
 * @param senderDeviceId - Sender device UUID.
 * @param envelope - The encrypted message envelope.
 * @returns The persisted message.
 */
export async function create(
  channelId: string,
  senderUserId: string,
  senderDeviceId: string,
  envelope: EncryptedEnvelope,
): Promise<Message> {
  const rows = await query<MessageRow>(
    `INSERT INTO messages (channel_id, sender_user_id, sender_device_id, envelope_jsonb)
     VALUES ($1, $2, $3, $4)
     RETURNING id, channel_id, sender_user_id, sender_device_id, envelope_jsonb, created_at, deleted_at`,
    [channelId, senderUserId, senderDeviceId, JSON.stringify(envelope)],
  );
  return toMessage(rows[0]!);
}

/**
 * Find a message by its primary key.
 *
 * @param id - Message UUID.
 * @returns The message, or null if not found.
 */
export async function findById(id: string): Promise<Message | null> {
  const row = await queryOne<MessageRow>(
    `SELECT id, channel_id, sender_user_id, sender_device_id, envelope_jsonb, created_at, deleted_at
     FROM messages WHERE id = $1`,
    [id],
  );
  return row ? toMessage(row) : null;
}

/**
 * Fetch messages from a channel using cursor-based pagination.
 *
 * Messages are returned in descending chronological order.
 * If a cursor (message ID) is provided, only messages created before
 * the cursor's timestamp are returned.
 *
 * @param channelId - Channel UUID.
 * @param limit - Maximum number of messages to return.
 * @param cursor - Optional message ID to paginate from.
 * @returns Array of messages.
 */
export async function findByChannel(
  channelId: string,
  limit: number,
  cursor?: string,
): Promise<Message[]> {
  if (cursor) {
    const rows = await query<MessageRow>(
      `SELECT m.id, m.channel_id, m.sender_user_id, m.sender_device_id,
              m.envelope_jsonb, m.created_at, m.deleted_at
       FROM messages m
       WHERE m.channel_id = $1
         AND m.deleted_at IS NULL
         AND m.created_at < (SELECT created_at FROM messages WHERE id = $2)
       ORDER BY m.created_at DESC
       LIMIT $3`,
      [channelId, cursor, limit],
    );
    return rows.map(toMessage);
  }

  const rows = await query<MessageRow>(
    `SELECT id, channel_id, sender_user_id, sender_device_id,
            envelope_jsonb, created_at, deleted_at
     FROM messages
     WHERE channel_id = $1 AND deleted_at IS NULL
     ORDER BY created_at DESC
     LIMIT $2`,
    [channelId, limit],
  );
  return rows.map(toMessage);
}
