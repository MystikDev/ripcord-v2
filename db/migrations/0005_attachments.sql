-- 0005_attachments.sql
-- Encrypted file attachments stored in MinIO (S3-compatible object storage).
--
-- Files are encrypted client-side with AES-256-GCM before upload. The server
-- only stores encrypted bytes and metadata (encrypted filename, key ID, nonce).
-- storage_key is the MinIO object key (e.g. "{channelId}/{uuid}").

CREATE TABLE attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  uploader_user_id UUID NOT NULL REFERENCES users(id),
  file_name_encrypted TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  content_type_encrypted TEXT,
  storage_key TEXT NOT NULL UNIQUE,
  encryption_key_id TEXT NOT NULL,
  nonce TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_attachments_message ON attachments(message_id);
