CREATE TABLE hub_bans (
  hub_id    UUID NOT NULL REFERENCES hubs(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  banned_by UUID NOT NULL REFERENCES users(id),
  reason    TEXT,
  banned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (hub_id, user_id)
);
CREATE INDEX idx_hub_bans_hub ON hub_bans(hub_id);
