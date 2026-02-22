import { query } from '@ripcord/db';

export interface AttachmentRow {
  id: string;
  messageId: string;
  channelId: string;
  uploaderUserId: string;
  fileNameEncrypted: string;
  fileSize: number;
  contentTypeEncrypted: string | null;
  storageKey: string;
  encryptionKeyId: string;
  nonce: string;
  createdAt: string;
}

/** Create a pending attachment record. */
export async function create(params: {
  messageId: string;
  channelId: string;
  uploaderUserId: string;
  fileNameEncrypted: string;
  fileSize: number;
  contentTypeEncrypted: string | null;
  storageKey: string;
  encryptionKeyId: string;
  nonce: string;
}): Promise<AttachmentRow> {
  const rows = await query<AttachmentRow>(
    `INSERT INTO attachments (
      message_id, channel_id, uploader_user_id, file_name_encrypted,
      file_size, content_type_encrypted, storage_key, encryption_key_id, nonce
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING
      id, message_id AS "messageId", channel_id AS "channelId",
      uploader_user_id AS "uploaderUserId",
      file_name_encrypted AS "fileNameEncrypted",
      file_size AS "fileSize",
      content_type_encrypted AS "contentTypeEncrypted",
      storage_key AS "storageKey",
      encryption_key_id AS "encryptionKeyId",
      nonce, created_at AS "createdAt"`,
    [
      params.messageId, params.channelId, params.uploaderUserId,
      params.fileNameEncrypted, params.fileSize, params.contentTypeEncrypted,
      params.storageKey, params.encryptionKeyId, params.nonce,
    ],
  );
  return rows[0]!;
}

/** Find attachment by ID. */
export async function findById(id: string): Promise<AttachmentRow | undefined> {
  const rows = await query<AttachmentRow>(
    `SELECT id, message_id AS "messageId", channel_id AS "channelId",
      uploader_user_id AS "uploaderUserId",
      file_name_encrypted AS "fileNameEncrypted",
      file_size AS "fileSize",
      content_type_encrypted AS "contentTypeEncrypted",
      storage_key AS "storageKey",
      encryption_key_id AS "encryptionKeyId",
      nonce, created_at AS "createdAt"
    FROM attachments WHERE id = $1`,
    [id],
  );
  return rows[0];
}

/** Find all attachments for a message. */
export async function findByMessageId(messageId: string): Promise<AttachmentRow[]> {
  return query<AttachmentRow>(
    `SELECT id, message_id AS "messageId", channel_id AS "channelId",
      uploader_user_id AS "uploaderUserId",
      file_name_encrypted AS "fileNameEncrypted",
      file_size AS "fileSize",
      content_type_encrypted AS "contentTypeEncrypted",
      storage_key AS "storageKey",
      encryption_key_id AS "encryptionKeyId",
      nonce, created_at AS "createdAt"
    FROM attachments WHERE message_id = $1
    ORDER BY created_at ASC`,
    [messageId],
  );
}
