import { query } from '@ripcord/db';

export interface ReadState {
  userId: string;
  channelId: string;
  lastReadMessageId: string | null;
  lastReadAt: string;
  mentionCount: number;
}

/** Upsert a read state (marks channel as read up to messageId). */
export async function upsert(
  userId: string,
  channelId: string,
  messageId: string,
): Promise<ReadState> {
  const rows = await query<ReadState>(
    `INSERT INTO read_states (user_id, channel_id, last_read_message_id, last_read_at, mention_count)
     VALUES ($1, $2, $3, now(), 0)
     ON CONFLICT (user_id, channel_id) DO UPDATE SET
       last_read_message_id = EXCLUDED.last_read_message_id,
       last_read_at = now(),
       mention_count = 0
     RETURNING
       user_id AS "userId",
       channel_id AS "channelId",
       last_read_message_id AS "lastReadMessageId",
       last_read_at AS "lastReadAt",
       mention_count AS "mentionCount"`,
    [userId, channelId, messageId],
  );
  return rows[0]!;
}

/** Fetch all read states for a user (used to compute unread badges). */
export async function findByUser(userId: string): Promise<ReadState[]> {
  return query<ReadState>(
    `SELECT
       user_id AS "userId",
       channel_id AS "channelId",
       last_read_message_id AS "lastReadMessageId",
       last_read_at AS "lastReadAt",
       mention_count AS "mentionCount"
     FROM read_states
     WHERE user_id = $1`,
    [userId],
  );
}
