-- 0014_message_pinning.sql
-- Adds support for pinning messages in channels.
-- ---------------------------------------------------------------------------

-- Add pin metadata columns to messages
ALTER TABLE messages ADD COLUMN pinned_at TIMESTAMPTZ;
ALTER TABLE messages ADD COLUMN pinned_by UUID REFERENCES users(id);

-- Index for efficiently querying pinned messages per channel
CREATE INDEX idx_messages_pinned ON messages(channel_id, pinned_at)
  WHERE pinned_at IS NOT NULL;
