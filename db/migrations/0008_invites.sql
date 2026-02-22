-- 0008_invites.sql
-- Hub invite links for the onboarding and invite system.

CREATE TABLE hub_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id UUID NOT NULL REFERENCES hubs(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  created_by UUID NOT NULL REFERENCES users(id),
  max_uses INT,
  uses INT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_hub_invites_code ON hub_invites(code);
CREATE INDEX idx_hub_invites_hub ON hub_invites(hub_id);
