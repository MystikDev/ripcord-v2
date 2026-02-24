-- 0001_init.sql
-- Initial Ripcord database schema.
--
-- Sets up the core data model: users, devices (E2EE identity keys),
-- sessions (JWT refresh tracking), hubs (originally "servers"), channels,
-- RBAC (roles + member_roles), messages, E2EE key bundles, and audit log.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Users & authentication
-- ---------------------------------------------------------------------------

-- Core user identity. Handle is the public display name, email_hash is a
-- one-way hash used for uniqueness checks without storing plaintext emails.
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  handle TEXT UNIQUE NOT NULL,
  email_hash TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Each user can have multiple devices, each with its own E2EE identity key.
-- Revoking a device invalidates its key bundle and prevents further E2EE sessions.
CREATE TABLE devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_name TEXT NOT NULL,
  pub_identity_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);

-- JWT refresh token sessions. Each session tracks the device, a hashed
-- refresh token, and IP/UA hashes for anomaly detection.
-- Soft-deleted via revoked_at (never hard-deleted for audit trail).
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id UUID REFERENCES devices(id) ON DELETE SET NULL,
  refresh_hash TEXT NOT NULL,
  ip_hash TEXT,
  ua_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);

-- ---------------------------------------------------------------------------
-- Hubs & channels
-- ---------------------------------------------------------------------------

-- A hub is a community space (like a Discord server).
-- Renamed from "servers" to "hubs" in migration 0003.
CREATE TABLE servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_user_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Channels belong to a hub. Type is 'text' or 'voice'.
-- is_private controls whether the channel is hidden from non-permitted members.
CREATE TABLE channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  is_private BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Role-based access control (RBAC)
-- ---------------------------------------------------------------------------

-- Roles define permission sets via a bitfield (bitset_permissions).
-- Priority determines override order -- higher priority roles win.
-- Every hub auto-creates an @everyone role at priority 0.
CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  priority INT NOT NULL,
  bitset_permissions BIGINT NOT NULL DEFAULT 0
);

-- Join table: assigns roles to members within a hub.
CREATE TABLE member_roles (
  server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (server_id, user_id, role_id)
);

-- ---------------------------------------------------------------------------
-- Messages
-- ---------------------------------------------------------------------------

-- Messages store E2EE-encrypted content in envelope_jsonb (ciphertext,
-- sender key ID, nonce, etc.). The server never sees plaintext.
-- Soft-deleted via deleted_at to preserve message IDs for read states.
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  sender_user_id UUID NOT NULL REFERENCES users(id),
  sender_device_id UUID REFERENCES devices(id),
  envelope_jsonb JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Efficient cursor-based pagination: newest messages first per channel.
CREATE INDEX idx_messages_channel_created ON messages(channel_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- E2EE key exchange (X3DH-style)
-- ---------------------------------------------------------------------------

-- Per-device key bundle: identity key + signed prekey for X3DH handshake.
-- Uploaded when a device registers; refreshed periodically.
CREATE TABLE key_bundles (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  identity_pub TEXT NOT NULL,
  signed_prekey_pub TEXT NOT NULL,
  signed_prekey_sig TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, device_id)
);

-- One-time prekeys consumed during X3DH key agreement.
-- claimed_at is set when another user initiates a session with this key.
CREATE TABLE one_time_prekeys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  prekey_pub TEXT NOT NULL,
  claimed_at TIMESTAMPTZ
);

-- ---------------------------------------------------------------------------
-- Audit log
-- ---------------------------------------------------------------------------

-- Immutable event log for security-sensitive actions (login, role changes,
-- bans, etc.). actor/target pattern enables flexible querying.
-- metadata_jsonb holds action-specific details (e.g. old/new values).
CREATE TABLE audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES users(id),
  actor_device_id UUID REFERENCES devices(id),
  action TEXT NOT NULL,
  target_type TEXT,
  target_id UUID,
  metadata_jsonb JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
