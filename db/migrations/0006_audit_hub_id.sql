-- Add hub_id column to audit_events for per-hub audit log queries.
-- Nullable because some events (USER_REGISTER, USER_LOGIN, etc.) are global.
ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS hub_id UUID REFERENCES hubs(id) ON DELETE SET NULL;

-- Index for efficient per-hub audit log lookups with cursor pagination.
CREATE INDEX IF NOT EXISTS idx_audit_events_hub_created
  ON audit_events(hub_id, created_at DESC, id DESC)
  WHERE hub_id IS NOT NULL;
