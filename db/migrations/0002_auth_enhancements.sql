-- WebAuthn credential storage for passkey authentication
CREATE TABLE IF NOT EXISTS webauthn_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id TEXT UNIQUE NOT NULL,
  public_key BYTEA NOT NULL,
  counter BIGINT NOT NULL DEFAULT 0,
  transports TEXT[],
  device_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_webauthn_user ON webauthn_credentials(user_id);

-- Refresh token family tracking for reuse detection
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS token_family UUID DEFAULT gen_random_uuid();
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS generation INT NOT NULL DEFAULT 0;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_rotated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Index for looking up active sessions by user
CREATE INDEX IF NOT EXISTS idx_sessions_user_active
  ON sessions(user_id) WHERE revoked_at IS NULL;

-- Index for token family lookups (reuse detection)
CREATE INDEX IF NOT EXISTS idx_sessions_token_family
  ON sessions(token_family);

-- Index for unclaimed prekeys
CREATE INDEX IF NOT EXISTS idx_prekeys_unclaimed
  ON one_time_prekeys(user_id, device_id) WHERE claimed_at IS NULL;

-- Server membership table (needed for join/leave/member list)
CREATE TABLE IF NOT EXISTS server_members (
  server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (server_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_server_members_user ON server_members(user_id);

-- Channel permission overrides
CREATE TABLE IF NOT EXISTS channel_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('role', 'member')),
  target_id UUID NOT NULL,
  allow_bitset BIGINT NOT NULL DEFAULT 0,
  deny_bitset BIGINT NOT NULL DEFAULT 0,
  UNIQUE (channel_id, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS idx_channel_overrides_channel ON channel_overrides(channel_id);
