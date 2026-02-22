-- Add avatar support for user profiles.
-- Mirrors the hub icon pattern from 0009_hub_icon.sql.
-- Stores a MinIO storage key (e.g. "user-avatars/{userId}/{uuid}.jpg").
ALTER TABLE users ADD COLUMN avatar_url TEXT;
