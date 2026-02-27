-- 0018_friends.sql
-- Adds user-to-user relationships: friend requests, accepted friends, blocks.

CREATE TABLE IF NOT EXISTS relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  target_id UUID NOT NULL REFERENCES users(id),
  type TEXT NOT NULL CHECK (type IN ('pending', 'accepted', 'blocked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, target_id)
);

CREATE INDEX IF NOT EXISTS idx_relationships_user ON relationships(user_id);
CREATE INDEX IF NOT EXISTS idx_relationships_target ON relationships(target_id);
