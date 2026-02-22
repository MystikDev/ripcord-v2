CREATE TABLE read_states (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  last_read_message_id UUID REFERENCES messages(id),
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  mention_count INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, channel_id)
);
CREATE INDEX idx_read_states_user ON read_states(user_id);
