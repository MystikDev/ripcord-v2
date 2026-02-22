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
