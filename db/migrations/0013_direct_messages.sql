-- 0013_direct_messages.sql
-- Adds support for direct messages (DM) between users.
-- DM channels are channels with hub_id = NULL.
-- ---------------------------------------------------------------------------

-- Allow channels without a hub (DM channels)
ALTER TABLE channels ALTER COLUMN hub_id DROP NOT NULL;

-- DM participants join table
CREATE TABLE dm_participants (
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (channel_id, user_id)
);

-- Index for listing a user's DMs efficiently
CREATE INDEX idx_dm_participants_user ON dm_participants(user_id);
